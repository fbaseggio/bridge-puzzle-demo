#!/usr/bin/env python3
import argparse
import copy
import datetime as dt
import json
import os
import random
import re
import subprocess
import sys
import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple, Any

try:
    from tools.dd_env import has_endplay
except Exception:
    from dd_env import has_endplay

SEAT_ORDER = ["N", "E", "S", "W"]
SUIT_ORDER = ["S", "H", "D", "C"]
SUIT_SYMBOL = {"S": "♠", "H": "♥", "D": "♦", "C": "♣"}
RANK_STRENGTH = {r: i for i, r in enumerate(["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"], start=2)}


@dataclass
class Play:
    seat: str
    suit: str
    rank: str

    @property
    def card_id(self) -> str:
        return f"{self.suit}{self.rank}"


@dataclass
class EnumState:
    hands: Dict[str, Dict[str, List[str]]]
    trick: List[Play]
    leader: str
    turn: str
    tricks_won: Dict[str, int]
    policy_rng: Dict[str, int]
    threat_state: Optional[Dict[str, Any]]
    goal_status: Optional[str]
    line: List[Tuple[str, str]]
    dd_failures: List[Tuple[int, int, str, str, List[str], int, str]]


@dataclass
class DDResult:
    optimal_cards: List[str]
    max_tricks: int
    tricks_by_card: Dict[str, int]


@dataclass
class DDDiscrepancy:
    run_no: int
    position_index: int
    trick_no: int
    seat: str
    actual_card: str
    optimal_cards: List[str]
    max_tricks: int
    severity: str


@dataclass
class DDDiscrepancyAnalysis:
    run_no: int
    position_index: int
    trick_no: int
    seat: str
    chosen: str
    direct_optimal: List[str]
    signature: str
    legal: List[str]
    base: List[str]
    runtime_optimal: List[str]
    lookup: bool
    found: bool
    path: str
    category: str
    transcript_prefix: List[Tuple[str, str]]
    failing_play: Tuple[str, str]


@dataclass
class EnumProfile:
    policy_queries: int = 0
    policy_query_s: float = 0.0
    dd_checks: int = 0
    dd_check_s: float = 0.0
    threat_updates: int = 0
    threat_update_s: float = 0.0
    terminal_runs: int = 0


class DDRecordExporter:
    def __init__(self, path: str, emit_all_states: bool = False) -> None:
        self.path = path
        self.emit_all_states = emit_all_states
        self._fh = open(path, "w", encoding="utf-8")
        self._seen_signatures: set[str] = set()
        self.records_written = 0

    def close(self) -> None:
        try:
            self._fh.close()
        except Exception:
            pass

    def should_emit(self, legal_moves: List[str], move_values: Dict[str, int]) -> bool:
        if self.emit_all_states:
            return True
        if len(legal_moves) <= 1:
            return False
        values = {move_values.get(card) for card in legal_moves if card in move_values}
        return len(values) > 1

    def emit(self, record: Dict[str, Any]) -> None:
        signature = record.get("signature")
        if not isinstance(signature, str):
            return
        if signature in self._seen_signatures:
            return
        self._seen_signatures.add(signature)
        self._fh.write(json.dumps(record, separators=(",", ":")) + "\n")
        self.records_written += 1


def next_seat(seat: str) -> str:
    i = SEAT_ORDER.index(seat)
    return SEAT_ORDER[(i + 1) % 4]


def side_of(seat: str) -> str:
    return "NS" if seat in ("N", "S") else "EW"


def parse_card(card_id: str) -> Tuple[str, str]:
    return card_id[0], card_id[1:]


def pretty_card(card_id: str) -> str:
    suit, rank = parse_card(card_id)
    return f"{SUIT_SYMBOL[suit]}{rank}"


def card_sort_key(card_id: str) -> Tuple[int, int]:
    suit, rank = parse_card(card_id)
    suit_idx = SUIT_ORDER.index(suit) if suit in SUIT_ORDER else 99
    rank_val = RANK_STRENGTH.get(rank, 0)
    return suit_idx, -rank_val


def sorted_cards(cards: List[str]) -> List[str]:
    return sorted(cards, key=card_sort_key)


def sort_ranks_desc(ranks: List[str]) -> List[str]:
    return sorted(ranks, key=lambda r: -RANK_STRENGTH.get(r, 0))


def canonical_position_signature(
    contract_strain: str,
    side_to_act: str,
    hands: Dict[str, Dict[str, List[str]]],
    trick: List[Play],
) -> str:
    # Canonical, policy-agnostic signature:
    # trump=<NT|S|H|D|C>|turn=<N|E|S|W>|trick=<seat:card,...>|hands=N:...|E:...|S:...|W:...
    trick_text = ",".join(f"{p.seat}:{p.card_id}" for p in trick) if trick else "-"
    hand_parts: List[str] = []
    for seat in SEAT_ORDER:
        suits: List[str] = []
        for suit in SUIT_ORDER:
            ranks = "".join(sort_ranks_desc(hands[seat][suit]))
            suits.append(f"{suit}:{ranks or '-'}")
        hand_parts.append(f"{seat}:" + ";".join(suits))
    return f"trump={str(contract_strain).upper()}|turn={side_to_act}|trick={trick_text}|hands=" + "|".join(hand_parts)


def build_dd_record(
    puzzle: Dict[str, Any],
    hands: Dict[str, Dict[str, List[str]]],
    trick: List[Play],
    side_to_act: str,
    legal_moves: List[str],
    dd: DDResult,
    expected_policy_moves: Optional[List[str]] = None,
    run_no: Optional[int] = None,
    position_index: Optional[int] = None,
) -> Dict[str, Any]:
    move_values = {card: dd.tricks_by_card[card] for card in sorted_cards(list(dd.tricks_by_card.keys()))}
    record: Dict[str, Any] = {
        "signature": canonical_position_signature(puzzle["contract"]["strain"], side_to_act, hands, trick),
        "sideToAct": side_to_act,
        "legalMoves": sorted_cards(list(legal_moves)),
        "moveValues": move_values,
        "bestValue": dd.max_tricks,
        "optimalMoves": sorted_cards(list(dd.optimal_cards)),
    }
    if expected_policy_moves:
        record["expectedPolicyMoves"] = sorted_cards(list(expected_policy_moves))
    if isinstance(puzzle.get("id"), str):
        record["problemId"] = puzzle["id"]
    if run_no is not None:
        record["runNo"] = run_no
    if position_index is not None:
        record["positionIndex"] = position_index
    return record


