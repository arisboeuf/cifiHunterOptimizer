//! Build configuration (web JSON compatible).

use serde_json::Value;
use std::collections::HashMap;

#[derive(Clone, Debug)]
pub struct BuildConfig {
    pub hunter: String,
    pub level: i32,
    pub stats: HashMap<String, f64>,
    pub talents: HashMap<String, f64>,
    pub attributes: HashMap<String, f64>,
    pub inscryptions: HashMap<String, f64>,
    pub relics: HashMap<String, f64>,
    pub gems: HashMap<String, f64>,
    pub mods: HashMap<String, Value>,
    pub combat: HashMap<String, f64>,
    pub raw: Value,
}

impl BuildConfig {
    pub fn hunter_id(&self) -> String {
        self.hunter.to_lowercase()
    }
}

pub fn value_to_f64_map(v: &Value) -> HashMap<String, f64> {
    let mut m = HashMap::new();
    let Some(obj) = v.as_object() else {
        return m;
    };
    for (k, val) in obj {
        if let Some(n) = json_number_to_f64(val) {
            m.insert(k.clone(), n);
        }
    }
    m
}

pub fn value_to_mods_map(v: &Value) -> HashMap<String, Value> {
    let mut m = HashMap::new();
    let Some(obj) = v.as_object() else {
        return m;
    };
    for (k, val) in obj {
        m.insert(k.clone(), val.clone());
    }
    m
}

pub fn json_number_to_f64(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => n.as_f64().or_else(|| n.as_i64().map(|x| x as f64)),
        Value::Bool(b) => Some(if *b { 1.0 } else { 0.0 }),
        Value::String(s) => s.parse().ok(),
        _ => None,
    }
}

pub fn build_from_value(data: &Value) -> Result<BuildConfig, String> {
    let meta = data.get("meta");
    let hunter = meta
        .and_then(|m| m.get("hunter"))
        .or_else(|| data.get("hunter"))
        .and_then(|h| h.as_str())
        .unwrap_or("Borge")
        .to_string();
    let level = meta
        .and_then(|m| m.get("level"))
        .or_else(|| data.get("level"))
        .and_then(json_number_to_f64)
        .unwrap_or(0.0) as i32;

    Ok(BuildConfig {
        hunter,
        level,
        stats: value_to_f64_map(&data.get("stats").cloned().unwrap_or(Value::Null)),
        talents: value_to_f64_map(&data.get("talents").cloned().unwrap_or(Value::Null)),
        attributes: value_to_f64_map(&data.get("attributes").cloned().unwrap_or(Value::Null)),
        inscryptions: value_to_f64_map(
            &data.get("inscryptions").cloned().unwrap_or(Value::Null),
        ),
        relics: value_to_f64_map(&data.get("relics").cloned().unwrap_or(Value::Null)),
        gems: value_to_f64_map(&data.get("gems").cloned().unwrap_or(Value::Null)),
        mods: value_to_mods_map(&data.get("mods").cloned().unwrap_or(Value::Null)),
        combat: value_to_f64_map(&data.get("combat").cloned().unwrap_or(Value::Null)),
        raw: data.clone(),
    })
}

pub fn build_from_json_str(json: &str) -> Result<BuildConfig, String> {
    let data: Value =
        serde_json::from_str(json).map_err(|e| format!("invalid JSON: {e}"))?;
    build_from_value(&data)
}
