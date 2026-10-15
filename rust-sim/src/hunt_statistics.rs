//! Offline HunterHuntStatistics — ported from Borge/Ozzy HuntStatistics ctors (0.7.3.42).

use crate::config::{json_number_to_f64, BuildConfig};
use crate::upgrades_helper::{flag_mul, gadget_corrected, hunter_upgrade};
use serde_json::Value;
use std::collections::HashMap;

fn i(d: &HashMap<String, f64>, keys: &[&str], default: i32) -> i32 {
    for k in keys {
        if let Some(v) = d.get(*k) {
            return *v as i32;
        }
    }
    default
}

fn f(d: &HashMap<String, f64>, keys: &[&str], default: f64) -> f64 {
    for k in keys {
        if let Some(v) = d.get(*k) {
            return *v;
        }
    }
    default
}

fn flag_map(d: &HashMap<String, f64>, keys: &[&str]) -> bool {
    for k in keys {
        if let Some(v) = d.get(*k) {
            if *v != 0.0 {
                return true;
            }
        }
    }
    false
}

fn flag_mods(mods: &HashMap<String, Value>, keys: &[&str]) -> bool {
    for k in keys {
        if let Some(v) = mods.get(*k) {
            if value_truthy(v) {
                return true;
            }
        }
    }
    false
}

fn flag_wasm(wasm: &Value, keys: &[&str]) -> bool {
    let Some(obj) = wasm.as_object() else {
        return false;
    };
    for k in keys {
        if let Some(v) = obj.get(*k) {
            if value_truthy(v) {
                return true;
            }
        }
    }
    false
}

fn f_wasm(wasm: &Value, keys: &[&str], default: f64) -> f64 {
    let Some(obj) = wasm.as_object() else {
        return default;
    };
    for k in keys {
        if let Some(v) = obj.get(*k) {
            if let Some(n) = json_number_to_f64(v) {
                return n;
            }
        }
    }
    default
}

fn i_wasm(wasm: &Value, keys: &[&str], default: i32) -> i32 {
    f_wasm(wasm, keys, default as f64) as i32
}

fn value_truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().unwrap_or(0.0) != 0.0,
        Value::String(s) => !s.is_empty(),
        _ => true,
    }
}

#[derive(Clone, Debug)]
pub struct HuntFinals {
    pub max_hp: f64,
    pub atk_power: f64,
    pub hp_regen: f64,
    pub dmg_reduction: f64,
    pub evade_chance: f64,
    pub effect_chance: f64,
    pub crit_chance: f64,
    pub crit_power: f64,
    pub atk_interval: f64,
    pub secondary_dr: f64,
    pub loot_bonus: f64,
}