class DoubleDummyValidator:
    def __init__(self) -> None:
        try:
            from endplay.types import Deal, Denom, Player  # type: ignore
            from endplay.dds import solve_board  # type: ignore
        except Exception as exc:
            raise RuntimeError(
                "Double-dummy validation requires Python package 'endplay'. "
                "Install with: pip install endplay"
            ) from exc
        self.Deal = Deal
        self.Denom = Denom
        self.Player = Player
        self.solve_board = solve_board
        self._rank_order = "AKQJT98765432"
        self._card_re = re.compile(r"([SHDC♠♥♦♣])([AKQJT98765432])")
        self._dd_calls = 0
        self._dd_total_s = 0.0
        self._dd_signatures_seen: set[str] = set()
        self._dd_signature_repeats = 0
        self._dd_cache: Dict[str, DDResult] = {}
        self._dd_cache_hits = 0
        self._dd_cache_misses = 0
        self._dd_signature_s = 0.0
        self._dd_cache_hit_s = 0.0
        self._dd_cache_miss_s = 0.0

    def _clone_dd_result(self, value: DDResult) -> DDResult:
        return DDResult(
            optimal_cards=list(value.optimal_cards),
            max_tricks=int(value.max_tricks),
            tricks_by_card=dict(value.tricks_by_card),
        )

    def _sort_ranks_desc(self, ranks: List[str]) -> List[str]:
        return sorted(ranks, key=lambda r: self._rank_order.index(r))

    def _pbn_hand(self, hand: Dict[str, List[str]]) -> str:
        parts = []
        for suit in SUIT_ORDER:
            parts.append("".join(self._sort_ranks_desc(hand[suit])))
        return ".".join(parts)

    def _pbn_deal(self, hands: Dict[str, Dict[str, List[str]]]) -> str:
        # endplay Deal expects N:... in N E S W order
        return "N:" + " ".join(self._pbn_hand(hands[seat]) for seat in SEAT_ORDER)

    def _to_denom(self, strain: str):
        s = str(strain).upper()
        if s == "NT":
            return self.Denom.nt
        mapping = {"S": self.Denom.spades, "H": self.Denom.hearts, "D": self.Denom.diamonds, "C": self.Denom.clubs}
        return mapping[s]

    def _to_player(self, seat: str):
        mapping = {"N": self.Player.north, "E": self.Player.east, "S": self.Player.south, "W": self.Player.west}
        return mapping[seat]

    def _normalize_card(self, raw: Any) -> Optional[str]:
        text = str(raw)
        m = self._card_re.search(text)
        if not m:
            return None
        suit_sym, rank = m.group(1), m.group(2)
        suit_map = {"♠": "S", "♥": "H", "♦": "D", "♣": "C", "S": "S", "H": "H", "D": "D", "C": "C"}
        suit = suit_map.get(suit_sym)
        return f"{suit}{rank}" if suit else None

    def optimal_for_position(
        self,
        hands: Dict[str, Dict[str, List[str]]],
        trick: List[Play],
        turn: str,
        contract_strain: str
    ) -> DDResult:
        t_sig = time.perf_counter()
        sig = canonical_position_signature(contract_strain, turn, hands, trick)
        self._dd_signature_s += time.perf_counter() - t_sig
        self._dd_calls += 1
        if sig in self._dd_signatures_seen:
            self._dd_signature_repeats += 1
        else:
            self._dd_signatures_seen.add(sig)
        cached = self._dd_cache.get(sig)
        if cached is not None:
            t_hit = time.perf_counter()
            self._dd_cache_hits += 1
            out = self._clone_dd_result(cached)
            self._dd_cache_hit_s += time.perf_counter() - t_hit
            return out
        self._dd_cache_misses += 1
        t0 = time.perf_counter()
        # Build a fresh deal per query. Hands in runner state already exclude cards in `trick`,
        # so restore those cards first, then replay `trick` onto the deal.
        hands_for_deal = {
            seat: {suit: list(ranks) for suit, ranks in hands[seat].items()}
            for seat in SEAT_ORDER
        }
        for p in trick:
            if p.rank not in hands_for_deal[p.seat][p.suit]:
                hands_for_deal[p.seat][p.suit].append(p.rank)

        deal = self.Deal(self._pbn_deal(hands_for_deal))
        deal.trump = self._to_denom(contract_strain)
        leader = trick[0].seat if trick else turn
        deal.first = self._to_player(leader)
        expected_seat = leader
        for p in trick:
            if p.seat != expected_seat:
                raise RuntimeError(
                    f"DD trick reconstruction seat mismatch: expected {expected_seat}, got {p.seat}"
                )
            if p.rank not in hands_for_deal[p.seat][p.suit]:
                raise RuntimeError(
                    f"DD trick reconstruction missing card before play: {p.seat}:{p.card_id}"
                )
            deal.play(p.card_id)
            hands_for_deal[p.seat][p.suit].remove(p.rank)
            expected_seat = next_seat(expected_seat)
        if expected_seat != turn:
            raise RuntimeError(
                f"DD turn mismatch after trick reconstruction: expected {expected_seat}, got {turn}"
            )

        raw = self.solve_board(deal)
        scored: List[Tuple[str, int]] = []
        for entry in raw:
            try:
                card_obj, tricks = entry
            except Exception:
                continue
            card = self._normalize_card(card_obj)
            if card is None:
                continue
            scored.append((card, int(tricks)))
        if not scored:
            miss_elapsed = time.perf_counter() - t0
            self._dd_total_s += miss_elapsed
            self._dd_cache_miss_s += miss_elapsed
            out = DDResult(optimal_cards=[], max_tricks=-1, tricks_by_card={})
            self._dd_cache[sig] = self._clone_dd_result(out)
            return out
        best = max(v for _, v in scored)
        optimal = sorted_cards([c for c, v in scored if v == best])
        tricks_by_card = {c: v for c, v in scored}
        miss_elapsed = time.perf_counter() - t0
        self._dd_total_s += miss_elapsed
        self._dd_cache_miss_s += miss_elapsed
        out = DDResult(optimal_cards=optimal, max_tricks=best, tricks_by_card=tricks_by_card)
        self._dd_cache[sig] = self._clone_dd_result(out)
        return out

    def profile_snapshot(self) -> Dict[str, Any]:
        unique = len(self._dd_signatures_seen)
        hit_rate = (self._dd_cache_hits / self._dd_calls) if self._dd_calls else 0.0
        return {
            "ddCalls": self._dd_calls,
            "ddTotalSeconds": self._dd_total_s,
            "ddUniqueSignatures": unique,
            "ddRepeatedSignatures": self._dd_signature_repeats,
            "ddCacheHits": self._dd_cache_hits,
            "ddCacheMisses": self._dd_cache_misses,
            "ddCacheHitRate": hit_rate,
            "ddSignatureSeconds": self._dd_signature_s,
            "ddCacheHitSeconds": self._dd_cache_hit_s,
            "ddCacheMissSeconds": self._dd_cache_miss_s,
        }


def legal_cards(hands: Dict[str, Dict[str, List[str]]], seat: str, trick: List[Play]) -> List[str]:
    hand = hands[seat]
    if trick:
        lead_suit = trick[0].suit
        if hand[lead_suit]:
            return [f"{lead_suit}{r}" for r in hand[lead_suit]]
    out: List[str] = []
    for suit in SUIT_ORDER:
        out.extend(f"{suit}{r}" for r in hand[suit])
    return out


def resolve_trick_winner(trick: List[Play], contract_strain: str) -> str:
    lead_suit = trick[0].suit
    trump = None if contract_strain == "NT" else contract_strain
    trumps = [p for p in trick if trump and p.suit == trump]
    candidates = trumps if trumps else [p for p in trick if p.suit == lead_suit]
    winner = candidates[0]
    for p in candidates[1:]:
        if RANK_STRENGTH[p.rank] > RANK_STRENGTH[winner.rank]:
            winner = p
    return winner.seat


def remove_card(hands: Dict[str, Dict[str, List[str]]], seat: str, card_id: str) -> None:
    suit, rank = parse_card(card_id)
    if rank not in hands[seat][suit]:
        raise RuntimeError(f"Card {card_id} not in {seat} hand")
    hands[seat][suit].remove(rank)


def format_suit_cards(ranks: List[str]) -> str:
    return " ".join(ranks) if ranks else "—"


def print_newspaper(hands: Dict[str, Dict[str, List[str]]]) -> None:
    n = hands["N"]
    s = hands["S"]
    w = hands["W"]
    e = hands["E"]
    print("                NORTH")
    print(f"             ♠  {format_suit_cards(n['S'])}")
    print(f"             ♥  {format_suit_cards(n['H'])}")
    print(f"             ♦  {format_suit_cards(n['D'])}")
    print(f"             ♣  {format_suit_cards(n['C'])}")
    print("")
    print("WEST                         EAST")
    print(f"♠  {format_suit_cards(w['S']):<26}♠  {format_suit_cards(e['S'])}")
    print(f"♥  {format_suit_cards(w['H']):<26}♥  {format_suit_cards(e['H'])}")
    print(f"♦  {format_suit_cards(w['D']):<26}♦  {format_suit_cards(e['D'])}")
    print(f"♣  {format_suit_cards(w['C']):<26}♣  {format_suit_cards(e['C'])}")
    print("")
    print("                SOUTH")
    print(f"             ♠  {format_suit_cards(s['S'])}")
    print(f"             ♥  {format_suit_cards(s['H'])}")
    print(f"             ♦  {format_suit_cards(s['D'])}")
    print(f"             ♣  {format_suit_cards(s['C'])}")


def lead_marker_map_swapped() -> Dict[str, str]:
    # Marker points from the played card back toward the hand that led.
    return {"N": "^", "S": "v", "W": "<", "E": ">"}


