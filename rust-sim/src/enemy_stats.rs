//! Shared OfflineHunt enemy statistics (Android 0.7.3.42).

use std::collections::HashMap;
use std::sync::Mutex;

static ENEMY_STATS_CACHE: Mutex<Option<HashMap<(String, i32), EnemyStatsOut>>> =
    Mutex::new(None);

#[derive(Clone, Debug)]
pub struct EnemyStatsOut {
    pub hunter: String,
    pub stage: i32,
    pub band: i32,
    pub boss: bool,
    pub stage_scaling: f64,
    pub max_hp: f64,
    pub atk_power: f64,
    pub hp_regen: f64,
    pub dmg_reduction: f64,
    pub evade_chance: f64,
    pub effect_chance: f64,
    pub crit_power: f64,
    pub crit_chance: f64,
    pub attack_interval_seconds: f64,
    pub loot: f64,
}

fn ramps(hunter: &str) -> Option<&'static [(i32, f64)]> {
    match hunter {
        "borge" => Some(&[
            (150, 0.006),
            (200, 0.006),
            (250, 0.006),
            (300, 0.006),
            (310, 0.003),
            (320, 0.003),
            (330, 0.004),
            (340, 0.004),
            (350, 0.005),
            (360, 0.005),
            (370, 0.006),
            (380, 0.006),
            (390, 0.007),
            (401, 0.005),
            (411, 0.005),
            (421, 0.005),
            (431, 0.004),
            (441, 0.004),
            (451, 0.004),
            (461, 0.006),
            (471, 0.006),
            (481, 0.006),
            (491, 0.006),
        ]),
        "ozzy" => Some(&[
            (150, 0.006),
            (200, 0.006),
            (250, 0.006),
            (300, 0.006),
            (310, 0.003),
            (320, 0.003),
            (330, 0.004),
            (340, 0.004),
            (350, 0.005),
            (360, 0.005),
            (370, 0.006),
            (380, 0.006),
            (390, 0.007),
        ]),
        "knox" => Some(&[
            (50, 0.006),
            (100, 0.006),
            (120, 0.01),
            (130, 0.008),
            (140, 0.006),
            (150, 0.006),
            (160, 0.006),
            (170, 0.006),
            (180, 0.006),
            (190, 0.006),
            (200, 0.006),
            (220, 0.02),
            (250, 0.006),
            (300, 0.006),
            (310, 0.003),
            (320, 0.02),
            (330, 0.004),
            (340, 0.004),
            (350, 0.005),
            (360, 0.005),
            (370, 0.006),
            (380, 0.006),
            (390, 0.007),
        ]),
        _ => None,
    }
}

fn power_anchor(hunter: &str) -> i32 {
    match hunter {
        "borge" => 350,
        "ozzy" => 300,
        _ => 200,
    }
}

pub fn stage_scaling(hunter: &str, stage: i32) -> f64 {
    let hunter = hunter.to_lowercase();
    let mut scale = 1.0;
    if let Some(ramp) = ramps(&hunter) {
        for &(start, slope) in ramp {
            if stage >= start {
                scale += (stage - start + 1) as f64 * slope;
            }
        }
    }
    scale * 1.01_f64.powi((stage - power_anchor(&hunter)).max(0))
}

