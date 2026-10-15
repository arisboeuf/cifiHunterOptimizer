"""CLI: python -m sim run|mc …"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .config import load_build
from .engine import run_hunt, run_monte_carlo


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="sim",
        description="Extraction-based OfflineHunt MC simulator (Borge + Ozzy). Not WASM-identical.",
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    run_p = sub.add_parser("run", help="single hunt")
    run_p.add_argument("--build", required=True, help="build JSON path")
    run_p.add_argument("--seed", type=int, default=1)
    run_p.add_argument("--stop-after-boss", type=int, default=None)
    run_p.add_argument("--max-stage", type=int, default=2000)
    run_p.add_argument("--max-time", type=float, default=86400.0)

    mc_p = sub.add_parser("mc", help="Monte-Carlo batch")
    mc_p.add_argument("--build", required=True)
    mc_p.add_argument("--n", type=int, default=100)
    mc_p.add_argument("--seed", type=int, default=1)
    mc_p.add_argument("--stop-after-boss", type=int, default=None)
    mc_p.add_argument("--keep-runs", action="store_true")
    mc_p.add_argument("--bosses", default="100,200,300", help="comma-separated boss stages")
    mc_p.add_argument("-o", "--output", default=None, help="write JSON result")

    args = p.parse_args(argv)
    build = load_build(args.build)

    if args.cmd == "run":
        result = run_hunt(
            build,
            seed=args.seed,
            stop_after_boss=args.stop_after_boss,
            max_stage=args.max_stage,
            max_time=args.max_time,
        )
        print(json.dumps(result.to_dict(), indent=2))
        return 0

    bosses = [int(x) for x in args.bosses.split(",") if x.strip()]
    mc = run_monte_carlo(
        build,
        n=args.n,
        seed=args.seed,
        stop_after_boss=args.stop_after_boss,
        keep_runs=args.keep_runs,
        boss_stages=bosses,
    )
    payload = mc.to_dict(include_runs=args.keep_runs)
    text = json.dumps(payload, indent=2)
    if args.output:
        Path(args.output).write_text(text, encoding="utf-8")
        print(f"wrote {args.output}", file=sys.stderr)
    print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
