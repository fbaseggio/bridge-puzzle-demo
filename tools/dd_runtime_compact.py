#!/usr/bin/env python3
import argparse
import json
from typing import Any, Dict, List


def main() -> None:
    parser = argparse.ArgumentParser(description="Build compact TS runtime DD records from factual JSONL export.")
    parser.add_argument("--input-jsonl", required=True, help="Path to factual DD JSONL (from policy_movie.py --dd-export-jsonl)")
    parser.add_argument("--output-json", required=True, help="Path to compact runtime JSON file")
    args = parser.parse_args()

    records_by_sig: Dict[str, Dict[str, Any]] = {}
    with open(args.input_jsonl, "r", encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if not line:
                continue
            rec = json.loads(line)
            sig = rec.get("signature")
            optimal = rec.get("optimalMoves")
            if not isinstance(sig, str) or not isinstance(optimal, list) or len(optimal) == 0:
                continue
            cards = sorted({c for c in optimal if isinstance(c, str)})
            if not cards:
                continue
            records_by_sig[sig] = {"signature": sig, "optimalMoves": cards}

    out: List[Dict[str, Any]] = sorted(records_by_sig.values(), key=lambda r: r["signature"])
    with open(args.output_json, "w", encoding="utf-8") as fh:
        json.dump(out, fh, separators=(",", ":"))
        fh.write("\n")

    print(f"Wrote {len(out)} records -> {args.output_json}")


if __name__ == "__main__":
    main()