pub fn enemy_stats(hunter: &str, stage: i32) -> Result<EnemyStatsOut, String> {
    let hunter = hunter.to_lowercase();
    if ramps(&hunter).is_none() {
        return Err("hunter must be borge, ozzy or knox".into());
    }
    if stage < 1 {
        return Err("stage must be a positive integer".into());
    }

    let cache_key = (hunter.clone(), stage);
    {
        let guard = ENEMY_STATS_CACHE.lock().unwrap();
        if let Some(cache) = guard.as_ref() {
            if let Some(cached) = cache.get(&cache_key) {
                return Ok(cached.clone());
            }
        }
    }

    let n = stage - 1;
    let b = if stage >= 101 { n / 100 } else { 0 };
    let k = stage_scaling(&hunter, stage);

    let (mut hp, mut atk, mut regen, mut evade, mut crit, mut power, mut interval, mut loot);

    if hunter == "borge" {
        hp = (13.0 + 4.0 * n as f64) * 2.85_f64.powi(b) * k;
        atk = (3.2 + 0.7 * n as f64) * 2.85_f64.powi(b) * k;
        regen = 0.08 * (n.max(0) as f64) * 1.052_f64.powi(b) * k;
        evade = if stage >= 100 {
            0.004 * (1 + (b - 1).max(0)) as f64
        } else {
            0.0
        };
        crit = (0.0326 + 0.0004 * n as f64).min(0.25);
        power = (1.22 + 0.008 * n as f64).min(2.5);
        interval = (4.52 - 0.006 * n as f64).max(0.5);
        loot = 1.051_f64.powi(stage) * 5.0_f64.powi(b);
    } else if hunter == "ozzy" {
        hp = (17.0 + 6.0 * n as f64) * 2.9_f64.powi(b) * k;
        atk = (2.1 + 0.75 * n as f64) * 2.7_f64.powi(b) * k;
        regen = (0.02 + 0.1 * (n.max(0) as f64)) * 1.25_f64.powi(b) * k;
        evade = if stage >= 100 {
            0.01 * (1 + (b - 1).max(0)) as f64
        } else {
            0.0
        };
        crit = (0.1 + 0.0006 * n as f64).min(0.25);
        power = (1.038 + 0.008 * n as f64).min(2.5);
        interval = (3.2 - 0.004 * n as f64).max(0.5);
        loot = 1.059_f64.powi(stage) * 5.0_f64.powi(b);
    } else {
        hp = (16.0 + 9.0 * n as f64) * 2.85_f64.powi(b) * k;
        atk = (3.8 + 1.4 * n as f64) * 2.85_f64.powi(b) * k;
        regen = 0.04 * stage as f64 * 1.052_f64.powi(b) * k;
        evade = if stage >= 100 {
            0.01 * (1 + (b - 1).max(0)) as f64
        } else {
            0.0
        };
        crit = (0.1 + 0.0006 * n as f64).min(0.25);
        power = (1.04 + 0.008 * n as f64).min(2.5);
        interval = (6.0 - 0.005 * n as f64).max(0.5);
        loot = 1.074_f64.powi(stage) * 5.0_f64.powi(b);
    }

    let mut dr = if stage >= 200 {
        0.04 + 0.02 * (b - 2).max(0) as f64
    } else {
        0.0
    };
    let mut effect = if stage >= 300 {
        0.04 + 0.01 * (b - 3).max(0) as f64
    } else {
        0.0
    };

    let mut boss = stage % 100 == 0;
    if boss {
        if hunter == "borge" {
            hp *= 90.0;
            atk *= 3.63;
            regen *= 1.92;
            dr += 0.05;
            if stage >= 300 {
                effect += 0.04;
            }
            crit = (crit + 0.04).min(0.25);
            power = (power + 0.25).min(2.5);
            interval *= 2.42;
        } else if hunter == "ozzy" {
            hp *= 48.0;
            atk *= 3.0;
            regen *= 6.0;
            dr += 0.05;
            crit = 0.25;
            interval *= 2.45;
            if stage >= 300 {
                effect += 0.04;
            }
        } else {
            hp *= 12.0;
            atk *= 4.0;
            regen *= 2.0;
            dr += 0.05;
            if stage >= 300 {
                effect += 0.04;
            }
            crit = (crit + 0.13).min(0.25);
            interval *= 2.85;
        }
    }

    if hunter == "borge" && stage > 400 {
        effect += 0.004999999888241291;
    }

    let out = EnemyStatsOut {
        hunter,
        stage,
        band: b,
        boss,
        stage_scaling: k,
        max_hp: hp,
        atk_power: atk,
        hp_regen: regen,
        dmg_reduction: dr,
        evade_chance: evade,
        effect_chance: effect,
        crit_power: power,
        crit_chance: crit,
        attack_interval_seconds: interval,
        loot,
    };

    let mut guard = ENEMY_STATS_CACHE.lock().unwrap();
    let cache = guard.get_or_insert_with(HashMap::new);
    cache.insert(cache_key, out.clone());
    Ok(out)
}