pub fn compute_borge_finals(build: &BuildConfig) -> HuntFinals {
    let s = &build.stats;
    let t = &build.talents;
    let a = &build.attributes;
    let insc = &build.inscryptions;
    let relics = &build.relics;
    let gems = &build.gems;
    let mods = &build.mods;
    let wasm = build.raw.get("wasm").cloned().unwrap_or(Value::Null);

    let hp_u = f(s, &["hp"], 0.0);
    let atk_u = f(s, &["power"], 0.0);
    let regen_u = f(s, &["regen"], 0.0);
    let dr_u = f(s, &["damage_reduction"], 0.0);
    let evade_u = f(s, &["evade_chance"], 0.0);
    let effect_u = f(s, &["effect_chance"], 0.0);
    let crit_u = f(s, &["special_chance"], 0.0);
    let critp_u = f(s, &["special_damage"], 0.0);
    let spd_u = f(s, &["speed"], 0.0);
    let level = build.level as f64;

    let ares = i(a, &["soul_of_ares"], 0);
    let ylith = i(a, &["essence_of_ylith"], 0);
    let spartan = i(a, &["spartan_lineage"], 0);
    let sensors = i(a, &["superior_sensors"], 0);
    let explosive = i(a, &["explosive_punches"], 0);
    let minotaur = i(a, &["soul_of_the_minotaur"], 0);
    let hermes = i(a, &["soul_of_hermes"], 0);
    let impeccable = i(t, &["impeccable_impacts"], 0);
    let legacy = i(t, &["legacy_of_ultima"], 0).max(i_wasm(&wasm, &["ultima"], 0));

    let i3 = i(insc, &["i3"], 0);
    let i4 = i(insc, &["i4"], 0);
    let i11 = i(insc, &["i11"], 0);
    let i13 = i(insc, &["i13"], 0);
    let i23 = i(insc, &["i23"], 0);
    let i24 = i(insc, &["i24"], 0);
    let i27 = i(insc, &["i27"], 0);
    let i60 = i(insc, &["i60"], 0);
    let i84 = i(insc, &["i84"], 0);
    let i87 = i(insc, &["i87"], 0);
    let i88 = i(insc, &["i88"], 0);
    let i89 = i(insc, &["i89"], 0);
    let i91 = i(insc, &["i91"], 0);

    let r4 = i(relics, &["disk_of_dawn", "r4"], 0);
    let r16 = i(relics, &["r16"], 0);
    let t2r7 = {
        let v = f(relics, &["t2r7"], f_wasm(&wasm, &["t2r7"], 1.0));
        if v == 0.0 { 1.0 } else { v }
    };
    let wrench = i_wasm(&wasm, &["wrench_of_gore", "wrench"], 0);
    let exodus_gn4 = i_wasm(&wasm, &["exodus_gn4"], 0);
    let creation_gu9 = {
        let v = f_wasm(&wasm, &["creation_gu9"], 1.0);
        if v == 0.0 { 1.0 } else { v }
    };
    let creation_gn5_3 = {
        let v = f_wasm(&wasm, &["creation_gn5_3"], 1.0);
        if v == 0.0 { 1.0 } else { v }
    };
    let creation_gn4_3 = f_wasm(&wasm, &["creation_gn4_3"], 0.0);

    let innov_gn3 = flag_map(gems, &["innovation_node_#3"]) || flag_wasm(&wasm, &["innov_gn3"]);
    let evo_gn3 = flag_map(gems, &["evolution_gn3"]) || flag_wasm(&wasm, &["evo_gn3"]);
    let evo_gn6_3 = flag_map(gems, &["evolution_gn6_3"]) || flag_wasm(&wasm, &["evo_gn6_3"]);
    let temporal_gn6 = flag_map(gems, &["temporal_gn6"]) || flag_wasm(&wasm, &["temporal_gn6"]);
    let cg1 = flag_map(gems, &["creation_gn1"]) || flag_wasm(&wasm, &["creation_gn1"]);
    let cg2 = flag_map(gems, &["creation_gn2"]) || flag_wasm(&wasm, &["creation_gn2"]);
    let cg3 = flag_map(gems, &["creation_gn3"]) || flag_wasm(&wasm, &["creation_gn3"]);
    let gaiden = flag_mods(mods, &["gaiden"]);

    let gc = gadget_corrected(wrench as f64, 1.001, 10.0, 1.02);
    let cg3_hp = if cg3 && level >= 40.0 {
        1.0 + 0.015 * (level - 39.0)
    } else {
        1.0
    };
    let cg3_atk = if cg3 && level >= 40.0 {
        1.0 + 0.01 * (level - 39.0)
    } else {
        1.0
    };
    let cg3_regen = if cg3 && level >= 40.0 {
        1.0 + 0.005 * (level - 39.0)
    } else {
        1.0
    };

    let max_hp = (hunter_upgrade(hp_u, 2.5, 5.0, 0.01) + 43.0 + 6.0 * i3 as f64 + 24.0 * i27 as f64)
        * (1.0 + 0.03 * i60 as f64)
        * (1.0 + 0.05 * i84 as f64)
        * (1.0 + 0.01 * ares as f64)
        * (1.0 + 0.01 * legacy as f64)
        * (1.0 + 0.03 * r4 as f64)
        * flag_mul(cg1, 1.2)
        * flag_mul(cg2, 1.02)
        * cg3_hp
        * gc
        * flag_mul(gaiden, 1.03)
        * creation_gu9
        * flag_mul(evo_gn3, 1.0777)
        * flag_mul(temporal_gn6, 1.03)
        * creation_gn5_3;

    let atk_power = (hunter_upgrade(atk_u, 0.5, 10.0, 0.01) + 3.0 + i13 as f64 + 2.0 * impeccable as f64)
        * (1.0 + 0.03 * i60 as f64)
        * 1.05_f64.powi(i87)
        * (1.0 + 0.002 * ares as f64)
        * (1.0 + 0.01 * minotaur as f64)
        * (1.0 + 0.01 * legacy as f64)
        * flag_mul(innov_gn3, 1.03)
        * flag_mul(cg2, 1.02)
        * cg3_atk
        * (1.0 + 0.03 * r16 as f64)
        * gc
        * flag_mul(gaiden, 1.03)
        * creation_gu9
        * flag_mul(temporal_gn6, 1.03)
        * t2r7;

    let hp_regen = (hunter_upgrade(regen_u, 0.03, 30.0, 0.01) + 0.02 + 0.04 * ylith as f64)
        * (1.0 + 0.009 * ylith as f64)
        * (1.0 + 0.01 * legacy as f64)
        * flag_mul(cg2, 1.02)
        * cg3_regen
        * gc
        * flag_mul(gaiden, 1.03)
        * creation_gu9
        * flag_mul(evo_gn3, 1.0777);

    let dmg_reduction = 0.0144 * dr_u
        + 0.004 * i24 as f64
        + 0.002 * i91 as f64
        + 0.015 * spartan as f64
        + if cg2 { 0.02 } else { 0.0 };
    let secondary_dr = 0.01 * minotaur as f64 + 0.01 * creation_gn4_3;
    let evade = 0.0034 * evade_u + 0.01 + 0.016 * sensors as f64;
    let effect = 0.005 * effect_u
        + 0.04
        + 0.012 * sensors as f64
        + 0.004 * hermes as f64
        + 0.02 * i11 as f64
        + 0.002 * i89 as f64
        + if innov_gn3 { 0.03 } else { 0.0 }
        + if cg2 { 0.02 } else { 0.0 };
    let crit_chance = 0.0018 * crit_u
        + 0.05
        + 0.044 * explosive as f64
        + 0.004 * hermes as f64
        + 0.0065 * i4 as f64
        + 0.004 * i88 as f64
        + if cg2 { 0.02 } else { 0.0 }
        + if evo_gn6_3 { 0.02 } else { 0.0 };
    let crit_power = 0.01 * critp_u + 1.3 + 0.08 * explosive as f64 + 0.01 * hermes as f64;
    let atk_interval = 5.0 - 0.03 * spd_u - 0.04 * i23 as f64 - 0.01 * exodus_gn4 as f64;

    HuntFinals {
        max_hp,
        atk_power,
        hp_regen,
        dmg_reduction,
        evade_chance: evade,
        effect_chance: effect,
        crit_chance,
        crit_power,
        atk_interval: atk_interval.max(0.05),
        secondary_dr,
        loot_bonus: 1.0,
    }
}

