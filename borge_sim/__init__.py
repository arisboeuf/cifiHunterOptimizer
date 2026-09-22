"""Borge simulator helpers (local twin of cifi-tools.com/borge).

Default combat engine is the vendored cifi-tools WASM (`EVALBORGE_WASM`) when
`wasmtime` + `vendor/cifi_wasm/release.wasm` are available; otherwise the
Python hunter-sim fallback is used.
"""

from .eval import SimResult, resolve_engine, run_sims
from .optimize import OptimizeConfig, OptimizeResult, optimize_build

__all__ = [
    "SimResult",
    "OptimizeConfig",
    "OptimizeResult",
    "optimize_build",
    "resolve_engine",
    "run_sims",
]
