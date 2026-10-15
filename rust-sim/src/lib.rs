//! OfflineHunt Monte Carlo simulator — Rust port of `sim/`.

mod actions;
mod config;
mod enemy;
mod enemy_stats;
mod engine;
mod hunt_stage;
mod hunt_statistics;
mod hunter_stats;
mod result;
mod rng;
mod time_model;
mod upgrades_helper;

use config::{build_from_json_str, BuildConfig};
use engine::run_monte_carlo;
use hunter_stats::resolve_combat_stats;
use result::MonteCarloResult;
use serde::Serialize;
use serde_json::{json, Map, Value};
use wasm_bindgen::prelude::*;

#[derive(Serialize)]
struct CombatEcho {
    max_hp: f64,
    atk_power: f64,
    hp_regen: f64,
    dmg_reduction: f64,
    evade_chance: f64,
    effect_chance: f64,
    crit_chance: f64,
    crit_power: f64,
    atk_interval: f64,
}

fn mc_to_json_value(mc: &MonteCarloResult, combat: &CombatEcho, include_runs: bool) -> Value {
    let stage_counts: Map<String, Value> = mc
        .stage_counts
        .iter()
        .map(|(k, v)| (k.to_string(), json!(v)))
        .collect();
    let boss_kill_rate: Map<String, Value> = mc
        .boss_kill_rate
        .iter()
        .map(|(k, v)| (k.to_string(), json!(v)))
        .collect();
    let mean_boss_hp_percent: Map<String, Value> = mc
        .mean_boss_hp_percent
        .iter()
        .map(|(k, v)| (k.to_string(), json!(v)))
        .collect();

    let avg_loot = mc.avg_loot;
    let mut out = json!({
        "hunter": mc.hunter,
        "n": mc.n,
        "avg_stage": mc.avg_stage,
        "min_stage": mc.min_stage,
        "max_stage": mc.max_stage,
        "avg_time_seconds": mc.avg_time_seconds,
        "avg_loot": avg_loot,
        "stage_counts": stage_counts,
        "boss_kill_rate": boss_kill_rate,
        "mean_boss_hp_percent": mean_boss_hp_percent,
        "engine": "rust_hunt_port",
        "parity": "vs_python_unvalidated",
        "combat": serde_json::to_value(combat).unwrap_or(Value::Null),
        "mat1": avg_loot * 0.4,
        "mat2": avg_loot * 0.35,
        "mat3": avg_loot * 0.25,
        "xp": avg_loot * 0.1,
    });

    if include_runs {
        out["runs"] = serde_json::to_value(&mc.runs).unwrap_or(Value::Null);
    }

    out
}

fn combat_echo_from_build(build: &BuildConfig) -> CombatEcho {
    let c = resolve_combat_stats(build);
    CombatEcho {
        max_hp: c.max_hp,
        atk_power: c.atk_power,
        hp_regen: c.hp_regen,
        dmg_reduction: c.dmg_reduction,
        evade_chance: c.evade_chance,
        effect_chance: c.effect_chance,
        crit_chance: c.crit_chance,
        crit_power: c.crit_power,
        atk_interval: c.atk_interval,
    }
}

fn run_mc_inner(build_json: &str, n: u32, seed: u64, max_time: f64) -> Result<Value, String> {
    let build = build_from_json_str(build_json)?;
    let mc = run_monte_carlo(
        build.clone(),
        n,
        seed,
        None,
        false,
        &[100, 200, 300],
        max_time,
        2000,
    )?;
    let combat = combat_echo_from_build(&build);
    Ok(mc_to_json_value(&mc, &combat, false))
}

/// Native / test entry point (same JSON envelope as WASM).
pub fn run_mc_from_json(build_json: &str, n: u32, seed: u64, max_time: f64) -> String {
    match run_mc_inner(build_json, n, seed, max_time) {
        Ok(v) => serde_json::to_string(&v).unwrap_or_else(|e| {
            serde_json::json!({ "error": e.to_string() }).to_string()
        }),
        Err(e) => serde_json::json!({ "error": e }).to_string(),
    }
}

#[wasm_bindgen]
pub fn run_monte_carlo_json(build_json: &str, n: u32, seed: u64, max_time: f64) -> String {
    run_mc_from_json(build_json, n, seed, max_time)
}
