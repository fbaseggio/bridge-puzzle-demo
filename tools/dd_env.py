#!/usr/bin/env python3


def has_endplay() -> bool:
    try:
        import endplay  # noqa: F401

        return True
    except Exception:
        return False
