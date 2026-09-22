#!/usr/bin/env python3
"""Download cifi-tools release.wasm into vendor/cifi_wasm/."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from borge_sim.wasm_engine import WASM_PATH, WASM_URL, ensure_wasm  # noqa: E402


def main() -> None:
    path = ensure_wasm(download=True)
    size = path.stat().st_size
    print(f"OK  {path}")
    print(f"    {size} bytes from {WASM_URL}")
    if path.resolve() != WASM_PATH.resolve():
        print(f"    expected {WASM_PATH}")


if __name__ == "__main__":
    main()