def played_card_layout(trick: List[Play], leader: str) -> str:
    by_seat = {p.seat: f"{SUIT_SYMBOL[p.suit]}{p.rank}" for p in trick}
    mark = lead_marker_map_swapped()

    def fmt(seat: str) -> str:
        card = by_seat.get(seat, "—")
        prefix = mark[seat] if seat == leader else " "
        return f"{prefix}{card}"

    lines = [f"                   {fmt('N')}", f"            {fmt('W')}          {fmt('E')}", f"                   {fmt('S')}"]
    return "\n".join(lines)


def print_newspaper_with_trick(hands: Dict[str, Dict[str, List[str]]], trick: List[Play], leader: str) -> None:
    n = hands["N"]
    s = hands["S"]
    w = hands["W"]
    e = hands["E"]
    by_seat = {p.seat: f"{SUIT_SYMBOL[p.suit]}{p.rank}" for p in trick}
    marker = lead_marker_map_swapped()

    def shown(seat: str) -> str:
        card = by_seat.get(seat, "—")
        if seat == leader:
            return f"{marker[seat]}{card}"
        return f" {card}"

    lines = [
        "                NORTH",
        f"             ♠  {format_suit_cards(n['S'])}",
        f"             ♥  {format_suit_cards(n['H'])}",
        f"             ♦  {format_suit_cards(n['D'])}",
        f"             ♣  {format_suit_cards(n['C'])}",
        "",
        "WEST                         EAST",
        f"♠  {format_suit_cards(w['S']):<26}♠  {format_suit_cards(e['S'])}",
        f"♥  {format_suit_cards(w['H']):<26}♥  {format_suit_cards(e['H'])}",
        f"♦  {format_suit_cards(w['D']):<26}♦  {format_suit_cards(e['D'])}",
        f"♣  {format_suit_cards(w['C']):<26}♣  {format_suit_cards(e['C'])}",
        "",
        "                SOUTH",
        f"             ♠  {format_suit_cards(s['S'])}",
        f"             ♥  {format_suit_cards(s['H'])}",
        f"             ♦  {format_suit_cards(s['D'])}",
        f"             ♣  {format_suit_cards(s['C'])}",
    ]

    def can_place(buf: List[str], pos: int, text: str) -> bool:
        if pos < 0 or pos + len(text) > len(buf):
            return False
        return all(ch == " " for ch in buf[pos : pos + len(text)])

    def place_on_row(row_idx: int, text: str, target_col: int) -> None:
        buf = list(lines[row_idx])
        if can_place(buf, target_col, text):
            buf[target_col : target_col + len(text)] = list(text)
            lines[row_idx] = "".join(buf)
            return
        for delta in range(1, 14):
            for pos in (target_col - delta, target_col + delta):
                if can_place(buf, pos, text):
                    buf[pos : pos + len(text)] = list(text)
                    lines[row_idx] = "".join(buf)
                    return

    # Overlay inside existing center-gap rows.
    # Row A = WEST...EAST header row, Row B = one row lower, Row C = clubs row.
    row_a = 6
    row_b = 8
    row_c = 10
    center = len(lines[row_a]) // 2

    n_text = shown("N")
    s_text = shown("S")
    w_text = shown("W")
    e_text = shown("E")

    place_on_row(row_a, n_text, center - len(n_text) // 2)
    total = len(w_text) + 4 + len(e_text)
    start_w = center - (total // 2)
    start_e = start_w + len(w_text) + 4
    place_on_row(row_b, w_text, start_w)
    place_on_row(row_b, e_text, start_e)
    place_on_row(row_c, s_text, center - len(s_text) // 2)

    for line in lines:
        print(line)


def run_json_cli(cmd: List[str], payload: Dict[str, Any]) -> Dict[str, Any]:
    proc = subprocess.run(
        cmd,
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd)} failed ({proc.returncode}): {proc.stderr.strip()}")
    try:
        out = json.loads(proc.stdout.strip())
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"{' '.join(cmd)} returned non-JSON: {proc.stdout!r}") from exc
    if not out.get("ok"):
        raise RuntimeError(f"{' '.join(cmd)} error: {out.get('error', {}).get('message', 'unknown')}")
    return out


def load_problem(problem_id: str) -> Dict[str, Any]:
    out = run_json_cli(
        ["npx", "vite-node", "src/cli/problem_cli.ts"],
        {"id": problem_id},
    )
    return out["problem"]


def init_threat_state(hands: Dict[str, Dict[str, List[str]]], threat_card_ids: List[str]) -> Dict[str, Any]:
    out = run_json_cli(
        ["npx", "vite-node", "src/cli/threat_state_cli.ts"],
        {"mode": "init", "position": {"hands": hands}, "threatCardIds": threat_card_ids},
    )
    return out["state"]


def update_threat_state(hands: Dict[str, Dict[str, List[str]]], state: Dict[str, Any], played_card_id: str) -> Dict[str, Any]:
    out = run_json_cli(
        ["npx", "vite-node", "src/cli/threat_state_cli.ts"],
        {"mode": "update", "position": {"hands": hands}, "state": state, "playedCardId": played_card_id},
    )
    return out["state"]


class PersistentPolicyClient:
    def __init__(self, *, ts_dd_trace: bool = True) -> None:
        self.proc: Optional[subprocess.Popen[str]] = None
        self.ts_dd_trace = ts_dd_trace

    def start(self) -> None:
        self.proc = subprocess.Popen(
            ["npm", "run", "-s", "policy:serve"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )

    def stop(self) -> None:
        if not self.proc:
            return
        if self.proc.stdin:
            self.proc.stdin.close()
        self.proc.terminate()
        try:
            self.proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            self.proc.kill()
        self.proc = None

    def query(
        self,
        problem_id: str,
        contract_strain: str,
        seat: str,
        policy_kind: str,
        dd_source: str,
        hands: Dict[str, Dict[str, List[str]]],
        trick: List[Play],
        rng_state: Dict[str, int],
        threat_state: Optional[Dict[str, Any]],
        position_index: Optional[int] = None,
        trick_index: Optional[int] = None,
    ) -> Tuple[str, Dict[str, int], Dict[str, Any]]:
        if not self.proc or not self.proc.stdin or not self.proc.stdout:
            raise RuntimeError("Policy server is not running")
        payload = {
            "schemaVersion": 1,
            "policyVersion": 1,
            "debug": {"ddTrace": self.ts_dd_trace},
            "input": {
                "policy": {"kind": policy_kind, "ddSource": dd_source},
                "problemId": problem_id,
                "contractStrain": contract_strain,
                "seat": seat,
                "debugPositionIndex": position_index,
                "debugTrickIndex": trick_index,
                "hands": hands,
                "trick": [{"seat": p.seat, "suit": p.suit, "rank": p.rank} for p in trick],
                "threat": threat_state["threat"] if threat_state else None,
                "threatLabels": threat_state["labels"] if threat_state else None,
                "rng": rng_state,
            },
        }
        self.proc.stdin.write(json.dumps(payload) + "\n")
        self.proc.stdin.flush()
        line = self.proc.stdout.readline()
        if not line:
            stderr_text = self.proc.stderr.read() if self.proc.stderr else ""
            raise RuntimeError(f"policy:serve returned EOF. stderr={stderr_text.strip()}")
        out = json.loads(line.strip())
        if not out.get("ok"):
            raise RuntimeError(f"policy:serve error: {out.get('error', {}).get('message', 'unknown')}")
        debug_lines = out.get("debugLines")
        if isinstance(debug_lines, list):
            for debug_line in debug_lines:
                if isinstance(debug_line, str) and debug_line:
                    print(debug_line)
        result = out["result"]
        chosen = result["chosenCardId"]
        next_rng = result["rngAfter"]
        if not chosen:
            raise RuntimeError("policy:serve returned null chosenCardId")
        return chosen, next_rng, result


class PersistentThreatStateClient:
    def __init__(self) -> None:
        self.proc: Optional[subprocess.Popen[str]] = None
        self.last_features: Optional[Dict[str, Any]] = None
        self.last_feature_diff: Optional[Dict[str, Any]] = None

    def start(self) -> None:
        self.proc = subprocess.Popen(
            ["npm", "run", "-s", "threat:serve"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )

    def stop(self) -> None:
        if not self.proc:
            return
        if self.proc.stdin:
            self.proc.stdin.close()
        self.proc.terminate()
        try:
            self.proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            self.proc.kill()
        self.proc = None

    def _query(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        if not self.proc or not self.proc.stdin or not self.proc.stdout:
            raise RuntimeError("Threat server is not running")
        self.proc.stdin.write(json.dumps(payload) + "\n")
        self.proc.stdin.flush()
        line = self.proc.stdout.readline()
        if not line:
            stderr_text = self.proc.stderr.read() if self.proc.stderr else ""
            raise RuntimeError(f"threat:serve returned EOF. stderr={stderr_text.strip()}")
        out = json.loads(line.strip())
        if not out.get("ok"):
            raise RuntimeError(f"threat:serve error: {out.get('error', {}).get('message', 'unknown')}")
        self.last_features = out.get("features")
        self.last_feature_diff = out.get("featureDiff")
        state = out.get("state")
        if not isinstance(state, dict):
            raise RuntimeError("threat:serve response missing state")
        return state

    def last_goal_status(self) -> Optional[str]:
        if isinstance(self.last_features, dict):
            value = self.last_features.get("goalStatus")
            if isinstance(value, str):
                return value
        return None

    def init_state(
        self,
        hands: Dict[str, Dict[str, List[str]]],
        threat_card_ids: List[str],
        goal_context: Optional[Dict[str, Any]] = None,
        runtime_context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        payload: Dict[str, Any] = {"mode": "init", "position": {"hands": hands}, "threatCardIds": threat_card_ids}
        if goal_context is not None:
            payload["goalContext"] = goal_context
        if runtime_context is not None:
            payload["runtimeContext"] = runtime_context
        return self._query(payload)

    def update_state(
        self,
        hands: Dict[str, Dict[str, List[str]]],
        state: Dict[str, Any],
        played_card_id: str,
        goal_context: Optional[Dict[str, Any]] = None,
        runtime_context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        payload: Dict[str, Any] = {"mode": "update", "position": {"hands": hands}, "state": state, "playedCardId": played_card_id}
        if goal_context is not None:
            payload["goalContext"] = goal_context
        if runtime_context is not None:
            payload["runtimeContext"] = runtime_context
        return self._query(payload)


def runtime_context_for_threat(trick: List[Play], contract_strain: str) -> Dict[str, Any]:
    return {
        "trick": [{"seat": p.seat, "suit": p.suit, "rank": p.rank} for p in trick],
        "trumpSuit": None if str(contract_strain).upper() == "NT" else str(contract_strain).upper(),
    }


def format_feature_updates(feature_diff: Optional[Dict[str, Any]]) -> Optional[str]:
    if not feature_diff:
        return None

    reasoning_roles = {"busy", "threat", "promotedWinner", "idle", "winner"}
    impactful_removed_roles = {"busy", "threat", "promotedWinner"}
    updates: List[str] = []

    role_changes = feature_diff.get("roleChanges")
    if isinstance(role_changes, list):
        for change in role_changes:
            if not isinstance(change, dict):
                continue
            card_id = change.get("cardId")
            from_role = change.get("from")
            to_role = change.get("to")
            if not isinstance(card_id, str):
                continue
            if from_role == to_role:
                continue

            # Suppress trivial removal noise: only report removals when card previously mattered.
            if to_role is None:
                if from_role in impactful_removed_roles:
                    updates.append(f"{pretty_card(card_id)} {from_role} -> -")
                continue

            if (from_role in reasoning_roles) or (to_role in reasoning_roles):
                updates.append(f"{pretty_card(card_id)} {from_role or '-'} -> {to_role or '-'}")

    suit_changes = feature_diff.get("suitChanges")
    if isinstance(suit_changes, list):
        for change in suit_changes:
            if not isinstance(change, dict):
                continue
            suit = change.get("suit")
            before = change.get("before")
            after = change.get("after")
            if not isinstance(suit, str):
                continue
            if not isinstance(before, dict) and not isinstance(after, dict):
                continue
            parts: List[str] = []
            if isinstance(before, dict) and isinstance(after, dict):
                b_active, a_active = before.get("active"), after.get("active")
                b_len, a_len = before.get("threatLength"), after.get("threatLength")
                b_stop, a_stop = before.get("stopStatus"), after.get("stopStatus")
                if b_active != a_active:
                    parts.append(f"active {b_active}->{a_active}")
                if b_len != a_len:
                    parts.append(f"len {b_len}->{a_len}")
                if b_stop != a_stop:
                    parts.append(f"stop {b_stop}->{a_stop}")
            elif isinstance(before, dict):
                parts.append("removed")
            elif isinstance(after, dict):
                parts.append("added")
            if parts:
                updates.append(f"{SUIT_SYMBOL.get(suit, suit)} threat " + " ".join(parts))

    if not updates:
        return None
    return "; ".join(updates)


def all_hands_empty(hands: Dict[str, Dict[str, List[str]]]) -> bool:
    return all(len(hands[seat][suit]) == 0 for seat in SEAT_ORDER for suit in SUIT_ORDER)


def policy_candidates(policy_result: Dict[str, Any], chosen_card: str) -> List[str]:
    raw = policy_result.get("bucketCards")
    if isinstance(raw, list):
        cards = [c for c in raw if isinstance(c, str)]
    else:
        cards = [chosen_card]
    if chosen_card not in cards:
        cards.append(chosen_card)
    dedup: List[str] = []
    seen = set()
    for c in cards:
        if c in seen:
            continue
        seen.add(c)
        dedup.append(c)
    return sorted_cards(dedup)


def format_compact_line(line: List[Tuple[str, str]]) -> str:
    chunks: List[str] = []
    for i in range(0, len(line), 4):
        trick_chunk = line[i : i + 4]
        chunks.append(" ".join(f"{seat}:{card}" for seat, card in trick_chunk))
    return " / ".join(chunks)


def should_validate_dd(scope: str, seat: str) -> bool:
    scope_norm = scope.lower()
    if scope_norm == "all":
        return True
    if scope_norm == "ns":
        return seat in ("N", "S")
    if scope_norm == "ew":
        return seat in ("E", "W")
    return False


def derive_dd_scope_from_goal_side(goal_side: str) -> str:
    side = str(goal_side).upper()
    if side == "NS":
        return "ew"
    if side == "EW":
        return "ns"
    raise RuntimeError(f"Unsupported goal side for DD scope derivation: {goal_side}")


def safe_list(x: Any) -> List[str]:
    if x is None:
        return []
    if isinstance(x, list):
        return list(x)
    if isinstance(x, (tuple, set)):
        return list(x)
    try:
        return list(x)
    except TypeError:
        return []


def enumerate_runs(
    puzzle: Dict[str, Any],
    policy_client: PersistentPolicyClient,
    threat_client: Optional[PersistentThreatStateClient],
    dd_source: str,
    show_run: Optional[int],
    dd_validator: Optional[DoubleDummyValidator] = None,
    dd_scope: str = "none",
    dd_discrepancies_only: bool = False,
    emit_summaries: bool = True,
    dd_exporter: Optional[DDRecordExporter] = None,
    profile: Optional[EnumProfile] = None,
    profile_mode: bool = False,
    profile_heartbeat_sec: float = 15.0,
) -> Tuple[
    int,
    Optional[List[Tuple[str, str]]],
    Optional[str],
    Optional[List[Tuple[int, int, str, str, List[str], int, str]]],
    List[DDDiscrepancy],
    List[DDDiscrepancyAnalysis],
]:
    goal_context = lambda tricks: {"goal": puzzle["goal"], "tricksWon": {"NS": tricks["NS"], "EW": tricks["EW"]}}
    hands = {seat: {suit: list(ranks) for suit, ranks in puzzle["hands"][seat].items()} for seat in SEAT_ORDER}
    threat_state: Optional[Dict[str, Any]] = None
    initial_goal_status: Optional[str] = None
    threat_card_ids = list(puzzle.get("threatCardIds", []))
    contract_strain = puzzle["contract"]["strain"]
    if threat_client is not None and threat_card_ids:
        threat_state = threat_client.init_state(
            hands,
            threat_card_ids,
            goal_context({"NS": 0, "EW": 0}),
            runtime_context_for_threat([], contract_strain),
        )
        initial_goal_status = threat_client.last_goal_status()

    run_no = 0
    selected_line: Optional[List[Tuple[str, str]]] = None
    selected_summary: Optional[str] = None
    selected_dd_failures: Optional[List[Tuple[int, int, str, str, List[str], int, str]]] = None
    discrepancies: List[DDDiscrepancy] = []
    discrepancy_analysis: List[DDDiscrepancyAnalysis] = []
    stack: List[EnumState] = [
        EnumState(
            hands=hands,
            trick=[],
            leader=puzzle["leader"],
            turn=puzzle["leader"],
            tricks_won={"NS": 0, "EW": 0},
            policy_rng={"seed": int(puzzle["rngSeed"]), "counter": 0},
            threat_state=threat_state,
            goal_status=initial_goal_status,
            line=[],
            dd_failures=[],
        )
    ]
    enum_started_at = time.perf_counter()
    last_profile_heartbeat = enum_started_at

    while stack:
        if profile_mode:
            now = time.perf_counter()
            if now - last_profile_heartbeat >= profile_heartbeat_sec:
                dd_unique = "-"
                dd_hits = "-"
                dd_misses = "-"
                if dd_validator is not None:
                    snap = dd_validator.profile_snapshot()
                    dd_unique = str(snap.get("ddUniqueSignatures", "-"))
                    dd_hits = str(snap.get("ddCacheHits", "-"))
                    dd_misses = str(snap.get("ddCacheMisses", "-"))
                dd_checks = profile.dd_checks if profile is not None else 0
                stamp = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                print(
                    f"{stamp} [PROFILE] problem={puzzle.get('id', '?')} elapsed={int(now - enum_started_at)}s "
                    f"runs={run_no} ddChecks={dd_checks} uniqueSigs={dd_unique} cacheHits={dd_hits} cacheMisses={dd_misses}",
                    flush=True,
                )
                last_profile_heartbeat = now
        node = stack.pop()
        if all_hands_empty(node.hands) or (node.goal_status == "assuredFailure" and len(node.trick) == 0):
            run_no += 1
            if profile is not None:
                profile.terminal_runs = run_no
            line_text = format_compact_line(node.line)
            for position_index, trick_no, seat, actual_card, optimal_cards, max_tricks, severity in node.dd_failures:
                discrepancies.append(
                    DDDiscrepancy(
                        run_no=run_no,
                        position_index=position_index,
                        trick_no=trick_no,
                        seat=seat,
                        actual_card=actual_card,
                        optimal_cards=optimal_cards,
                        max_tricks=max_tricks,
                        severity=severity,
                    )
                )
            goal_marker = " goal=dead" if node.goal_status == "assuredFailure" else ""
            summary_line = f"Run {run_no}  NS {node.tricks_won['NS']}-{node.tricks_won['EW']} EW{goal_marker}  line: {line_text}"
            if not emit_summaries:
                pass
            elif dd_discrepancies_only:
                run_disc = [d for d in discrepancies if d.run_no == run_no]
                if run_disc:
                    print(summary_line)
            else:
                print(summary_line)
            if show_run is not None and run_no == show_run:
                selected_line = list(node.line)
                selected_summary = summary_line
                selected_dd_failures = list(node.dd_failures)
                return run_no, selected_line, selected_summary, selected_dd_failures, discrepancies, discrepancy_analysis
            continue

        legal = legal_cards(node.hands, node.turn, node.trick)
        if not legal:
            raise RuntimeError(f"No legal cards for seat {node.turn}")

        choices_with_rng: List[Tuple[str, Dict[str, Any], Optional[Dict[str, Any]]]] = []
        # tuple: (cardId, nextPolicyRng, policyResult)
        expected_policy_moves: Optional[List[str]] = None
        if node.turn in ("N", "S"):
            for c in sorted_cards(legal):
                choices_with_rng.append((c, node.policy_rng, None))
        else:
            policy = puzzle["policies"][node.turn]["kind"]
            position_index = len(node.line) + 1
            trick_index = (len(node.line) // 4) + 1
            t_policy = time.perf_counter()
            chosen, next_rng, policy_result = policy_client.query(
                puzzle["id"],
                puzzle["contract"]["strain"],
                node.turn,
                policy,
                dd_source,
                node.hands,
                node.trick,
                node.policy_rng,
                node.threat_state,
                position_index,
                trick_index,
            )
            if profile is not None:
                profile.policy_queries += 1
                profile.policy_query_s += time.perf_counter() - t_policy
            candidates = [c for c in policy_candidates(policy_result, chosen) if c in legal]
            expected_policy_moves = sorted_cards(candidates)
            for c in candidates:
                choices_with_rng.append((c, next_rng, policy_result))

        dd_for_node: Optional[DDResult] = None
        if dd_validator is not None and should_validate_dd(dd_scope, node.turn):
            t_dd = time.perf_counter()
            dd_for_node = dd_validator.optimal_for_position(node.hands, node.trick, node.turn, puzzle["contract"]["strain"])
            if profile is not None:
                profile.dd_checks += 1
                profile.dd_check_s += time.perf_counter() - t_dd
            if dd_exporter is not None and dd_for_node.optimal_cards:
                record = build_dd_record(
                    puzzle,
                    node.hands,
                    node.trick,
                    node.turn,
                    legal,
                    dd_for_node,
                    expected_policy_moves=expected_policy_moves,
                    position_index=len(node.line) + 1,
                )
                if dd_exporter.should_emit(record["legalMoves"], record["moveValues"]):
                    dd_exporter.emit(record)

        # DFS: push in reverse so smallest deterministic choice is visited first.
        for chosen, next_rng, policy_result_for_choice in reversed(choices_with_rng):
            next_dd_failures = list(node.dd_failures)
            if dd_for_node is not None:
                if dd_for_node.optimal_cards and chosen not in dd_for_node.optimal_cards:
                    severity = "minor" if node.goal_status == "assuredFailure" else "major"
                    next_dd_failures.append(
                        (
                            len(node.line) + 1,
                            (len(node.line) // 4) + 1,
                            node.turn,
                            chosen,
                            dd_for_node.optimal_cards,
                            dd_for_node.max_tricks,
                            severity,
                        )
                    )
                    dd_trace = policy_result_for_choice.get("ddTrace") if isinstance(policy_result_for_choice, dict) else None
                    lookup = bool(dd_trace.get("lookup")) if isinstance(dd_trace, dict) else False
                    found = bool(dd_trace.get("found")) if isinstance(dd_trace, dict) else False
                    path = str(dd_trace.get("path")) if isinstance(dd_trace, dict) and dd_trace.get("path") is not None else "unknown"
                    signature = str(dd_trace.get("sig")) if isinstance(dd_trace, dict) and isinstance(dd_trace.get("sig"), str) else "-"
                    legal = [c for c in safe_list(dd_trace.get("legal") if isinstance(dd_trace, dict) else None) if isinstance(c, str)]
                    base = [c for c in safe_list(dd_trace.get("base") if isinstance(dd_trace, dict) else None) if isinstance(c, str)]
                    runtime_optimal = [c for c in safe_list(dd_trace.get("optimal") if isinstance(dd_trace, dict) else None) if isinstance(c, str)]
                    if not isinstance(dd_trace, dict):
                        category = "runtime-trace-missing"
                    elif not lookup or path == "disabled":
                        category = "runtime-lookup-disabled"
                    elif not found:
                        category = "runtime-record-not-found"
                    elif path == "base-fallback":
                        category = "runtime-found-base-fallback"
                    elif path == "dd-fallback":
                        category = "runtime-found-dd-fallback"
                    elif path == "intersection":
                        category = "runtime-found-intersection-mismatch"
                    else:
                        category = "runtime-other"
                    discrepancy_analysis.append(
                        DDDiscrepancyAnalysis(
                            run_no=run_no + 1,
                            position_index=len(node.line) + 1,
                            trick_no=(len(node.line) // 4) + 1,
                            seat=node.turn,
                            chosen=chosen,
                            direct_optimal=safe_list(dd_for_node.optimal_cards),
                            signature=signature,
                            legal=legal,
                            base=base,
                            runtime_optimal=runtime_optimal,
                            lookup=lookup,
                            found=found,
                            path=path,
                            category=category,
                            transcript_prefix=list(node.line),
                            failing_play=(node.turn, chosen),
                        )
                    )
            next_hands = copy.deepcopy(node.hands)
            remove_card(next_hands, node.turn, chosen)
            suit, rank = parse_card(chosen)
            next_trick = node.trick + [Play(node.turn, suit, rank)]
            next_line = node.line + [(node.turn, chosen)]
            next_turn = node.turn
            next_leader = node.leader
            next_tricks_won = {"NS": node.tricks_won["NS"], "EW": node.tricks_won["EW"]}
            if len(next_trick) == 4:
                winner_preview = resolve_trick_winner(next_trick, puzzle["contract"]["strain"])
                next_tricks_won[side_of(winner_preview)] += 1
            next_threat_state = node.threat_state
            next_goal_status = node.goal_status
            if next_threat_state is not None and threat_client is not None:
                t_threat = time.perf_counter()
                next_threat_state = threat_client.update_state(
                    next_hands,
                    next_threat_state,
                    chosen,
                    goal_context(next_tricks_won),
                    runtime_context_for_threat(next_trick, contract_strain),
                )
                if profile is not None:
                    profile.threat_updates += 1
                    profile.threat_update_s += time.perf_counter() - t_threat
                # Goal-status is reliable for terminal checks at trick boundaries.
                if len(next_trick) == 4:
                    next_goal_status = threat_client.last_goal_status()

            if len(next_trick) == 4:
                winner = winner_preview
                next_leader = winner
                next_turn = winner
                next_trick = []
            else:
                next_turn = next_seat(node.turn)

            stack.append(
                EnumState(
                    hands=next_hands,
                    trick=next_trick,
                    leader=next_leader,
                    turn=next_turn,
                    tricks_won=next_tricks_won,
                    policy_rng={"seed": int(next_rng["seed"]), "counter": int(next_rng["counter"])},
                    threat_state=copy.deepcopy(next_threat_state) if next_threat_state is not None else None,
                    goal_status=next_goal_status,
                    line=next_line,
                    dd_failures=next_dd_failures,
                )
            )

    return run_no, selected_line, selected_summary, selected_dd_failures, discrepancies, discrepancy_analysis


def run_movie(
    puzzle: Dict,
    ns_script: List[str],
    ns_random_seed: int,
    dd_source: str,
    forced_line: Optional[List[Tuple[str, str]]] = None,
    dd_validator: Optional[DoubleDummyValidator] = None,
    dd_scope: str = "none",
    forced_dd_failures: Optional[List[Tuple[int, int, str, str, List[str], int, str]]] = None,
    dd_exporter: Optional[DDRecordExporter] = None,
    ts_dd_trace: bool = True,
) -> None:
    goal_context = lambda tricks: {"goal": puzzle["goal"], "tricksWon": {"NS": tricks["NS"], "EW": tricks["EW"]}}
    hands = {
        seat: {suit: list(ranks) for suit, ranks in puzzle["hands"][seat].items()}
        for seat in SEAT_ORDER
    }
    trick: List[Play] = []
    leader = puzzle["leader"]
    turn = leader
    tricks_won = {"NS": 0, "EW": 0}
    ns_script_idx = 0
    trick_no = 0
    ns_rng = random.Random(ns_random_seed)
    policy_rng = {"seed": int(puzzle["rngSeed"]), "counter": 0}
    threat_state: Optional[Dict[str, Any]] = None
    threat_card_ids = list(puzzle.get("threatCardIds", []))
    contract_strain = puzzle["contract"]["strain"]

    print(f"Movie start: problem={puzzle.get('id', '?')} nsScript={','.join(ns_script) if ns_script else '-'} nsSeed={ns_random_seed}")
    print("Initial deal:")
    print_newspaper(hands)
    print("")
    trick_details: List[Tuple[str, Optional[str], Optional[str]]] = []
    forced_idx = 0
    forced_dd_by_position: Dict[int, Tuple[int, int, str, str, List[str], int, str]] = {}
    if forced_dd_failures:
        for rec in forced_dd_failures:
            forced_dd_by_position[rec[0]] = rec

    policy_client = PersistentPolicyClient(ts_dd_trace=ts_dd_trace)
    policy_client.start()
    threat_client: Optional[PersistentThreatStateClient] = None
    if threat_card_ids:
        threat_client = PersistentThreatStateClient()
        threat_client.start()
        threat_state = threat_client.init_state(
            hands,
            threat_card_ids,
            goal_context(tricks_won),
            runtime_context_for_threat(trick, contract_strain),
        )
    goal_status: Optional[str] = threat_client.last_goal_status() if threat_client is not None else None
    try:
        while not all_hands_empty(hands):
            legal = legal_cards(hands, turn, trick)
            if not legal:
                raise RuntimeError(f"No legal cards for seat {turn}")

            if forced_line is not None:
                if forced_idx >= len(forced_line):
                    raise RuntimeError("Forced replay line ended before hand completion")
                expected_seat, forced_card = forced_line[forced_idx]
                forced_idx += 1
                if expected_seat != turn:
                    raise RuntimeError(f"Forced replay seat mismatch at ply {forced_idx}: expected {expected_seat}, got {turn}")
                chosen = forced_card
                if chosen not in legal:
                    raise RuntimeError(
                        f"Forced replay card {chosen} for {turn} is illegal. Legal: {', '.join(legal)}"
                    )
                if turn in ("N", "S"):
                    detail = f"{SUIT_SYMBOL[chosen[0]]}{chosen[1:]}  [replay]"
                else:
                    policy = puzzle["policies"][turn]["kind"]
                    _picked, policy_rng, policy_result = policy_client.query(
                        puzzle["id"],
                        puzzle["contract"]["strain"],
                        turn,
                        policy,
                        dd_source,
                        hands,
                        trick,
                        policy_rng,
                        threat_state,
                        forced_idx,
                        ((forced_idx - 1) // 4) + 1 if forced_idx > 0 else 1,
                    )
                    candidates = policy_candidates(policy_result, _picked)
                    if chosen not in candidates:
                        raise RuntimeError(
                            f"Forced replay card {chosen} for {turn} is not policy-consistent. "
                            f"Candidates: {', '.join(candidates)}"
                        )
                    chosen_bucket = policy_result.get("chosenBucket", "?")
                    rng_before = policy_result.get("rngBefore", {})
                    rng_after = policy_result.get("rngAfter", {})
                    chosen_class = policy_result.get("policyClassByCard", {}).get(chosen, "?")
                    detail = (
                        f"{SUIT_SYMBOL[chosen[0]]}{chosen[1:]}  "
                        f"[policy bucket={chosen_bucket} class={chosen_class} "
                        f"rng={rng_before.get('seed')}:{rng_before.get('counter')}->{rng_after.get('counter')}]"
                    )
            elif turn in ("N", "S"):
                if ns_script_idx < len(ns_script):
                    chosen = ns_script[ns_script_idx]
                    ns_script_idx += 1
                    if chosen not in legal:
                        raise RuntimeError(
                            f"Scripted card {chosen} for {turn} is illegal. Legal: {', '.join(legal)}"
                        )
                    detail = f"{SUIT_SYMBOL[chosen[0]]}{chosen[1:]}  [script]"
                else:
                    chosen = ns_rng.choice(legal)
                    detail = f"{SUIT_SYMBOL[chosen[0]]}{chosen[1:]}  [random-ns seed={ns_random_seed}]"
            else:
                policy = puzzle["policies"][turn]["kind"]
                current_position_index = len(trick_details) + trick_no * 4 + 1
                chosen, policy_rng, policy_result = policy_client.query(
                    puzzle["id"],
                    puzzle["contract"]["strain"],
                    turn,
                    policy,
                    dd_source,
                    hands,
                    trick,
                    policy_rng,
                    threat_state,
                    current_position_index,
                    trick_no + 1,
                )
                if chosen not in legal:
                    raise RuntimeError(
                        f"Policy chose illegal card {chosen} for {turn}. Legal: {', '.join(legal)}"
                    )
                chosen_bucket = policy_result.get("chosenBucket", "?")
                rng_before = policy_result.get("rngBefore", {})
                rng_after = policy_result.get("rngAfter", {})
                chosen_class = policy_result.get("policyClassByCard", {}).get(chosen, "?")
                detail = (
                    f"{SUIT_SYMBOL[chosen[0]]}{chosen[1:]}  "
                    f"[policy bucket={chosen_bucket} class={chosen_class} "
                    f"rng={rng_before.get('seed')}:{rng_before.get('counter')}->{rng_after.get('counter')}]"
                )

            suit, rank = parse_card(chosen)
            dd_line: Optional[str] = None
            position_index = forced_idx if forced_line is not None else (len(trick_details) + trick_no * 4 + 1)
            if dd_validator is not None and should_validate_dd(dd_scope, turn):
                dd = dd_validator.optimal_for_position(hands, trick, turn, puzzle["contract"]["strain"])
                if dd_exporter is not None and dd.optimal_cards:
                    expected_policy_moves: Optional[List[str]] = None
                    if turn in ("E", "W") and policy_result is not None:
                        expected_policy_moves = sorted_cards([c for c in policy_candidates(policy_result, chosen) if c in legal])
                    record = build_dd_record(
                        puzzle,
                        hands,
                        trick,
                        turn,
                        legal,
                        dd,
                        expected_policy_moves=expected_policy_moves,
                        position_index=position_index,
                    )
                    if dd_exporter.should_emit(record["legalMoves"], record["moveValues"]):
                        dd_exporter.emit(record)
                if dd.optimal_cards:
                    if chosen not in dd.optimal_cards:
                        severity = "minor" if goal_status == "assuredFailure" else "major"
                        chosen_tricks = dd.tricks_by_card.get(chosen)
                        if isinstance(chosen_tricks, int):
                            delta = chosen_tricks - dd.max_tricks
                            dd_line = (
                                f"DD[{severity}]: actual={pretty_card(chosen)} "
                                f"optimal={{{', '.join(pretty_card(c) for c in dd.optimal_cards)}}} "
                                f"ΔDD={delta}"
                            )
                        else:
                            dd_line = (
                                f"DD[{severity}]: actual={pretty_card(chosen)} "
                                f"optimal={{{', '.join(pretty_card(c) for c in dd.optimal_cards)}}}"
                            )
            if dd_line is None and position_index in forced_dd_by_position:
                _, _, seat, actual_card, optimal_cards, max_tricks, severity = forced_dd_by_position[position_index]
                if seat == turn and actual_card == chosen and optimal_cards:
                    dd_line = (
                        f"DD[{severity}]: actual={pretty_card(actual_card)} "
                        f"optimal={{{', '.join(pretty_card(c) for c in optimal_cards)}}} "
                        f"max={max_tricks}"
                    )
            remove_card(hands, turn, chosen)
            trick.append(Play(turn, suit, rank))
            feature_line: Optional[str] = None
            if threat_state is not None and threat_client is not None:
                projected_tricks = {"NS": tricks_won["NS"], "EW": tricks_won["EW"]}
                if len(trick) == 4:
                    winner_preview = resolve_trick_winner(trick, puzzle["contract"]["strain"])
                    projected_tricks[side_of(winner_preview)] += 1
                threat_state = threat_client.update_state(
                    hands,
                    threat_state,
                    chosen,
                    goal_context(projected_tricks),
                    runtime_context_for_threat(trick, contract_strain),
                )
                if len(trick) == 4:
                    goal_status = threat_client.last_goal_status()
                feature_line = format_feature_updates(threat_client.last_feature_diff)
            trick_details.append((detail, feature_line, dd_line))

            if len(trick) < 4:
                turn = next_seat(turn)
                continue

            trick_no += 1
            leader_seat = trick[0].seat
            winner = resolve_trick_winner(trick, puzzle["contract"]["strain"])
            tricks_won[side_of(winner)] += 1
            trick_text = " ".join(f"{p.seat}:{p.card_id}" for p in trick)
            print(f"Trick {trick_no}: {trick_text}")
            print(f"Winner: {winner}")
            print_newspaper_with_trick(hands, trick, leader_seat)
            print("Play details:")
            for line, feature_line, dd_line in trick_details:
                print(f"  {line}")
                if feature_line:
                    print(f"    features: {feature_line}")
                if dd_line:
                    print(f"    {dd_line}")
            print("")
            if goal_status == "assuredFailure":
                print("GOAL FAILED: assured failure reached — run stopped early")
                print(f"Final tricks: NS {tricks_won['NS']} - EW {tricks_won['EW']}")
                return
            leader = winner
            turn = leader
            trick = []
            trick_details = []
    finally:
        policy_client.stop()
        if threat_client is not None:
            threat_client.stop()

    if forced_line is not None and forced_idx != len(forced_line):
        raise RuntimeError("Forced replay line has remaining unused plies")

    print(f"Final tricks: NS {tricks_won['NS']} - EW {tricks_won['EW']}")


def main() -> None:
    t_main_start = time.perf_counter()
    parser = argparse.ArgumentParser(description="Play one puzzle movie using policy CLI for E/W.")
    parser.add_argument("--problem-id", default="p009", help="Existing repo problem id, e.g. p009")
    parser.add_argument(
        "--ns-script",
        default="",
        help="Comma-separated NS card ids in play order for NS turns, e.g. ST,SK,HT",
    )
    parser.add_argument("--ns-seed", type=int, default=1, help="Seed for random NS fallback moves")
    parser.add_argument("--enumerate", action="store_true", help="Enumerate all deterministic runs (DFS)")
    parser.add_argument("--show-run", type=int, default=None, help="When used with --enumerate, replay this run number")
    parser.add_argument(
        "--run-lines",
        choices=["on", "off"],
        default="on",
        help="Emit per-run enumeration lines ('Run N ...'). Use off for maintenance/profiling workflows.",
    )
    parser.add_argument(
        "--dd-scope",
        choices=["auto", "none", "ns", "ew", "all"],
        default="auto",
        help="DD validation scope; auto derives defender side from goal.side",
    )
    parser.add_argument("--dd-discrepancies-only", action="store_true", help="With --enumerate, print only runs that contain DD discrepancies")
    parser.add_argument("--dd-export-jsonl", default=None, help="Write factual DD records (keyed by canonical signature) to this JSONL file")
    parser.add_argument("--dd-export-all", action="store_true", help="With --dd-export-jsonl, emit all validated positions (default filters to useful varying states)")
    parser.add_argument("--dd-source", choices=["off", "runtime"], default="off", help="TS DD backstop source passed into policy layer")
    parser.add_argument(
        "--ts-dd-trace",
        choices=["on", "off"],
        default="on",
        help="Emit TS per-decision DD trace lines from policy:serve (bulk workflows should use off)",
    )
    parser.add_argument(
        "--profile",
        action="store_true",
        help="Emit compact timing/profile summary (intended for focused investigation, e.g. p007)",
    )
    parser.add_argument(
        "--profile-heartbeat-sec",
        type=float,
        default=15.0,
        help="In --profile mode, emit heartbeat every N seconds during enumeration",
    )
    parser.add_argument(
        "--dd-analyze",
        action="store_true",
        help="Group runtime DD discrepancies into root-cause categories with compact samples",
    )
    parser.add_argument(
        "--dd-analyze-samples",
        type=int,
        default=2,
        help="Max representative samples per category for --dd-analyze",
    )
    args = parser.parse_args()

    ns_script = [c.strip().upper() for c in args.ns_script.split(",") if c.strip()]
    puzzle = load_problem(args.problem_id)
    effective_dd_scope = derive_dd_scope_from_goal_side(puzzle["goal"]["side"]) if args.dd_scope == "auto" else args.dd_scope
    if effective_dd_scope != "none" and not has_endplay():
        print("DDS/endplay not available — execution skipped (edit-only environment).")
        raise SystemExit(0)
    dd_validator: Optional[DoubleDummyValidator] = None
    if effective_dd_scope != "none":
        dd_validator = DoubleDummyValidator()
    if args.dd_export_jsonl and effective_dd_scope == "none":
        raise RuntimeError("--dd-export-jsonl requires --dd-scope ns|ew|all")
    if args.show_run is not None and args.show_run <= 0:
        raise RuntimeError("--show-run must be >= 1")

    dd_exporter: Optional[DDRecordExporter] = None
    if args.dd_export_jsonl:
        export_path = os.path.abspath(args.dd_export_jsonl)
        dd_exporter = DDRecordExporter(export_path, emit_all_states=args.dd_export_all)

    print(f"DD source: {args.dd_source}")
    ts_dd_trace_enabled = args.ts_dd_trace == "on"

    try:
        if args.enumerate:
            enum_profile = EnumProfile()
            policy_client = PersistentPolicyClient(ts_dd_trace=ts_dd_trace_enabled)
            threat_client: Optional[PersistentThreatStateClient] = None
            t_enum_start = time.perf_counter()
            total: Optional[int] = None
            selected: Optional[List[Tuple[str, str]]] = None
            selected_summary: Optional[str] = None
            selected_dd_failures: Optional[List[Tuple[int, int, str, str, List[str], int, str]]] = None
            discrepancies: List[DDDiscrepancy] = []
            discrepancy_analysis: List[DDDiscrepancyAnalysis] = []
            interrupted = False
            policy_client.start()
            if puzzle.get("threatCardIds"):
                threat_client = PersistentThreatStateClient()
                threat_client.start()
            try:
                try:
                    total, selected, selected_summary, selected_dd_failures, discrepancies, discrepancy_analysis = enumerate_runs(
                        puzzle,
                        policy_client,
                        threat_client,
                        args.dd_source,
                        args.show_run,
                    dd_validator=dd_validator,
                    dd_scope=effective_dd_scope,
                    dd_discrepancies_only=args.dd_discrepancies_only,
                    emit_summaries=(args.run_lines == "on" and args.show_run is None),
                    dd_exporter=dd_exporter,
                    profile=enum_profile,
                    profile_mode=args.profile,
                        profile_heartbeat_sec=max(1.0, float(args.profile_heartbeat_sec)),
                    )
                except KeyboardInterrupt:
                    interrupted = True
            finally:
                policy_client.stop()
                if threat_client is not None:
                    threat_client.stop()
                if args.profile:
                    t_now = time.perf_counter()
                    enum_s = t_now - t_enum_start
                    total_s = t_now - t_main_start
                    setup_s = max(0.0, total_s - enum_s)
                    status = "interrupted" if interrupted else "complete"
                    print(
                        "PROFILE "
                        f"problem={args.problem_id} status={status} setup_s={setup_s:.3f} enumerate_s={enum_s:.3f} total_s={total_s:.3f}",
                        flush=True,
                    )
                    print(
                        "PROFILE "
                        f"policy_queries={enum_profile.policy_queries} policy_query_s={enum_profile.policy_query_s:.3f} "
                        f"dd_checks={enum_profile.dd_checks} dd_check_s={enum_profile.dd_check_s:.3f} "
                        f"threat_updates={enum_profile.threat_updates} threat_update_s={enum_profile.threat_update_s:.3f}",
                        flush=True,
                    )
                    if dd_validator is not None:
                        snap = dd_validator.profile_snapshot()
                        avg_ms = (1000.0 * snap["ddTotalSeconds"] / snap["ddCalls"]) if snap["ddCalls"] else 0.0
                        avg_miss_ms = (1000.0 * snap["ddCacheMissSeconds"] / snap["ddCacheMisses"]) if snap["ddCacheMisses"] else 0.0
                        avg_hit_ms = (1000.0 * snap["ddCacheHitSeconds"] / snap["ddCacheHits"]) if snap["ddCacheHits"] else 0.0
                        avg_sig_ms = (1000.0 * snap["ddSignatureSeconds"] / snap["ddCalls"]) if snap["ddCalls"] else 0.0
                        avg_run_ms = (1000.0 * enum_s / enum_profile.terminal_runs) if enum_profile.terminal_runs else 0.0
                        non_dd_loop_s = max(
                            0.0,
                            enum_s - enum_profile.policy_query_s - enum_profile.dd_check_s - enum_profile.threat_update_s
                        )
                        print(
                            "PROFILE "
                            f"dd_calls={snap['ddCalls']} dd_solver_s={snap['ddTotalSeconds']:.3f} "
                            f"dd_unique_signatures={snap['ddUniqueSignatures']} dd_repeated_signatures={snap['ddRepeatedSignatures']} "
                            f"dd_cache_hits={snap['ddCacheHits']} dd_cache_misses={snap['ddCacheMisses']} "
                            f"dd_cache_hit_rate={100.0 * snap['ddCacheHitRate']:.1f}% dd_avg_ms={avg_ms:.2f} "
                            f"dd_miss_avg_ms={avg_miss_ms:.2f} dd_hit_avg_ms={avg_hit_ms:.4f} dd_sig_avg_ms={avg_sig_ms:.4f} "
                            f"non_dd_loop_s={non_dd_loop_s:.3f} avg_run_ms={avg_run_ms:.4f}",
                            flush=True,
                        )
            if interrupted:
                raise SystemExit(130)
            if args.show_run is None:
                print(f"Total runs: {total}")
            if dd_validator is not None and args.show_run is None:
                print(f"DD discrepancies: {len(discrepancies)}")
                if not args.dd_analyze:
                    for d in discrepancies:
                        print(
                            f"DD Run {d.run_no}  pos {d.position_index} trick {d.trick_no}  {d.seat} played {pretty_card(d.actual_card)}  "
                            f"optimal {{{', '.join(pretty_card(c) for c in safe_list(d.optimal_cards))}}} max={d.max_tricks} severity={d.severity}"
                        )
            if args.dd_analyze and args.show_run is None and discrepancy_analysis:
                by_cat: Dict[str, List[DDDiscrepancyAnalysis]] = {}
                for rec in discrepancy_analysis:
                    by_cat.setdefault(rec.category, []).append(rec)
                print("DD analysis (runtime discrepancy categories):")
                ordered = sorted(by_cat.items(), key=lambda kv: len(kv[1]), reverse=True)
                for cat, recs in ordered:
                    print(f"DD category {cat}: {len(recs)}")
                    for sample in recs[: max(1, int(args.dd_analyze_samples))]:
                        prefix_with_fail = sample.transcript_prefix + [sample.failing_play]
                        print(
                            "  "
                            f"run={sample.run_no} pos={sample.position_index} trick={sample.trick_no} seat={sample.seat} "
                            f"chosen={sample.chosen} directOptimal={{{','.join(safe_list(sample.direct_optimal))}}} "
                            f"lookup={'yes' if sample.lookup else 'no'} found={'yes' if sample.found else 'no'} path={sample.path}"
                        )
                        print(
                            "  "
                            f"transcript={format_compact_line(prefix_with_fail)}  FAIL={sample.failing_play[0]}:{sample.failing_play[1]}"
                        )
                        print(
                            "  "
                            f"sig={sample.signature} legal=[{','.join(safe_list(sample.legal))}] "
                            f"base=[{','.join(safe_list(sample.base))}] runtimeOptimal=[{','.join(safe_list(sample.runtime_optimal))}]"
                        )
            if args.show_run is not None:
                if selected is None:
                    raise RuntimeError(f"Requested run {args.show_run} not found (total {total})")
                if selected_summary:
                    print(selected_summary)
                print("")
                print(f"=== Replay Run {args.show_run} ===")
                run_movie(
                    puzzle,
                    ns_script=[],
                    ns_random_seed=args.ns_seed,
                    dd_source=args.dd_source,
                    forced_line=selected,
                    dd_validator=dd_validator,
                    dd_scope=effective_dd_scope,
                    forced_dd_failures=selected_dd_failures,
                    dd_exporter=dd_exporter,
                    ts_dd_trace=ts_dd_trace_enabled,
                )
            return

        run_movie(
            puzzle,
            ns_script,
            args.ns_seed,
            args.dd_source,
            dd_validator=dd_validator,
            dd_scope=effective_dd_scope,
            ts_dd_trace=ts_dd_trace_enabled,
            dd_exporter=dd_exporter,
        )
    finally:
        if dd_exporter is not None:
            dd_exporter.close()
            print(f"DD records written: {dd_exporter.records_written} -> {dd_exporter.path}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
