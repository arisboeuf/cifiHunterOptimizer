//! Resolve hunter combat stats from HuntStatistics port (+ optional combat override).

use crate::config::BuildConfig;
use crate::hunt_statistics::{compute_hunt_finals, HuntFinals};
use std::collections::HashMap;

#[derive(Clone, Debug)]
pub struct CombatStats {
    pub max_hp: f64,
    pub atk_power: f64,
    pub hp_regen: f64,
    pub dmg_reduction: f64,
    pub evade_chance: f64,
    pub effect_chance: f64,
    pub crit_chance: f64,
    pub crit_power: f64,
    pub atk_interval: f64,
    pub loot_mult: f64,
    pub xp_mult: f64,
    pub lifesteal: f64,
    pub presence: i32,
    pub born_for_battle: i32,
    pub fires_of_war: i32,
    pub life_of_the_hunt: i32,
    pub lifedrain: i32,
    pub ares: i32,
    pub baal: i32,
    pub sensors: i32,
    pub atlas: i32,
    pub explosive: i32,
    pub hermes: i32,
    pub weakspot: i32,
    pub helltouch: i32,
    pub revival_charges: i32,
    pub omen: i32,
    pub unfair: i32,
    pub impeccable: i32,
    pub echo_level: i32,
    pub crippling: i32,
    pub thousand_needles: i32,
    pub tricksters_boon: i32,
    pub cycle_of_death: i32,
    pub deal_with_death: i32,
    pub dance_of_dashes: i32,
    pub vectid_elixir: i32,
    pub gift_of_medusa: i32,
    pub soul_of_snek: i32,
    pub blessing_scarab: i32,
    pub shimmering_scorpions: i32,
    pub catchup_level: i32,
}

fn g(d: &HashMap<String, f64>, keys: &[&str], default: f64) -> f64 {
    for k in keys {
        if let Some(v) = d.get(*k) {
            return *v;
        }
    }
    default
}

fn level_from(talents: &HashMap<String, f64>, attrs: &HashMap<String, f64>, key: &str) -> i32 {
    let v = g(talents, &[key], 0.0) as i32;
    if v != 0 {
        return v;
    }
    g(attrs, &[key], 0.0) as i32
}

fn from_combat_block(c: &HashMap<String, f64>) -> HuntFinals {
    let max_hp = g(c, &["max_hp", "hp"], 1000.0);
    let atk = g(c, &["atk_power", "atk"], 100.0);
    let regen = g(c, &["hp_regen", "regen"], 1.0);
    let mut dr = g(c, &["dmg_reduction", "dr"], 0.0);
    if dr > 1.0 {
        dr /= 100.0;
    }
    let mut evade = g(c, &["evade_chance", "evade"], 0.0);
    if evade > 1.0 {
        evade /= 100.0;
    }
    let mut effect = g(c, &["effect_chance", "effect"], 0.0);
    if effect > 1.0 {
        effect /= 100.0;
    }
    let mut crit_c = g(c, &["crit_chance", "multistrike_chance"], 0.0);
    if crit_c > 1.0 {
        crit_c /= 100.0;
    }
    let crit_p = g(c, &["crit_power", "multistrike_power"], 1.5);
    let interval = g(c, &["atk_speed", "atk_interval", "reload"], 1.0);
    HuntFinals {
        max_hp,
        atk_power: atk,
        hp_regen: regen,
        dmg_reduction: dr,
        evade_chance: evade,
        effect_chance: effect,
        crit_chance: crit_c,
        crit_power: crit_p,
        atk_interval: interval,
        secondary_dr: 0.0,
        loot_bonus: g(c, &["loot_mult", "loot_bonus"], 1.0),
    }
}

fn lifesteal_from_build(build: &BuildConfig) -> f64 {
    if build.hunter_id() == "borge" {
        return 0.0111 * g(&build.attributes, &["book_of_baal"], 0.0);
    }
    0.0
}

