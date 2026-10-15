# cifi-sim (Rust OfflineHunt port)

Rust port of [`sim/`](../sim/) — our own hunt Monte Carlo, compiled to WASM for the browser.

UI engine option: **Rust/WASM** (alongside cifi-tools WASM and Python Offline).

## Build (WASM for the web UI)

Prerequisites:

- [Rust](https://rustup.rs) (stable)
- Host linker: MSVC Build Tools **or** MinGW (`x86_64-pc-windows-gnu`)
- `wasm-pack` (`cargo install wasm-pack`)
- Target: `rustup target add wasm32-unknown-unknown`

```powershell
cd rust-sim
wasm-pack build --release --target web --out-dir ../web/wasm/cifi-sim
```

This writes `web/wasm/cifi-sim/cifi_sim.js` and `cifi_sim_bg.wasm` (committed so the UI works without a local rebuild).

## Native check

```powershell
cd rust-sim
cargo test
# or:
cargo run --example smoke   # if present
```

## Parity

- Tag: `engine=rust_hunt_port`, `parity=vs_python_unvalidated`
- Intended to track the Python OfflineHunt port; compare against `/api/sim` before trusting optimizer use
- Knox is out of scope (same as Python)

## API

`run_monte_carlo_json(build_json, n, seed, max_time) -> JSON string`

Same envelope as `launch.py` `/api/sim` (aggregates, `combat`, mat/xp stubs).
