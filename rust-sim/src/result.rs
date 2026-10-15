//! Hunt / Monte-Carlo result types.

use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
pub struct HuntResult {
    pub hunter: String,
    pub end_stage: i32,
    pub time_seconds: f64,
    pub enemies_killed: i32,
    pub bosses_killed: i32,
    pub loot: f64,
    pub xp: f64,
    pub revives_used: i32,
    pub died: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub boss_hp_percent: Option<f64>,
    pub stop_reason: String,
    pub seed: u64,
}

#[derive(Clone, Debug)]
pub struct MonteCarloResult {
    pub hunter: String,
    pub n: u32,
    pub avg_stage: f64,
    pub min_stage: i32,
    pub max_stage: i32,
    pub avg_time_seconds: f64,
    pub avg_loot: f64,
    pub stage_counts: std::collections::BTreeMap<i32, u32>,
    pub boss_kill_rate: std::collections::HashMap<i32, f64>,
    pub mean_boss_hp_percent: std::collections::HashMap<i32, f64>,
    pub runs: Vec<HuntResult>,
    pub engine: String,
    pub parity: String,
}