pub fn resolve_combat_stats(build: &BuildConfig) -> CombatStats {
    let t = &build.talents;
    let a = &build.attributes;
    let c = &build.combat;
    let g_gems = &build.gems;

    let presence = g(t, &["presence_of_god"], 0.0) as i32;
    let born = g(a, &["born_for_battle"], 0.0) as i32;
    let fires = g(t, &["fires_of_war"], 0.0) as i32;
    let life_hunt = g(t, &["life_of_the_hunt"], 0.0) as i32;
    let lifedrain = g(a, &["lifedrain_inhalers"], 0.0) as i32;
    let ares = g(a, &["soul_of_ares"], 0.0) as i32;
    let baal = g(a, &["book_of_baal"], 0.0) as i32;
    let sensors = g(a, &["superior_sensors"], 0.0) as i32;
    let atlas = g(a, &["atlas_protocol"], 0.0) as i32;
    let explosive = g(a, &["explosive_punches"], 0.0) as i32;
    let hermes = g(a, &["soul_of_hermes"], 0.0) as i32;
    let weakspot = g(a, &["weakspot_analysis"], 0.0) as i32;
    let helltouch = g(a, &["helltouch_barrier"], 0.0) as i32;
    let revival = g(t, &["death_is_my_companion"], 0.0) as i32;
    let omen = if build.hunter_id() == "borge" {
        g(t, &["omen_of_defeat"], 0.0) as i32
    } else {
        g(t, &["omen_of_decay"], 0.0) as i32
    };
    let unfair = g(t, &["unfair_advantage"], 0.0) as i32;
    let impeccable = g(t, &["impeccable_impacts"], 0.0) as i32;
    let echo = level_from(t, a, "echo_bullets");
    let crippling = level_from(t, a, "crippling_shots");
    let needles = g(t, &["thousand_needles"], 0.0) as i32;
    let trickster = g(t, &["tricksters_boon"], 0.0) as i32;
    let cycle = g(a, &["cycle_of_death"], 0.0) as i32;
    let deal = g(a, &["deal_with_death"], 0.0) as i32;
    let dance = g(a, &["dance_of_dashes"], 0.0) as i32;
    let vectid = g(a, &["vectid_elixir"], 0.0) as i32;
    let medusa = g(a, &["gift_of_medusa"], 0.0) as i32;
    let snek = g(a, &["soul_of_snek"], 0.0) as i32;
    let scarab = g(a, &["blessing_of_the_scarab"], 0.0) as i32;
    let scorp = g(a, &["shimmering_scorpions"], 0.0) as i32;
    let catchup = g(g_gems, &["attraction_catch-up", "attraction_catchup", "catchup"], 0.0) as i32;

    let finals = if !c.is_empty() {
        from_combat_block(c)
    } else {
        compute_hunt_finals(build)
    };

    let mut loot_mult = finals.loot_bonus;
    if build.hunter_id() == "borge" {
        loot_mult *= 1.0 + 0.14 * g(a, &["timeless_mastery"], 0.0);
        for (key, base) in [("i14", 1.1_f64), ("i44", 1.08), ("i80", 1.1), ("i103", 1.08)] {
            let n = g(&build.inscryptions, &[key], 0.0) as i32;
            if n != 0 {
                loot_mult *= base.powi(n);
            }
        }
        let n60 = g(&build.inscryptions, &["i60"], 0.0) as i32;
        if n60 != 0 {
            loot_mult *= 1.03_f64.powi(n60);
        }
    } else {
        loot_mult *= 1.0 + 0.16 * g(a, &["timeless_mastery"], 0.0);
        for (key, base) in [("i32", 1.5_f64), ("i81", 1.1), ("i104", 1.08)] {
            let n = g(&build.inscryptions, &[key], 0.0) as i32;
            if n != 0 {
                loot_mult *= base.powi(n);
            }
        }
    }
    if build
        .mods
        .get("gaiden")
        .map(|v| match v {
            serde_json::Value::Bool(b) => *b,
            serde_json::Value::Number(n) => n.as_f64().unwrap_or(0.0) != 0.0,
            serde_json::Value::String(s) => !s.is_empty(),
            _ => true,
        })
        .unwrap_or(false)
    {
        loot_mult *= 1.05;
    }

    let mut xp_mult = 1.0;
    let n33 = g(&build.inscryptions, &["i33"], 0.0) as i32;
    if n33 != 0 {
        xp_mult *= 1.75_f64.powi(n33);
    }

    CombatStats {
        max_hp: finals.max_hp,
        atk_power: finals.atk_power,
        hp_regen: finals.hp_regen,
        dmg_reduction: finals.dmg_reduction,
        evade_chance: finals.evade_chance,
        effect_chance: finals.effect_chance,
        crit_chance: finals.crit_chance,
        crit_power: finals.crit_power,
        atk_interval: finals.atk_interval,
        loot_mult,
        xp_mult,
        lifesteal: lifesteal_from_build(build),
        presence,
        born_for_battle: born,
        fires_of_war: fires,
        life_of_the_hunt: life_hunt,
        lifedrain,
        ares,
        baal,
        sensors,
        atlas,
        explosive,
        hermes,
        weakspot,
        helltouch,
        revival_charges: revival,
        omen,
        unfair,
        impeccable,
        echo_level: echo,
        crippling,
        thousand_needles: needles,
        tricksters_boon: trickster,
        cycle_of_death: cycle,
        deal_with_death: deal,
        dance_of_dashes: dance,
        vectid_elixir: vectid,
        gift_of_medusa: medusa,
        soul_of_snek: snek,
        blessing_scarab: scarab,
        shimmering_scorpions: scorp,
        catchup_level: catchup,
    }
}
