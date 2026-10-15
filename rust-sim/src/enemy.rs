//! Enemy unit factory and runtime state.

use crate::enemy_stats::{enemy_stats, EnemyStatsOut};
use crate::rng::boss_attack_interval;
use std::collections::HashMap;

pub fn enemy_name(hunter: &str, stage: i32) -> &'static str {
    let hunter = hunter.to_lowercase();
    if hunter == "borge" {
        if stage < 100 {
            return "BorgeEnemy";
        }
        if stage == 100 {
            return "Frogbloth";
        }
        if stage < 200 {
            return "Arachnavis";
        }
        if stage == 200 {
            return "Gothmorgor";
        }
        if stage < 300 {
            return "Beakslasher";
        }
        if stage == 300 {
            return "GothulRul";
        }
        if stage < 400 {
            return "Warhound";
        }
        if stage == 400 {
            return "Dragorim";
        }
        if stage < 500 {
            return "Cerebelath";
        }
        if stage == 500 {
            return "Mordrekarn";
        }
        return if stage % 100 == 0 {
            "UnknownBoss"
        } else {
            "UnknownEnemy"
        };
    }
    if stage == 100 {
        return "Benchy";
    }
    if stage == 200 {
        return "Exoscarab";
    }
    if stage % 100 == 0 {
        return "OzzyBoss";
    }
    if stage < 100 {
        return "Drone";
    }
    "OzzyEnemy"
}

#[derive(Clone, Debug)]
pub struct EnemyUnit {
    pub stage: i32,
    pub name: String,
    pub is_boss: bool,
    pub max_hp: f64,
    pub hp: f64,
    pub atk_power: f64,
    pub base_atk_power: f64,
    pub hp_regen: f64,
    pub dmg_reduction: f64,
    pub evade_chance: f64,
    pub effect_chance: f64,
    pub crit_chance: f64,
    pub crit_power: f64,
    pub base_interval: f64,
    pub loot: f64,
    pub enrage_stack: i32,
    pub is_furious: bool,
    pub has_secondary: bool,
    pub secondary_interval: f64,
    pub harden_active: bool,
    pub harden_end: f64,
    pub infernal_stacks: i32,
    pub demonic_bonus: f64,
    pub tags: HashMap<String, String>,
}

impl EnemyUnit {
    pub fn current_interval(&self) -> f64 {
        boss_attack_interval(self.base_interval, self.enrage_stack)
    }

    pub fn current_secondary_interval(&self) -> f64 {
        let base = if self.secondary_interval > 0.0 {
            self.secondary_interval
        } else {
            self.base_interval * 1.8
        };
        boss_attack_interval(base, self.enrage_stack)
    }

    pub fn apply_presence(&mut self, presence_level: i32) {
        if presence_level <= 0 {
            return;
        }
        let mult = (1.0 - 0.04 * presence_level as f64).max(0.05);
        self.max_hp *= mult;
        self.hp = self.max_hp;
    }

    pub fn enrage(&mut self, stacks: i32) {
        if self.is_furious {
            return;
        }
        self.enrage_stack = (self.enrage_stack + stacks).min(200);
        if self.enrage_stack >= 200 {
            self.enrage_stack = 200;
            self.is_furious = true;
            self.atk_power = self.base_atk_power * 3.0;
            self.crit_chance = 1.0;
        }
    }

    pub fn effective_dr(&self) -> f64 {
        let mut dr = self.dmg_reduction;
        if self.harden_active {
            dr = dr.max(0.95);
        }
        dr.min(0.99)
    }

    pub fn effective_regen(&self) -> f64 {
        let mut r = self.hp_regen;
        if self.harden_active {
            r *= 3.0;
        }
        r
    }
}

fn unit_from_stats(hunter: &str, stage: i32, st: &EnemyStatsOut, presence: i32) -> EnemyUnit {
    let name = enemy_name(hunter, stage).to_string();
    let hunter_l = hunter.to_lowercase();
    let has_secondary = hunter_l == "borge" && stage == 200;
    let secondary = if has_secondary {
        st.attack_interval_seconds * 1.8
    } else {
        0.0
    };
    let mut unit = EnemyUnit {
        stage,
        name,
        is_boss: st.boss,
        max_hp: st.max_hp,
        hp: st.max_hp,
        atk_power: st.atk_power,
        base_atk_power: st.atk_power,
        hp_regen: st.hp_regen,
        dmg_reduction: st.dmg_reduction,
        evade_chance: st.evade_chance,
        effect_chance: st.effect_chance,
        crit_chance: st.crit_chance,
        crit_power: st.crit_power,
        base_interval: st.attack_interval_seconds,
        loot: st.loot,
        enrage_stack: 0,
        is_furious: false,
        has_secondary,
        secondary_interval: secondary,
        harden_active: false,
        harden_end: 0.0,
        infernal_stacks: 0,
        demonic_bonus: 0.0,
        tags: HashMap::new(),
    };
    unit.apply_presence(presence);
    unit
}

pub fn spawn_enemy(hunter: &str, stage: i32, presence: i32) -> Result<EnemyUnit, String> {
    let st = enemy_stats(hunter, stage)?;
    Ok(unit_from_stats(hunter, stage, &st, presence))
}
