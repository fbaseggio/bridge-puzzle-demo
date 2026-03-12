#!/usr/bin/env python3
import argparse
import datetime as dt
import json
import os
import re
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Tuple

try:
    from tools.dd_env import has_endplay
except Exception:
    from dd_env import has_endplay


ROOT = Path(__file__).resolve().parents[1]
POLICY_MOVIE = ROOT / "tools" / "policy_movie.py"
DD_COMPACT = ROOT / "tools" / "dd_runtime_compact.py"
DD_DATA_DIR = ROOT / "src" / "data" / "dd"
DD_LOG_DIR = ROOT / "logs" / "dd_maintenance"


def ts_now() -> str:
    return dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def progress(msg: str) -> None:
    print(f"{ts_now()}  {msg}")


def run_json_command(cmd: List[str], stdin_obj: dict) -> dict:
    proc = subprocess.run(
        cmd,
        input=json.dumps(stdin_obj),
        text=True,
        capture_output=True,
        cwd=ROOT,
        check=True,
    )
    out = json.loads(proc.stdout.strip())
    if not out.get("ok"):
        raise RuntimeError(out.get("error", {}).get("message", "unknown problem_cli error"))
    return out


def list_problem_ids() -> Tuple[List[str], List[str]]:
    out = run_json_command(["npx", "vite-node", "src/cli/problem_cli.ts"], {"mode": "list"})
    problems = out.get("problems")
    if isinstance(problems, list):
        active: List[str] = []
        skipped: List[str] = []
        for item in problems:
            if not isinstance(item, dict):
                continue
            pid = item.get("id")
            status = item.get("status", "active")
            if not isinstance(pid, str):
                continue
            if status == "underConstruction":
                skipped.append(pid)
            else:
                active.append(pid)
        if active or skipped:
            return sorted(active), sorted(skipped)

    ids = out.get("problemIds")
    if not isinstance(ids, list) or not all(isinstance(v, str) for v in ids):
        raise RuntimeError("problem_cli list response missing valid problem metadata")
    return sorted(ids), []


def run_capture_lines(cmd: List[str], log_fh, label: str, *, echo_profile_progress: bool = False) -> List[str]:
    log_fh.write(f"\n=== {label} ===\n")
    log_fh.write(f"$ {' '.join(cmd)}\n")
    log_fh.flush()
    proc = subprocess.Popen(
        cmd,
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=1,
    )
    lines: List[str] = []
    if proc.stdout is None:
        raise RuntimeError(f"Failed to capture output during {label}")
    for raw in proc.stdout:
        line = raw.rstrip("\n")
        lines.append(line)
        log_fh.write(raw)
        if not raw.endswith("\n"):
            log_fh.write("\n")
        log_fh.flush()
        if echo_profile_progress and ("[PROFILE]" in line or line.startswith("PROFILE ")):
            print(line, flush=True)
    rc = proc.wait()
    if rc != 0:
        raise RuntimeError(f"Command failed ({rc}) during {label}")
    return lines


def refresh_problem_dd(
    problem_id: str,
    log_fh,
    *,
    traversal_dd_source: str,
    ts_dd_trace: bool,
    profile: bool,
    run_lines: bool,
) -> Dict[str, Any]:
    DD_DATA_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(prefix=f"{problem_id}_dd_", suffix=".jsonl", delete=False) as tmp:
        tmp_jsonl = tmp.name
    try:
        export_t0 = time.perf_counter()
        export_cmd = [
            "python3",
            "-u",
            str(POLICY_MOVIE),
            "--problem-id",
            problem_id,
            "--enumerate",
            "--dd-scope",
            "auto",
            "--dd-source",
            traversal_dd_source,
            "--ts-dd-trace",
            "on" if ts_dd_trace else "off",
            "--run-lines",
            "on" if run_lines else "off",
            "--dd-export-jsonl",
            tmp_jsonl,
        ]
        if profile:
            export_cmd.append("--profile")
        export_lines = run_capture_lines(
            export_cmd,
            log_fh,
            f"{problem_id}: export factual DD",
            echo_profile_progress=profile,
        )
        export_elapsed = time.perf_counter() - export_t0
        out_json = DD_DATA_DIR / f"{problem_id}.json"
        compact_t0 = time.perf_counter()
        compact_cmd = [
            "python3",
            str(DD_COMPACT),
            "--input-jsonl",
            tmp_jsonl,
            "--output-json",
            str(out_json),
        ]
        compact_lines = run_capture_lines(compact_cmd, log_fh, f"{problem_id}: compact runtime DD")
        compact_elapsed = time.perf_counter() - compact_t0
        total_runs = parse_total_runs(export_lines)
        profile_metrics = parse_profile_metrics(export_lines) if profile else {}
        records_written = None
        wrote_re = re.compile(r"^Wrote\s+(\d+)\s+records\s+->\s+")
        for line in compact_lines:
            m = wrote_re.match(line.strip())
            if m:
                records_written = int(m.group(1))
                break
        return {
            "totalRuns": total_runs,
            "exportSeconds": export_elapsed,
            "compactSeconds": compact_elapsed,
            "totalSeconds": export_elapsed + compact_elapsed,
            "profileMetrics": profile_metrics,
            "recordsWritten": records_written,
        }
    finally:
        try:
            os.unlink(tmp_jsonl)
        except FileNotFoundError:
            pass


