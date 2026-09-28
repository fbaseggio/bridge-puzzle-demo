#!/usr/bin/env python3
"""One initial-position DDS query over JSON stdin/stdout for onboard-puzzle.ts."""

import importlib.metadata
import json
import sys


def main():
    request = json.load(sys.stdin)
    hands = request["hands"]
    turn = request["turn"]
    if turn not in ("N", "S"):
        raise ValueError("Onboarding currently requires an N/S opening lead")
    sizes = [sum(len(ranks) for ranks in hand.values()) for hand in hands.values()]
    if len(sizes) != 4 or len(set(sizes)) != 1 or not 1 <= sizes[0] <= 13:
        raise ValueError("DDA requires four equal, nonempty hands of at most 13 cards")

    # Keep native DDS startup isolated: a fatal library error must not kill the
    # parent checklist process or be mistaken for a successful negative test.
    from policy_movie import DoubleDummyValidator
    from endplay.dds import solve_board
    from endplay.dds.solve import SolveMode

    validator = DoubleDummyValidator()
    result = validator.optimal_for_position(hands, [], turn, request["strain"])
    legal_cards = {suit + rank for suit, ranks in hands[turn].items() for rank in ranks}
    if set(result.tricks_by_card) != legal_cards:
        raise RuntimeError("DDS did not score every legal first play")
    if not result.tricks_by_card or any(not 0 <= score <= sizes[0] for score in result.tricks_by_card.values()):
        raise RuntimeError("DDS returned invalid trick counts")

    pbn = validator._pbn_deal(hands)
    deal = validator.Deal(pbn)
    deal.trump = validator._to_denom(request["strain"])
    deal.first = validator._to_player(turn)
    optimal = {validator._normalize_card(card): int(tricks)
               for card, tricks in solve_board(deal, SolveMode.OptimalAll)}
    if set(optimal) != set(result.optimal_cards) or any(score != result.max_tricks for score in optimal.values()):
        raise RuntimeError("DDS all-optimal mode disagrees with the per-card scores")

    print(json.dumps({
        "maxTricksNS": result.max_tricks,
        "tricksByOpeningCard": result.tricks_by_card,
        "optimalOpeningCards": result.optimal_cards,
        "goalWinningOpeningCards": [card for card, tricks in result.tricks_by_card.items()
                                    if tricks >= request["goal"]],
        "pbn": pbn,
        "version": importlib.metadata.version("endplay"),
        "allOptimalModeAgrees": True,
    }))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"DDA failed: {error}", file=sys.stderr)
        sys.exit(1)
