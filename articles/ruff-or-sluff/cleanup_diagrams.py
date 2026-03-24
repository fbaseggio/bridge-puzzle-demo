#!/usr/bin/env python3
"""Heuristic cleanup helper for OCR'd bridge diagrams.

This is intentionally conservative. It tries to normalize likely four-hand
diagram blocks from OCR text and emits warnings when the result looks weak.

The rules are tuned for the RuffOrSluff scan:
- hands should usually have a common size, typically <= 8 unless a full deal
- suit rows are vertical and ordered S/H/D/C
- ranks are regular bridge ranks, with 10 preferred over T in this article
"""

from __future__ import annotations

import argparse
import re
from dataclasses import dataclass, field
from pathlib import Path


SEATS = ("NORTH", "WEST", "EAST", "SOUTH")
SUITS = ("S", "H", "D", "C")
RANK_ORDER = ("A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2")
VOID_CHARS = {"-", "_", "="}
COMMON_HAND_SIZES = (1, 2, 3, 4, 5, 6, 7, 8, 13)
SUIT_GLYPHS = {
    "S": ("♠", "4", "A", "A-", "."),
    "H": ("♥", "♡", "V", "7", "Y"),
    "D": ("♦", "♢", "t", "E", "0-"),
    "C": ("♣", "4-", "e", "of", "¢"),
}


@dataclass
class SeatBlock:
    seat: str
    raw_lines: list[str]
    suits: dict[str, list[str]]
    confidence: int = 0

    @property
    def total_cards(self) -> int:
        return sum(len(cards) for cards in self.suits.values())


@dataclass
class DiagramAttempt:
    page: int
    start_line: int
    seats: dict[str, SeatBlock]
    expected_size: int | None
    warnings: list[str] = field(default_factory=list)

    @property
    def score(self) -> int:
        base = sum(block.confidence for block in self.seats.values())
        penalty = 3 * len(self.warnings)
        return base - penalty


