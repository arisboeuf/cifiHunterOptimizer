"""Import path setup for vendored hunter-sim."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VENDOR = ROOT / "vendor"


def ensure_path() -> None:
    # Only ``vendor/`` so ``hunter_sim`` resolves to the package, not ``hunter_sim.py``.
    p = str(VENDOR)
    if p not in sys.path:
        sys.path.insert(0, p)


ensure_path()

from hunter_sim.hunters import Borge, Hunter  # noqa: E402
from hunter_sim.sim import Simulation, SimulationManager  # noqa: E402

__all__ = ["Borge", "Hunter", "Simulation", "SimulationManager", "ensure_path", "ROOT"]
