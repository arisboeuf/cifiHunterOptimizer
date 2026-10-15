/** Browser bridge to local Python OfflineHunt sim via launch.py `/api/sim`.

Same build as WASM (stats, talents, attrs, inscryptions, relics, gems).
Python computes combat finals via ported HuntStatistics (no WASM dump required).
Optional explicit `combat` on the request is stripped so Offline stays self-contained.
*/

import { mcToWasmShape } from "./mc-shape.js?v=engine12";

const API = "/api/sim";

export class OfflineHuntEngine {
  /**
   * @param {string} hunterId
   * @param {{ evaluate: Function } | null} _wasmEngine unused (kept for call-site compat)
   */
  constructor(hunterId, _wasmEngine = null) {
    this.hunterId = hunterId;
    this.wasmEngine = null;
    this.label = "offline";
  }

  static forHunter(hunterId, wasmEngine = null) {
    return new OfflineHuntEngine(hunterId, wasmEngine);
  }

  clearCombatCache() {}

  /**
   * Async evaluate — callers must `await Promise.resolve(engine.evaluate(...))`.
   */
  async evaluate(config, iterations) {
    const { combat: _drop, ...rest } = config || {};
    const build = { ...rest };

    const body = {
      hunter: this.hunterId,
      build,
      n: Math.max(1, Number(iterations) || 1),
      seed: 1,
      // Must match launch.py default. Old servers that capped at 3600 looked "stuck" at ~stage 36.
      max_time: 86_400,
    };
    let res;
    try {
      res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(
        `Offline sim API unreachable (${err.message || err}). Start the app with launch.py (not a plain static server).`,
      );
    }
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const errBody = await res.json();
        detail = errBody.error || detail;
      } catch {
        /* ignore */
      }
      throw new Error(`Offline sim failed: ${detail}`);
    }
    const mc = await res.json();
    return mcToWasmShape(mc, this.hunterId, "offline");
  }
}

export async function probeOfflineApi() {
  try {
    const res = await fetch("/api/health", { method: "GET" });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.ok === true && data?.offline_sim === true;
  } catch {
    return false;
  }
}