def compact(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def normalized_text(text: str) -> str:
    return text.upper().replace("\u2019", "'").replace("\u2018", "'")


def clean_rank_line(line: str) -> str:
    text = normalized_text(line)
    replacements = {
        "I0": "10",
        "L0": "10",
        "IO": "10",
        "LO": "10",
        "T": "10",
        "O": "0",
        "SOUTH": "",
        "NORTH": "",
        "WEST": "",
        "EAST": "",
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    text = re.sub(r"[()\[\]{}'\"`~?.,;:!/\\|]", "", text)
    text = text.replace(" ", "")
    return text


def extract_ranks(line: str) -> tuple[list[str], int]:
    text = clean_rank_line(line)
    if not text or set(text) <= VOID_CHARS:
        return [], 0

    ranks: list[str] = []
    confidence = 0
    idx = 0
    while idx < len(text):
        if text.startswith("10", idx):
            ranks.append("10")
            confidence += 2
            idx += 2
            continue
        ch = text[idx]
        if ch in {"A", "K", "Q", "J", "9", "8", "7", "6", "5", "4", "3", "2"}:
            ranks.append(ch)
            confidence += 2
        elif ch in {"1", "L", "I"}:
            # Lone 1/L/I often comes from 10 or suit glyph noise; ignore it.
            confidence -= 1
        else:
            confidence -= 1
        idx += 1
    return ranks, confidence


def seat_line_indices(lines: list[str]) -> dict[str, int]:
    found: dict[str, int] = {}
    for idx, line in enumerate(lines):
        upper = normalized_text(line)
        for seat in SEATS:
            if seat in upper and seat not in found:
                found[seat] = idx
    return found


def slice_seat_lines(lines: list[str], start_idx: int, next_idx: int | None) -> list[str]:
    end = next_idx if next_idx is not None else min(len(lines), start_idx + 10)
    raw = [line.rstrip() for line in lines[start_idx + 1 : end]]
    out: list[str] = []
    for line in raw:
        if not compact(line):
            if out:
                break
            continue
        out.append(line)
        if len(out) >= 4:
            break
    return out


def build_seat_block(seat: str, lines: list[str]) -> SeatBlock:
    suit_lines = lines[:4]
    while len(suit_lines) < 4:
        suit_lines.append("")
    suits: dict[str, list[str]] = {}
    confidence = 0
    for suit, line in zip(SUITS, suit_lines):
        cards, line_confidence = extract_ranks(line)
        suits[suit] = cards
        confidence += line_confidence
        if any(glyph in normalized_text(line) for glyph in SUIT_GLYPHS[suit]):
            confidence += 1
    return SeatBlock(seat=seat, raw_lines=suit_lines, suits=suits, confidence=confidence)


def choose_expected_hand_size(blocks: dict[str, SeatBlock]) -> int | None:
    totals = [block.total_cards for block in blocks.values() if block.total_cards > 0]
    if not totals:
        return None
    if any(total >= 11 for total in totals):
        return 13
    counts: dict[int, int] = {}
    for total in totals:
        nearest = min(COMMON_HAND_SIZES[:-1], key=lambda size: abs(size - total))
        counts[nearest] = counts.get(nearest, 0) + 1
    return max(sorted(counts), key=lambda size: (counts[size], -abs(size - max(totals))))


def analyze_diagram(page: int, start_line: int, window: list[str]) -> DiagramAttempt | None:
    seat_idxs = seat_line_indices(window)
    if "NORTH" not in seat_idxs or "SOUTH" not in seat_idxs:
        return None

    ordered = sorted(seat_idxs.items(), key=lambda item: item[1])
    blocks: dict[str, SeatBlock] = {}
    for i, (seat, idx) in enumerate(ordered):
        next_idx = ordered[i + 1][1] if i + 1 < len(ordered) else None
        blocks[seat] = build_seat_block(seat, slice_seat_lines(window, idx, next_idx))

    if not {"WEST", "EAST"} & set(blocks):
        return None

    expected = choose_expected_hand_size(blocks)
    warnings: list[str] = []

    if expected is not None:
        for seat in SEATS:
            block = blocks.get(seat)
            if block is None:
                warnings.append(f"{seat}: missing entirely")
                continue
            if block.total_cards == 0:
                warnings.append(f"{seat}: no cards parsed")
            elif block.total_cards != expected:
                warnings.append(f"{seat}: parsed {block.total_cards} cards, expected about {expected}")

    for seat, block in blocks.items():
        for suit in SUITS:
            cards = block.suits[suit]
            if len(cards) != len(set(cards)):
                warnings.append(f"{seat} {suit}: duplicate ranks after cleanup")
            illegal = [card for card in cards if card not in RANK_ORDER]
            if illegal:
                warnings.append(f"{seat} {suit}: illegal ranks {illegal}")
        if block.total_cards > 8 and block.total_cards != 13:
            warnings.append(f"{seat}: unusual hand size {block.total_cards}")

    return DiagramAttempt(page=page, start_line=start_line, seats=blocks, expected_size=expected, warnings=warnings)


def dedupe_attempts(attempts: list[DiagramAttempt]) -> list[DiagramAttempt]:
    best_by_signature: dict[tuple[int, tuple[tuple[str, int], ...]], DiagramAttempt] = {}
    for attempt in attempts:
        signature = (
            attempt.page,
            tuple((seat, attempt.seats.get(seat).total_cards if attempt.seats.get(seat) else -1) for seat in SEATS),
        )
        current = best_by_signature.get(signature)
        if current is None or attempt.score > current.score:
            best_by_signature[signature] = attempt
    return sorted(best_by_signature.values(), key=lambda attempt: (attempt.page, attempt.start_line))


def find_diagrams(text: str) -> list[DiagramAttempt]:
    pages = text.split("\f")
    attempts: list[DiagramAttempt] = []
    for page_no, page in enumerate(pages, start=1):
        lines = page.splitlines()
        for idx, line in enumerate(lines):
            if "NORTH" not in normalized_text(line):
                continue
            window = lines[idx : idx + 30]
            attempt = analyze_diagram(page_no, idx + 1, window)
            if attempt is not None:
                attempts.append(attempt)
    return dedupe_attempts(attempts)


def format_cards(cards: list[str]) -> str:
    if not cards:
        return "-"
    sorted_cards = sorted(cards, key=lambda card: RANK_ORDER.index(card))
    return "".join(sorted_cards)


def render_attempt(attempt: DiagramAttempt, number: int) -> str:
    lines = [
        f"=== Diagram {number} ===",
        f"Page {attempt.page}, line {attempt.start_line}",
        f"Expected hand size: {attempt.expected_size if attempt.expected_size is not None else 'unknown'}",
        f"Score: {attempt.score}",
    ]
    for seat in SEATS:
        block = attempt.seats.get(seat)
        if block is None:
            lines.append(f"{seat}: missing")
            continue
        lines.append(f"{seat} ({block.total_cards})")
        for suit in SUITS:
            lines.append(f"  {suit}: {format_cards(block.suits[suit])}")
    if attempt.warnings:
        lines.append("Warnings:")
        for warning in attempt.warnings:
            lines.append(f"  - {warning}")
    return "\n".join(lines)


def render_warning_summary(attempts: list[DiagramAttempt]) -> str:
    lines = [
        "RuffOrSluff diagram cleanup warnings",
        "",
        "This is a manual-review file. Any diagram listed here still looks uncertain.",
        "",
    ]
    for number, attempt in enumerate(attempts, start=1):
        if not attempt.warnings:
            continue
        lines.append(f"Diagram {number} (page {attempt.page}, line {attempt.start_line})")
        for warning in attempt.warnings:
            lines.append(f"- {warning}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="Attempt to clean OCR'd bridge diagrams.")
    parser.add_argument(
        "--input",
        default="articles/ruff-or-sluff/ocr-first-pass.txt",
        help="Path to OCR text input",
    )
    parser.add_argument(
        "--output",
        default="articles/ruff-or-sluff/diagrams-auto-clean.txt",
        help="Path to cleaned diagram output",
    )
    parser.add_argument(
        "--warnings-output",
        default="articles/ruff-or-sluff/diagrams-auto-clean-warnings.txt",
        help="Path to warning summary output",
    )
    args = parser.parse_args()

    text = Path(args.input).read_text()
    attempts = find_diagrams(text)

    out_lines = [
        "RuffOrSluff automatic diagram cleanup attempt",
        "",
        "Heuristics used:",
        "- hands are parsed as four vertical suit rows in S/H/D/C order",
        "- ranks are normalized to bridge ranks with 10 preferred over T",
        "- all four seats are expected to land near a common hand size",
        "- hand sizes above 8 are treated as unusual unless they resolve to 13",
        "- ambiguous or suspicious parses are left in place but flagged",
        "",
    ]
    for idx, attempt in enumerate(attempts, start=1):
        out_lines.append(render_attempt(attempt, idx))
        out_lines.append("")

    Path(args.output).write_text("\n".join(out_lines).rstrip() + "\n")
    Path(args.warnings_output).write_text(render_warning_summary(attempts))
    print(
        f"Wrote {args.output} and {args.warnings_output} "
        f"with {len(attempts)} candidate diagrams."
    )


if __name__ == "__main__":
    main()
