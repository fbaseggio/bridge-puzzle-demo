#!/usr/bin/env python3
import argparse
import json
import random
import subprocess
import sys
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple, Any

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


def next_seat(seat: str) -> str:
    i = SEAT_ORDER.index(seat)
    return SEAT_ORDER[(i + 1) % 4]


def side_of(seat: str) -> str:
    return "NS" if seat in ("N", "S") else "EW"


def parse_card(card_id: str) -> Tuple[str, str]:
    return card_id[0], card_id[1:]


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
    def __init__(self) -> None:
        self.proc: Optional[subprocess.Popen[str]] = None

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
        seat: str,
        policy_kind: str,
        hands: Dict[str, Dict[str, List[str]]],
        trick: List[Play],
        rng_state: Dict[str, int],
        threat_state: Optional[Dict[str, Any]],
    ) -> Tuple[str, Dict[str, int], Dict[str, Any]]:
        if not self.proc or not self.proc.stdin or not self.proc.stdout:
            raise RuntimeError("Policy server is not running")
        payload = {
            "schemaVersion": 1,
            "policyVersion": 1,
            "input": {
                "policy": {"kind": policy_kind},
                "seat": seat,
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
        result = out["result"]
        chosen = result["chosenCardId"]
        next_rng = result["rngAfter"]
        if not chosen:
            raise RuntimeError("policy:serve returned null chosenCardId")
        return chosen, next_rng, result


class PersistentThreatStateClient:
    def __init__(self) -> None:
        self.proc: Optional[subprocess.Popen[str]] = None

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
        state = out.get("state")
        if not isinstance(state, dict):
            raise RuntimeError("threat:serve response missing state")
        return state

    def init_state(self, hands: Dict[str, Dict[str, List[str]]], threat_card_ids: List[str]) -> Dict[str, Any]:
        return self._query({"mode": "init", "position": {"hands": hands}, "threatCardIds": threat_card_ids})

    def update_state(self, hands: Dict[str, Dict[str, List[str]]], state: Dict[str, Any], played_card_id: str) -> Dict[str, Any]:
        return self._query({"mode": "update", "position": {"hands": hands}, "state": state, "playedCardId": played_card_id})


def all_hands_empty(hands: Dict[str, Dict[str, List[str]]]) -> bool:
    return all(len(hands[seat][suit]) == 0 for seat in SEAT_ORDER for suit in SUIT_ORDER)


def run_movie(puzzle: Dict, ns_script: List[str], ns_random_seed: int) -> None:
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
    prev_policy_obs: Optional[Dict[str, Any]] = None
    threat_state: Optional[Dict[str, Any]] = None
    threat_card_ids = list(puzzle.get("threatCardIds", []))

    print(f"Movie start: problem={puzzle.get('id', '?')} nsScript={','.join(ns_script) if ns_script else '-'} nsSeed={ns_random_seed}")
    print("Initial deal:")
    print_newspaper(hands)
    print("")
    trick_details: List[str] = []

    policy_client = PersistentPolicyClient()
    policy_client.start()
    threat_client: Optional[PersistentThreatStateClient] = None
    if threat_card_ids:
        threat_client = PersistentThreatStateClient()
        threat_client.start()
        threat_state = threat_client.init_state(hands, threat_card_ids)
    try:
        while not all_hands_empty(hands):
            legal = legal_cards(hands, turn, trick)
            if not legal:
                raise RuntimeError(f"No legal cards for seat {turn}")

            if turn in ("N", "S"):
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
                chosen, policy_rng, policy_result = policy_client.query(turn, policy, hands, trick, policy_rng, threat_state)
                if chosen not in legal:
                    raise RuntimeError(
                        f"Policy chose illegal card {chosen} for {turn}. Legal: {', '.join(legal)}"
                    )
                chosen_bucket = policy_result.get("chosenBucket", "?")
                chosen_class = policy_result.get("policyClassByCard", {}).get(chosen, "?")
                rng_before = policy_result.get("rngBefore", {})
                rng_after = policy_result.get("rngAfter", {})
                if isinstance(policy_result.get("discardTiers"), dict):
                    legal_count = len(policy_result["discardTiers"].get("legal", []))
                else:
                    legal_count = len(policy_result.get("bucketCards", []))
                notes: List[str] = []
                if prev_policy_obs is not None:
                    if prev_policy_obs.get("bucket") != chosen_bucket:
                        notes.append(f"Δbucket {prev_policy_obs.get('bucket')}->{chosen_bucket}")
                    if prev_policy_obs.get("class") != chosen_class:
                        notes.append(f"Δclass {prev_policy_obs.get('class')}->{chosen_class}")
                    if prev_policy_obs.get("legal") != legal_count:
                        notes.append(f"Δlegal {prev_policy_obs.get('legal')}->{legal_count}")
                if isinstance(rng_before.get("counter"), int) and isinstance(rng_after.get("counter"), int):
                    notes.append(f"rngΔ={rng_after['counter'] - rng_before['counter']}")
                note_text = f" {'; '.join(notes)}" if notes else ""
                detail = (
                    f"{SUIT_SYMBOL[chosen[0]]}{chosen[1:]}  "
                    f"[policy bucket={chosen_bucket} class={chosen_class} "
                    f"rng={rng_before.get('seed')}:{rng_before.get('counter')}->{rng_after.get('counter')} legal={legal_count}]"
                    f"{note_text}"
                )
                prev_policy_obs = {"bucket": chosen_bucket, "class": chosen_class, "legal": legal_count}

            suit, rank = parse_card(chosen)
            remove_card(hands, turn, chosen)
            trick.append(Play(turn, suit, rank))
            trick_details.append(detail)
            if threat_state is not None and threat_client is not None:
                threat_state = threat_client.update_state(hands, threat_state, chosen)

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
            for line in trick_details:
                print(f"  {line}")
            print("")
            leader = winner
            turn = leader
            trick = []
            trick_details = []
    finally:
        policy_client.stop()
        if threat_client is not None:
            threat_client.stop()

    print(f"Final tricks: NS {tricks_won['NS']} - EW {tricks_won['EW']}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Play one puzzle movie using policy CLI for E/W.")
    parser.add_argument("--problem-id", default="p009", help="Existing repo problem id, e.g. p009")
    parser.add_argument(
        "--ns-script",
        default="",
        help="Comma-separated NS card ids in play order for NS turns, e.g. ST,SK,HT",
    )
    parser.add_argument("--ns-seed", type=int, default=1, help="Seed for random NS fallback moves")
    args = parser.parse_args()

    ns_script = [c.strip().upper() for c in args.ns_script.split(",") if c.strip()]
    puzzle = load_problem(args.problem_id)
    run_movie(puzzle, ns_script, args.ns_seed)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