@dataclass
class VerifyRow:
    problem_id: str
    off_count: int
    runtime_count: int

    @property
    def status(self) -> str:
        if self.off_count == 0 and self.runtime_count == 0:
            return "clean"
        if self.off_count > 0 and self.runtime_count == 0:
            return "fixed"
        if self.runtime_count >= self.off_count:
            return "unchanged"
        return "improved"


def parse_discrepancy_count(lines: List[str]) -> int:
    pattern = re.compile(r"^DD discrepancies:\s+(\d+)\s*$")
    for line in lines:
        m = pattern.match(line.strip())
        if m:
            return int(m.group(1))
    raise RuntimeError("Could not find 'DD discrepancies: <n>' in output")


def parse_total_runs(lines: List[str]) -> int:
    pattern = re.compile(r"^Total runs:\s+(\d+)\s*$")
    for line in lines:
        m = pattern.match(line.strip())
        if m:
            return int(m.group(1))
    raise RuntimeError("Could not find 'Total runs: <n>' in output")


def parse_profile_lines(lines: List[str]) -> List[str]:
    return [line.strip() for line in lines if line.startswith("PROFILE ")]


def parse_profile_metrics(lines: List[str]) -> Dict[str, str]:
    metrics: Dict[str, str] = {}
    for line in parse_profile_lines(lines):
        payload = line[len("PROFILE ") :].strip()
        for token in payload.split():
            if "=" not in token:
                continue
            k, v = token.split("=", 1)
            metrics[k.strip()] = v.strip()
    return metrics


def count_discrepancies(
    problem_id: str,
    dd_source: str,
    log_fh,
    *,
    ts_dd_trace: bool,
    profile: bool,
    run_lines: bool,
    dd_analyze: bool,
    dd_analyze_samples: int,
) -> Dict[str, Any]:
    cmd = [
        "python3",
        "-u",
        str(POLICY_MOVIE),
        "--problem-id",
        problem_id,
        "--enumerate",
        "--dd-scope",
        "auto",
        "--dd-discrepancies-only",
        "--dd-source",
        dd_source,
        "--ts-dd-trace",
        "on" if ts_dd_trace else "off",
        "--run-lines",
        "on" if run_lines else "off",
    ]
    if profile:
        cmd.append("--profile")
    if dd_analyze:
        cmd.extend(["--dd-analyze", "--dd-analyze-samples", str(max(1, dd_analyze_samples))])
    t0 = time.perf_counter()
    lines = run_capture_lines(
        cmd,
        log_fh,
        f"{problem_id}: verify dd-source={dd_source}",
        echo_profile_progress=profile,
    )
    elapsed = time.perf_counter() - t0
    return {
        "discrepancies": parse_discrepancy_count(lines),
        "totalRuns": parse_total_runs(lines),
        "elapsedSeconds": elapsed,
        "profileLines": parse_profile_lines(lines),
    }


def refresh_all(
    problem_ids: List[str],
    log_fh,
    *,
    refresh_dd_source: str,
    ts_dd_trace: bool,
    profile: bool,
    run_lines: bool,
) -> None:
    progress(
        f"Refreshing DD runtime data for {len(problem_ids)} problems "
        f"(refresh traversal ddSource={refresh_dd_source})"
    )
    for idx, pid in enumerate(problem_ids, start=1):
        progress(f"[{idx}/{len(problem_ids)}] refresh {pid} start")
        result = refresh_problem_dd(
            pid,
            log_fh,
            traversal_dd_source=refresh_dd_source,
            ts_dd_trace=ts_dd_trace,
            profile=profile,
            run_lines=run_lines,
        )
        if profile:
            metrics = result.get("profileMetrics", {})
            dd_checks = metrics.get("dd_checks", "-")
            dd_unique = metrics.get("dd_unique_signatures", "-")
            dd_hits = metrics.get("dd_cache_hits", "-")
            dd_misses = metrics.get("dd_cache_misses", "-")
            progress(
                f"problem {pid} refresh total={result['totalSeconds']:.2f}s export={result['exportSeconds']:.2f}s "
                f"compact={result['compactSeconds']:.2f}s runs={result['totalRuns']} records={result.get('recordsWritten','-')} "
                f"ddChecks={dd_checks} uniqueSigs={dd_unique} cacheHits={dd_hits} cacheMisses={dd_misses}"
            )
        else:
            progress(f"[{idx}/{len(problem_ids)}] refresh {pid} done")
    progress("Refresh complete")