pub fn compute_ozzy_finals(build: &BuildConfig) -> HuntFinals {
    let s = &build.stats;
    let t = &build.talents;
    let a = &build.attributes;
    let insc = &build.inscryptions;
    let relics = &build.relics;
    let gems = &build.gems;
    let mods = &build.mods;
    let wasm = build.raw.get("wasm").cloned().unwrap_or(Value::Null);

    let hp_u = f(s, &["hp"], 0.0);
    let atk_u = f(s, &["power"], 0.0);
    let regen_u = f(s, &["regen"], 0.0);
    let dr_u = f(s, &["damage_reduction"], 0.0);
    let evade_u = f(s, &["evade_chance"], 0.0);
    let effect_u = f(s, &["effect_chance"], 0.0);
    let multi_u = f(s, &["special_chance"], 0.0);
    let multip_u = f(s, &["special_damage"], 0.0);
    let spd_u = f(s, &["speed"], 0.0);

    let lotl = i(a, &["living_off_the_land"], 0);
    let exo = i(a, &["exo_piercers"], 0);
    let ibu = i(a, &["wings_of_ibu"], 0);
    let exterm = i(a, &["extermination_protocol"], 0);
    let cat = i(a, &["blessing_of_the_cat"], 0);
    let needles = i(t, &["thousand_needles"], 0);
    let legacy = i(t, &["legacy_of_ultima"], 0).max(i_wasm(&wasm, &["ultima"], 0));

    let i31 = i(insc, &["i31"], 0);
    let i36 = i(insc, &["i36"], 0);
    let i37 = i(insc, &["i37"], 0);
    let i40 = i(insc, &["i40"], 0);
    let i86 = i(insc, &["i86"], 0);
    let i92 = i(insc, &["i92"], 0);

    let r4 = i(relics, &["disk_of_dawn", "r4"], 0);
    let r17 = i(relics, &["bee_gone_companion_drone", "r17"], 0);
    let t2r7 = {
        let v = f(relics, &["t2r7"], f_wasm(&wasm, &["t2r7"], 1.0));
        if v == 0.0 { 1.0 } else { v }
    };
    let bio = i_wasm(&wasm, &["bio_repair_tool", "bio_repair"], 0);
    let exodus_gn4 = i_wasm(&wasm, &["exodus_gn4"], 0);

    let creation_gu10 = {
        let v = f_wasm(&wasm, &["creation_gu10"], 1.0);
        if v == 0.0 { 1.0 } else { v }
    };
    let creation_gn5_3 = {
        let v = f_wasm(&wasm, &["creation_gn5_3"], 1.0);
        if v == 0.0 { 1.0 } else { v }
    };
    let creation_gn6_1 = {
        let v = f_wasm(&wasm, &["creation_gn6_1"], 1.0);
        if v == 0.0 { 1.0 } else { v }
    };
    let creation_gn6_2 = {
        let v = f_wasm(&wasm, &["creation_gn6_2"], 1.0);
        if v == 0.0 { 1.0 } else { v }
    };
    let creation_gn6_3 = {
        let v = f_wasm(&wasm, &["creation_gn6_3"], 1.0);
        if v == 0.0 { 1.0 } else { v }
    };
    let creation_gn4_3 = f_wasm(&wasm, &["creation_gn4_3"], 0.0);

    let innov_gn2 = flag_map(gems, &["innovation_node_#2"]) || flag_wasm(&wasm, &["innov_gn2"]);
    let innov_gn3 = flag_map(gems, &["innovation_node_#3"]) || flag_wasm(&wasm, &["innov_gn3"]);
    let evo_gn3 = flag_map(gems, &["evolution_gn3"]) || flag_wasm(&wasm, &["evo_gn3"]);
    let evo_gn6_3 = flag_map(gems, &["evolution_gn6_3"]) || flag_wasm(&wasm, &["evo_gn6_3"]);
    let temporal_gn6 = flag_map(gems, &["temporal_gn6"]) || flag_wasm(&wasm, &["temporal_gn6"]);
    let iridian = flag_mods(mods, &["iridian"]);

    let gc = gadget_corrected(bio as f64, 1.001, 10.0, 1.02);

    let max_hp = (hunter_upgrade(hp_u, 2.0, 5.0, 0.03) + 16.0)
        * (1.0 + 0.02 * lotl as f64)
        * (1.0 + 0.01 * legacy as f64)
        * (1.0 + 0.03 * r4 as f64)
        * gc
        * flag_mul(iridian, 1.03)
        * creation_gu10
        * flag_mul(evo_gn3, 1.0777)
        * flag_mul(temporal_gn6, 1.03)
        * creation_gn6_1
        * creation_gn5_3;

    let atk_power = (hunter_upgrade(atk_u, 0.3, 10.0, 0.01) + 2.0)
        * (1.0 + 0.012 * exo as f64)
        * (1.0 + 0.02 * cat as f64)
        * (1.0 + 0.01 * legacy as f64)
        * flag_mul(innov_gn3, 1.03)
        * (1.0 + 0.03 * r17 as f64)
        * gc
        * flag_mul(iridian, 1.03)
        * creation_gu10
        * flag_mul(temporal_gn6, 1.03)
        * creation_gn6_2
        * t2r7;

    let hp_regen = (hunter_upgrade(regen_u, 0.05, 30.0, 0.01) + 0.1)
        * (1.0 + 0.02 * lotl as f64)
        * (1.0 + 0.01 * legacy as f64)
        * flag_mul(innov_gn2, 1.25)
        * gc
        * flag_mul(iridian, 1.03)
        * creation_gu10
        * flag_mul(evo_gn3, 1.0777)
        * creation_gn6_3;

    let dmg_reduction = 0.0035 * dr_u + 0.0111 * i37 as f64 + 0.002 * i86 as f64 + 0.026 * ibu as f64;
    let secondary_dr = 0.01 * creation_gn4_3;
    let evade = 0.05 + 0.0062 * evade_u + 0.005 * ibu as f64;
    let effect =
        0.04 + 0.0035 * effect_u + 0.028 * exterm as f64 + 0.006 * i31 as f64 + 0.002 * i92 as f64;
    let multi_chance = 0.05
        + 0.0038 * multi_u
        + 0.005 * i40 as f64
        + if innov_gn3 { 0.03 } else { 0.0 }
        + if evo_gn6_3 { 0.02 } else { 0.0 };
    let multi_power = 0.25 + 0.01 * multip_u;

    let base_interval =
        4.0 - 0.02 * spd_u - 0.03 * i36 as f64 - 0.06 * needles as f64 - 0.01 * exodus_gn4 as f64;
    let atk_interval = base_interval * (1.0 - 0.004 * cat as f64);

    HuntFinals {
        max_hp,
        atk_power,
        hp_regen,
        dmg_reduction,
        evade_chance: evade,
        effect_chance: effect,
        crit_chance: multi_chance,
        crit_power: multi_power,
        atk_interval: atk_interval.max(0.05),
        secondary_dr,
        loot_bonus: 1.0,
    }
}

pub fn compute_hunt_finals(build: &BuildConfig) -> HuntFinals {
    if build.hunter_id() == "ozzy" {
        compute_ozzy_finals(build)
    } else {
        compute_borge_finals(build)
    }
}
