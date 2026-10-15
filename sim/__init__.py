"""Extraction-based OfflineHunt Monte-Carlo simulator (Borge + Ozzy).

Not bit-identical to cifi-tools WASM until distribution checks pass.
See sim/STATUS.md for ported vs stub coverage.
"""

from .config import BuildConfig, load_build
from .engine import run_hunt, run_monte_carlo
from .result import HuntResult, MonteCarloResult

__all__ = [
    "BuildConfig",
    "HuntResult",
    "MonteCarloResult",
    "load_build",
    "run_hunt",
    "run_monte_carlo",
]

__version__ = "0.1.0"