def verify_all(
    problem_ids: List[str],
    log_fh,
    *,
    runtime_only: bool,
    ts_dd_trace: bool,
    profile: bool,
    run_lines: bool,
    dd_analyze: bool,
    dd_analyze_samples: int,
) -> int:
    rows: List[VerifyRow] = []
    for idx, pid in enumerate(problem_ids, start=1):
        progress(f"[{idx}/{len(problem_ids)}] verify {pid} start")
        off: int
        off_runs = "-"
        off_s = "-"
        if runtime_only:
            off = -1
        else:
            off_result = count_discrepancies(
                pid,
                "off",
                log_fh,
                ts_dd_trace=ts_dd_trace,
                profile=profile,
                run_lines=run_lines,
                dd_analyze=dd_analyze,
                dd_analyze_samples=dd_analyze_samples,
            )
            off = int(off_result["discrepancies"])
            off_runs = str(off_result["totalRuns"])
            off_s = f"{off_result['elapsedSeconds']:.2f}s"
            if profile:
                for line in off_result["profileLines"]:
                    progress(f"{pid} off {line}")
        runtime_result = count_discrepancies(
            pid,
            "runtime",
            log_fh,
            ts_dd_trace=ts_dd_trace,
            profile=profile,
            run_lines=run_lines,
            dd_analyze=dd_analyze,
            dd_analyze_samples=dd_analyze_samples,
        )
        runtime = int(runtime_result["discrepancies"])
        runtime_runs = runtime_result["totalRuns"]
        runtime_s = runtime_result["elapsedSeconds"]
        if profile:
            for line in runtime_result["profileLines"]:
                progress(f"{pid} runtime {line}")
        row = VerifyRow(problem_id=pid, off_count=off, runtime_count=runtime)
        rows.append(row)
        if runtime_only:
            progress(
                f"problem {pid}  runtime={runtime} runs={runtime_runs} time={runtime_s:.2f}s "
                f"status={'clean' if runtime == 0 else 'failing'}"
            )
        else:
            progress(
                f"problem {pid}  off={off} runs={off_runs} time={off_s}  "
                f"runtime={runtime} runs={runtime_runs} time={runtime_s:.2f}s  status={row.status}"
            )

    total = len(rows)
    zero_runtime = sum(1 for r in rows if r.runtime_count == 0)
    still_failing = [r for r in rows if r.runtime_count > 0]
    progress(f"Summary: checked={total} runtimeZero={zero_runtime} runtimeFailing={len(still_failing)}")
    if still_failing:
        for r in still_failing:
            if runtime_only:
                progress(f"  fail {r.problem_id}: runtime={r.runtime_count}")
            else:
                progress(f"  fail {r.problem_id}: off={r.off_count} runtime={r.runtime_count}")
        return 1
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Refresh and verify runtime DD data across all extant problems.")
    sub = parser.add_subparsers(dest="mode", required=True)
    refresh_parser = sub.add_parser(
        "refresh",
        help="Regenerate src/data/dd/<problem>.json for all extant problems",
    )
    refresh_parser.add_argument(
        "--problem-id",
        default=None,
        help="Refresh a single problem id (useful for focused profiling, e.g. p007)",
    )
    refresh_parser.add_argument(
        "--profile",
        action="store_true",
        help="Enable deeper timing/profile summary from policy_movie during refresh runs",
    )
    refresh_parser.add_argument(
        "--refresh-dd-source",
        choices=["off", "runtime"],
        default="runtime",
        help=(
            "ddSource used during refresh traversal/export state discovery "
            "(default: runtime to align dataset coverage with runtime verify)"
        ),
    )
    refresh_parser.add_argument(
        "--verbose-ts-trace",
        action="store_true",
        help="Emit TS per-decision DD trace lines during refresh (default: off for faster bulk runs)",
    )
    refresh_parser.add_argument(
        "--verbose-run-lines",
        action="store_true",
        help="Emit per-run 'Run N ...' enumeration lines during refresh (default: off)",
    )
    verify_parser = sub.add_parser("verify", help="Compare discrepancy counts for dd-source off vs runtime across all extant problems")
    verify_parser.add_argument(
        "--runtime-only",
        action="store_true",
        help="Verify only dd-source=runtime (skip baseline dd-source=off pass)",
    )
    verify_parser.add_argument(
        "--problem-id",
        default=None,
        help="Verify a single problem id (useful for focused profiling, e.g. p007)",
    )
    verify_parser.add_argument(
        "--verbose-ts-trace",
        action="store_true",
        help="Emit TS per-decision DD trace lines during verification (default: off for faster bulk runs)",
    )
    verify_parser.add_argument(
        "--verbose-run-lines",
        action="store_true",
        help="Emit per-run 'Run N ...' enumeration lines during verification (default: off)",
    )
    verify_parser.add_argument(
        "--profile",
        action="store_true",
        help="Enable deeper timing/profile summary from policy_movie for verification runs",
    )
    verify_parser.add_argument(
        "--dd-analyze",
        action="store_true",
        help="Group runtime DD discrepancies by root-cause category and print compact samples",
    )
    verify_parser.add_argument(
        "--dd-analyze-samples",
        type=int,
        default=2,
        help="Max representative examples per DD analysis category",
    )
    args = parser.parse_args()

    ids, skipped_ids = list_problem_ids()
    if getattr(args, "problem_id", None):
        target = str(args.problem_id)
        if target in skipped_ids:
            raise RuntimeError(f"Problem {target} is under construction and excluded from this workflow.")
        if target not in ids:
            raise RuntimeError(f"Unknown or inactive problem id: {target}")
        ids = [target]
    DD_LOG_DIR.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = DD_LOG_DIR / f"{args.mode}_{stamp}.log"
    progress(f"Verbose log: {log_path}")
    if skipped_ids:
        for pid in skipped_ids:
            progress(f"skipping {pid} (under construction)")
    if not has_endplay():
        print("DDS/endplay not available — execution skipped (edit-only environment).")
        raise SystemExit(0)
    with open(log_path, "w", encoding="utf-8") as log_fh:
        log_fh.write(f"mode={args.mode}\n")
        log_fh.write(f"problems={','.join(ids)}\n")
        if skipped_ids:
            log_fh.write(f"skipped_under_construction={','.join(skipped_ids)}\n")
        log_fh.write(f"runtime_only={getattr(args, 'runtime_only', False)}\n")
        log_fh.write(f"refresh_dd_source={getattr(args, 'refresh_dd_source', 'runtime')}\n")
        log_fh.write(f"profile={getattr(args, 'profile', False)}\n")
        log_fh.write(f"dd_analyze={getattr(args, 'dd_analyze', False)}\n")
        log_fh.write(f"dd_analyze_samples={getattr(args, 'dd_analyze_samples', 2)}\n")
        log_fh.write(f"verbose_ts_trace={getattr(args, 'verbose_ts_trace', False)}\n")
        log_fh.write(f"verbose_run_lines={getattr(args, 'verbose_run_lines', False)}\n")
        log_fh.flush()
        try:
            if args.mode == "refresh":
                refresh_all(
                    ids,
                    log_fh,
                    refresh_dd_source=str(getattr(args, "refresh_dd_source", "runtime")),
                    ts_dd_trace=bool(getattr(args, "verbose_ts_trace", False)),
                    profile=bool(getattr(args, "profile", False)),
                    run_lines=bool(getattr(args, "verbose_run_lines", False)),
                )
                progress(f"Log written: {log_path}")
                return
            rc = verify_all(
                ids,
                log_fh,
                runtime_only=bool(getattr(args, "runtime_only", False)),
                ts_dd_trace=bool(getattr(args, "verbose_ts_trace", False)),
                profile=bool(getattr(args, "profile", False)),
                run_lines=bool(getattr(args, "verbose_run_lines", False)),
                dd_analyze=bool(getattr(args, "dd_analyze", False)),
                dd_analyze_samples=int(getattr(args, "dd_analyze_samples", 2)),
            )
            progress(f"Log written: {log_path}")
            raise SystemExit(rc)
        except Exception:
            progress(f"Log written: {log_path}")
            raise


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as exc:
        print(f"ERROR: {exc}")
        raise SystemExit(1)
