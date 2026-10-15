/** Browser bridge to our Rust OfflineHunt port (web/wasm/cifi-sim). */

import { mcToWasmShape } from "./mc-shape.js?v=engine12";

let _initPromise = null;
let _runFn = null;

/**
 * Load wasm-bindgen glue + cifi_sim_bg.wasm once.
 * @returns {Promise<boolean>}
 */
export async function ensureRustSim() {
  if (_runFn) return true;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    try {
      const mod = await import("../../wasm/cifi-sim/cifi_sim.js");
      await mod.default();
      if (typeof mod.run_monte_carlo_json !== "function") {
        throw new Error("run_monte_carlo_json missing from cifi-sim exports");
      }
      _runFn = mod.run_monte_carlo_json;
      return true;
    } catch (err) {
      console.error("Rust/WASM sim load failed:", err);
      _initPromise = null;
      _runFn = null;
      return false;
    }
  })();
  return _initPromise;
}

export async function probeRustSim() {
  return ensureRustSim();
}

export class RustHuntEngine {
  constructor(hunterId) {
    this.hunterId = hunterId;
    this.label = "rust";
  }

  static forHunter(hunterId) {
    return new RustHuntEngine(hunterId);
  }

  clearCombatCache() {}

  async evaluate(config, iterations) {
    const ok = await ensureRustSim();
    if (!ok || !_runFn) {
      throw new Error(
        "Rust/WASM sim not available — rebuild rust-sim (see rust-sim/README.md) or pick another engine.",
      );
    }
    const { combat: _drop, ...rest } = config || {};
    const build = {
      ...rest,
      meta: {
        ...(rest.meta || {}),
        hunter: this.hunterId === "ozzy" ? "Ozzy" : "Borge",
      },
    };
    const n = Math.max(1, Number(iterations) || 1);
    // wasm-bindgen maps Rust u64 → JS BigInt
    const raw = _runFn(JSON.stringify(build), n, 1n, 86_400);
    let mc;
    try {
      mc = JSON.parse(raw);
    } catch {
      throw new Error("Rust sim returned non-JSON");
    }
    if (mc && mc.error) {
      throw new Error(String(mc.error));
    }
    return mcToWasmShape(mc, this.hunterId, "rust");
  }
}
