#!/usr/bin/env python3
"""Start Hunter Sim locally (serves ./web). Run in Cursor: open this file → Run."""

from __future__ import annotations

import argparse
import functools
import http.server
import socket
import socketserver
import sys
import threading
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
PREFERRED_PORT = 8080


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


def main() -> int:
    parser = argparse.ArgumentParser(description="Launch Hunter Sim (static web/ server)")
    parser.add_argument("-p", "--port", type=int, default=PREFERRED_PORT, help="Preferred port")
    parser.add_argument("--no-browser", action="store_true", help="Do not open a browser tab")
    args = parser.parse_args()

    if not WEB.is_dir():
        print(f"Missing web folder: {WEB}", file=sys.stderr)
        return 1

    port = find_free_port(args.port)
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(WEB))

    # Allow Ctrl+C on Windows more reliably
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", port), handler)
    url = f"http://127.0.0.1:{port}/"

    print()
    print("  Hunter Sim", flush=True)
    print(f"  Serving: {WEB}", flush=True)
    print(f"  Open:    {url}", flush=True)
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
