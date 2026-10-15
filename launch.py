#!/usr/bin/env python3
"""Start Hunter Sim locally: serves ./web and OfflineHunt API (/api/sim).

Run in Cursor: open this file → Run.
Engine toggle in the UI: WASM (cifi-tools) or Offline (Python sim/).
"""

from __future__ import annotations

import argparse
import json
import socket
import sys
import threading
import time
import traceback
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
PREFERRED_PORT = 8080

# Import sim package from repo root
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def find_free_port(preferred: int) -> int:
    for port in range(preferred, preferred + 40):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise RuntimeError(f"No free port near {preferred}")


class HunterHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        # Quieter default; API errors still print via do_POST
        if args and str(args[0]).startswith('"POST /api'):
            super().log_message(fmt, *args)

    def _send_json(self, code: int, payload: dict) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/health":
            self._send_json(
                200,
                {
                    "ok": True,
                    "offline_sim": True,
                    "hunters": ["borge", "ozzy"],
                    "stats_engine": "hunt_statistics",
                    "note": "WASM still served as static web/wasm/release.wasm",
                },
            )
            return
        return super().do_GET()

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path != "/api/sim":
            self.send_error(404, "Not Found")
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length else b"{}"
            data = json.loads(raw.decode("utf-8"))
        except Exception as exc:
            self._send_json(400, {"error": f"invalid JSON: {exc}"})
            return

        try:
            # Always load a fresh sim package (reload can leave stale bindings).
            for _name in list(sys.modules):
                if _name == "sim" or _name.startswith("sim."):
                    del sys.modules[_name]

            from sim.config import build_from_dict
            from sim.engine import run_monte_carlo
            from sim.hunter_stats import resolve_combat_stats

            hunter = str(data.get("hunter") or (data.get("build") or {}).get("meta", {}).get("hunter") or "borge")
            hunter = hunter.lower()
            if hunter not in ("borge", "ozzy"):
                self._send_json(400, {"error": "offline sim supports borge and ozzy only (not knox)"})
                return

            build_data = dict(data.get("build") or {})
            # Offline API always computes finals via HuntStatistics (ignore saved WASM dumps).
            build_data.pop("combat", None)
            if isinstance(build_data.get("meta"), dict):
                build_data = {
                    **build_data,
                    "meta": {**build_data["meta"], "hunter": "Ozzy" if hunter == "ozzy" else "Borge"},
                }
            else:
                build_data = {**build_data, "meta": {"hunter": "Borge" if hunter == "borge" else "Ozzy"}}

            build = build_from_dict(build_data)
            n = max(1, min(50_000, int(data.get("n") or 1)))
            seed = int(data.get("seed") or 1)
            stop = data.get("stop_after_boss")
            stop_after_boss = int(stop) if stop is not None else None
            bosses = data.get("bosses") or [100, 200, 300]
            bosses = [int(b) for b in bosses]
            # Bound wall-clock per hunt so a bad loop cannot freeze the UI.
            max_time = float(data.get("max_time") or 3_600.0)
            max_stage = int(data.get("max_stage") or 2000)

            mc = run_monte_carlo(
                build,
                n=n,
                seed=seed,
                stop_after_boss=stop_after_boss,
                keep_runs=bool(data.get("keep_runs")),
                boss_stages=bosses,
                max_time=max_time,
                max_stage=max_stage,
            )
            out = mc.to_dict(include_runs=bool(data.get("keep_runs")))
            combat = resolve_combat_stats(build)
            out["combat"] = {
                "max_hp": combat.max_hp,
                "atk_power": combat.atk_power,
                "hp_regen": combat.hp_regen,
                "dmg_reduction": combat.dmg_reduction,
                "evade_chance": combat.evade_chance,
                "effect_chance": combat.effect_chance,
                "crit_chance": combat.crit_chance,
                "crit_power": combat.crit_power,
                "atk_interval": combat.atk_interval,
            }
            # Rough mat/xp placeholders (stub loot split)
            out["mat1"] = out.get("avg_loot", 0) * 0.4
            out["mat2"] = out.get("avg_loot", 0) * 0.35
            out["mat3"] = out.get("avg_loot", 0) * 0.25
            out["xp"] = out.get("avg_loot", 0) * 0.1
            self._send_json(200, out)
        except Exception as exc:
            traceback.print_exc()
            self._send_json(500, {"error": str(exc)})


def main() -> int:
    parser = argparse.ArgumentParser(description="Launch Hunter Sim (web/ + OfflineHunt API)")
    parser.add_argument("-p", "--port", type=int, default=PREFERRED_PORT, help="Preferred port")
    parser.add_argument("--no-browser", action="store_true", help="Do not open a browser tab")
    args = parser.parse_args()

    if not WEB.is_dir():
        print(f"Missing web folder: {WEB}", file=sys.stderr)
        return 1

    try:
        import sim  # noqa: F401
    except Exception as exc:
        print(f"Warning: sim package import failed ({exc}). Offline engine toggle will error.", file=sys.stderr)

    port = find_free_port(args.port)
    ThreadingHTTPServer.allow_reuse_address = True
    httpd = ThreadingHTTPServer(("127.0.0.1", port), HunterHandler)
    url = f"http://127.0.0.1:{port}/"

    print()
    print("  Hunter Sim", flush=True)
    print(f"  Serving: {WEB}", flush=True)
    print(f"  Open:    {url}", flush=True)
    print("  Engines: WASM (web/wasm) + Offline API /api/sim (Borge/Ozzy)", flush=True)
    if port != args.port:
        print(f"  (port {args.port} busy → using {port})", flush=True)
    print("  Stop:    Ctrl+C", flush=True)
    print(flush=True)

    if not args.no_browser:
        threading.Thread(target=lambda: (time.sleep(0.4), webbrowser.open(url)), daemon=True).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
