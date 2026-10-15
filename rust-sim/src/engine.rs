//! Event-driven OfflineHunt engine (Borge + Ozzy).

use crate::actions::{ActionKind, UnitActions};
use crate::config::BuildConfig;
use crate::enemy::{spawn_enemy, EnemyUnit};
use crate::hunt_stage::HuntStage;
use crate::hunter_stats::{resolve_combat_stats, CombatStats};
use crate::result::{HuntResult, MonteCarloResult};
use crate::rng::{seed_state, HuntRoll};
use crate::time_model::HuntTime;

const OZZY_FOLLOWUP_DELAY: f64 = 0.3;

#[derive(Clone, Debug)]
struct HunterState {
    hp: f64,
    max_hp: f64,
    revives_left: i32,
    fires_bonus: f64,
    crippling_stacks: i32,
    evade_stacks: i32,
    vectid_ticks: i32,
    catchup_active: bool,
}

pub struct HuntEngine {
    build: BuildConfig,
    hunter_id: String,
    seed: u64,
    stop_after_boss: Option<i32>,
    max_time: f64,
    max_stage: i32,
    stats: CombatStats,
    time: HuntTime,
    actions: UnitActions,
    rng: HuntRoll,
    hunter: HunterState,
    hunt_stage: HuntStage,
    stage: i32,
    enemy: Option<EnemyUnit>,
    enemies_killed: i32,
    bosses_killed: i32,
    loot: f64,
    xp: f64,
    revives_used: i32,
    boss_hp_at_death: Option<f64>,
    stop_reason: String,
}

fn trunc_to_int(x: f64) -> f64 {
    if x >= 0.0 {
        x.trunc()
    } else {
        x.trunc()
    }
}

impl HuntEngine {
    pub fn new(
        build: BuildConfig,
        seed: u64,
        stop_after_boss: Option<i32>,
        max_time: f64,
        max_stage: i32,
        stats: Option<CombatStats>,
    ) -> Result<Self, String> {
        let hunter_id = build.hunter_id();
        if hunter_id != "borge" && hunter_id != "ozzy" {
            return Err("only borge and ozzy are supported".into());
        }

        let base = stats.unwrap_or_else(|| resolve_combat_stats(&build));
        let stats = base.clone();
        let mut engine = Self {
            build,
            hunter_id: hunter_id.clone(),
            seed,
            stop_after_boss,
            max_time,
            max_stage,
            stats: stats.clone(),
            time: HuntTime::new(0.0),
            actions: UnitActions::new(),
            rng: HuntRoll::new(seed_state(seed))?,
            hunter: HunterState {
                hp: stats.max_hp,
                max_hp: stats.max_hp,
                revives_left: stats.revival_charges.max(0),
                fires_bonus: 0.0,
                crippling_stacks: 0,
                evade_stacks: 0,
                vectid_ticks: 0,
                catchup_active: false,
            },
            hunt_stage: HuntStage::new(1, 0),
            stage: 1,
            enemy: None,
            enemies_killed: 0,
            bosses_killed: 0,
            loot: 0.0,
            xp: 0.0,
            revives_used: 0,
            boss_hp_at_death: None,
            stop_reason: String::new(),
        };
        engine.activate_catchup_if_needed();
        engine.spawn_enemy()?;
        engine.schedule_initial();
        Ok(engine)
    }

    fn catchup_mult(&self) -> f64 {
        let lvl = self.stats.catchup_level;
        if lvl < 1 {
            return 1.0;
        }
        1.08_f64.powi(lvl)
    }

    fn activate_catchup_if_needed(&mut self) {
        if self.hunter.catchup_active {
            return;
        }
        if self.stats.catchup_level < 1 || self.stage > 99 {
            return;
        }
        let m = self.catchup_mult();
        self.stats.atk_power *= m;
        self.stats.atk_interval = (self.stats.atk_interval / m).max(0.05);
        self.hunter.catchup_active = true;
    }

    fn deactivate_catchup(&mut self) {
        if !self.hunter.catchup_active {
            return;
        }
        let m = self.catchup_mult();
        self.stats.atk_power /= m;
        self.stats.atk_interval *= m;
        self.hunter.catchup_active = false;
    }

    fn spawn_enemy(&mut self) -> Result<(), String> {
        if self.stage >= 100 && self.hunter.catchup_active {
            self.deactivate_catchup();
        } else if self.stage <= 99 {
            self.activate_catchup_if_needed();
        }
        self.enemy = Some(spawn_enemy(
            &self.hunter_id,
            self.stage,
            self.stats.presence,
        )?);
        Ok(())
    }

    fn schedule_initial(&mut self) {
        let enemy = self.enemy.as_ref().unwrap();
        self.actions
            .set(ActionKind::HunterAttack, self.time.in_at(self.stats.atk_interval), "");
        self.actions.set(
            ActionKind::EnemyAttack,
            self.time.in_at(enemy.current_interval()),
            "",
        );
        if enemy.has_secondary {
            self.actions.set(
                ActionKind::EnemySecondary,
                self.time.in_at(enemy.current_secondary_interval()),
                "",
            );
        }
        self.actions
            .set(ActionKind::RegenTick, self.time.next_second(), "");
        self.schedule_boss_skills();
    }

    fn schedule_boss_skills(&mut self) {
        let Some(e) = self.enemy.as_ref() else {
            return;
        };
        if self.hunter_id == "borge" && e.name == "Dragorim" {
            self.actions
                .set(ActionKind::BossSkill, self.time.in_at(10.0), "infernal");
            self.actions
                .set(ActionKind::BossSkill, self.time.in_at(60.0), "demonic");
        }
        if self.hunter_id == "borge" && e.name == "Mordrekarn" {
            self.actions
                .set(ActionKind::BossSkill, self.time.in_at(120.0), "rekindle");
        }
        if self.hunter_id == "ozzy" && e.name == "Exoscarab" {
            self.actions.set(ActionKind::Harden, self.time.in_at(25.0), "");
        }
    }

    fn clear_enemy_actions(&mut self) {
        self.actions.clear_kinds(&[
            ActionKind::EnemyAttack,
            ActionKind::EnemySecondary,
            ActionKind::BossSkill,
            ActionKind::Harden,
        ]);
    }

    pub fn run(mut self) -> HuntResult {
        let mut steps = 0i64;
        let max_steps = 2_000_000i64;
        loop {
            steps += 1;
            if steps > max_steps {
                self.stop_reason = "max_steps".into();
                break;
            }
            if self.time.now >= self.max_time {
                self.stop_reason = "max_time".into();
                break;
            }
            if self.stage > self.max_stage {
                self.stop_reason = "max_stage".into();
                break;
            }
            let Some(nxt) = self.actions.pop_next() else {
                self.stop_reason = "no_actions".into();
                break;
            };
            self.time.advance(nxt.time);
            let died = match nxt.kind {
                ActionKind::RegenTick => {
                    self.on_regen();
                    false
                }
                ActionKind::HunterAttack => self.hunter_attack(),
                ActionKind::EnemyAttack => self.enemy_attack(true),
                ActionKind::EnemySecondary => self.enemy_attack(false),
                ActionKind::BossSkill => {
                    self.boss_skill(&nxt.tag);
                    false
                }
                ActionKind::Harden => {
                    self.harden();
                    false
                }
                ActionKind::Multistrike => self.ozzy_extra_hit(true),
                ActionKind::Echo => self.ozzy_extra_hit(false),
            };
            if died {
                break;
            }
            if !self.stop_reason.is_empty() {
                break;
            }
        }

        HuntResult {
            hunter: self.hunter_id,
            end_stage: self.stage,
            time_seconds: self.time.now,
            enemies_killed: self.enemies_killed,
            bosses_killed: self.bosses_killed,
            loot: self.loot,
            xp: self.xp,
            revives_used: self.revives_used,
            died: self.stop_reason.starts_with("death"),
            boss_hp_percent: self.boss_hp_at_death,
            stop_reason: if self.stop_reason.is_empty() {
                "unknown".into()
            } else {
                self.stop_reason
            },
            seed: self.seed,
        }
    }

    fn on_regen(&mut self) {
        let nxt_t = self.actions.earliest_time();
        let mut seconds = 1.0;
        if let Some(nxt_t) = nxt_t {
            seconds = (1.0_f64)
                .max(trunc_to_int(nxt_t - self.time.now))
                .min(60.0);
        }

        let enemy_harden = self
            .enemy
            .as_ref()
            .map(|e| e.harden_active)
            .unwrap_or(false);
        if enemy_harden {
            if let Some(e) = self.enemy.as_ref() {
                let until = (e.harden_end - self.time.now).max(0.0);
                if until <= 0.0 {
                    if let Some(en) = self.enemy.as_mut() {
                        en.harden_active = false;
                    }
                } else {
                    let int_until = trunc_to_int(until);
                    let cap = if int_until == 0.0 { 1.0 } else { int_until };
                    seconds = seconds.max(1.0).min(cap);
                }
            }
        }

        if self.hunter.vectid_ticks > 0 {
            seconds = seconds
                .max(1.0)
                .min(self.hunter.vectid_ticks as f64);
        }

        let mut h_regen = self.stats.hp_regen * seconds;
        if self.hunter.vectid_ticks > 0 {
            self.hunter.vectid_ticks -= seconds as i32;
            if self.hunter.vectid_ticks <= 0 {
                self.hunter.vectid_ticks = 0;
                if self.stats.vectid_elixir > 0 {
                    self.stats.hp_regen /= 1.0 + 0.15 * self.stats.vectid_elixir as f64;
                    h_regen = self.stats.hp_regen * seconds;
                }
            }
        }

        let e_regen_base = self
            .enemy
            .as_ref()
            .map(|e| e.effective_regen())
            .unwrap_or(0.0);
        let mut e_regen = e_regen_base * seconds;

        if e_regen_base > 0.0 {
            if self.hunter_id == "borge" && self.stats.omen > 0 {
                if let Some(e) = self.enemy.as_ref() {
                    let cut = if e.is_boss { 0.04 } else { 0.08 };
                    e_regen *= (1.0 - cut * self.stats.omen as f64).max(0.0);
                }
            }
            if self.hunter_id == "ozzy" {
                if self.stats.soul_of_snek > 0 {
                    e_regen *= (1.0 - 0.088 * self.stats.soul_of_snek as f64).max(0.0);
                }
                if self.stats.gift_of_medusa > 0 {
                    e_regen -= self.stats.hp_regen
                        * 0.06
                        * self.stats.gift_of_medusa as f64
                        * seconds;
                    e_regen = e_regen.max(0.0);
                }
            }
        }

        if self.hunter.hp > 0.0 && h_regen != 0.0 {
            self.hunter.hp = (self.hunter.hp + h_regen).min(self.hunter.max_hp);
        }
        if let Some(e) = self.enemy.as_mut() {
            if e.hp > 0.0 && e_regen > 0.0 {
                e.hp = (e.hp + e_regen).min(e.max_hp);
            }
            if e.harden_active && self.time.now + seconds >= e.harden_end {
                e.harden_active = false;
            }
        }

        self.actions
            .set(ActionKind::RegenTick, self.time.now + seconds, "");
    }

    fn deal_to_enemy(&mut self, raw_damage: f64) -> (bool, bool) {
        let Some(e) = self.enemy.as_mut() else {
            return (false, false);
        };
        if self.rng.succeeds(e.evade_chance) {
            return (false, false);
        }
        let mut dmg = raw_damage;
        let is_boss = e.is_boss;
        let e_hp_before_omen = e.hp;

        if self.hunter_id == "ozzy" {
            if self.stats.shimmering_scorpions > 0 {
                let heal = dmg * 0.033 * self.stats.shimmering_scorpions as f64;
                self.hunter.hp = (self.hunter.hp + heal).min(self.hunter.max_hp);
            }
            if self.stats.omen > 0 && e_hp_before_omen > 0.0 {
                let mut frac = 0.008 * self.stats.omen as f64;
                if is_boss {
                    frac *= 0.1;
                }
                dmg += e_hp_before_omen * frac;
            }
            if self.hunter.crippling_stacks >= 1 {
                dmg *= 1.0 + 0.03 * self.hunter.crippling_stacks as f64;
                self.hunter.crippling_stacks = 0;
            }
        }

        if self.hunter_id == "borge"
            && self.stats.life_of_the_hunt > 0
            && self.rng.succeeds(self.stats.effect_chance)
        {
            let heal = dmg * 0.06 * self.stats.life_of_the_hunt as f64;
            self.hunter.hp = (self.hunter.hp + heal).min(self.hunter.max_hp);
        }

        let dr = e.effective_dr();
        dmg *= 1.0 - dr;
        e.hp -= dmg;

        let mut heal_frac = self.stats.lifesteal;
        if self.stats.lifedrain > 0 {
            heal_frac += 0.0008 * self.stats.lifedrain as f64;
        }
        if heal_frac > 0.0 {
            self.hunter.hp = (self.hunter.hp + dmg * heal_frac).min(self.hunter.max_hp);
        }

        if e.hp <= 0.0 {
            self.on_enemy_killed();
            return (true, true);
        }
        (true, false)
    }

    fn borge_on_hit_followups(&mut self) {
        let Some(enemy) = self.enemy.as_ref() else {
            return;
        };
        let is_boss = enemy.is_boss;
        if self.stats.impeccable > 0 && self.rng.succeeds(self.stats.effect_chance) {
            let mut stun = 0.1 * self.stats.impeccable as f64;
            if is_boss {
                stun *= 0.5;
            }
            if let Some(rem) = self
                .actions
                .remaining(ActionKind::EnemyAttack, self.time.now, "")
            {
                self.actions
                    .set(ActionKind::EnemyAttack, self.time.in_at(rem + stun), "");
            }
        }
        if self.stats.fires_of_war > 0 && self.rng.succeeds(self.stats.effect_chance) {
            self.hunter.fires_bonus = 0.1 * self.stats.fires_of_war as f64;
        }
    }

    fn ozzy_on_hit_followups(&mut self, from_echo: bool) {
        if self.stats.crippling > 0 && self.rng.succeeds(self.stats.effect_chance) {
            self.hunter.crippling_stacks += self.stats.crippling;
        }
        if self.rng.succeeds(self.stats.crit_chance) {
            self.actions.set(
                ActionKind::Multistrike,
                self.time.in_at(OZZY_FOLLOWUP_DELAY),
                "",
            );
        }
        if from_echo {
            return;
        }
        let echo_p = if self.stats.echo_level > 0 {
            0.5 * self.stats.effect_chance
        } else {
            0.0
        };
        if echo_p > 0.0 && self.rng.succeeds(echo_p) {
            self.actions
                .set(ActionKind::Echo, self.time.in_at(OZZY_FOLLOWUP_DELAY), "");
        }
        if self.stats.tricksters_boon > 0
            && self.rng.succeeds(0.5 * self.stats.effect_chance)
        {
            self.hunter.evade_stacks += self.stats.tricksters_boon;
        }
        if self.stats.thousand_needles > 0 && self.rng.succeeds(self.stats.effect_chance) {
            let stun = 0.05 * self.stats.thousand_needles as f64;
            if let Some(rem) = self
                .actions
                .remaining(ActionKind::EnemyAttack, self.time.now, "")
            {
                self.actions
                    .set(ActionKind::EnemyAttack, self.time.in_at(rem + stun), "");
            }
        }
    }

    fn hunter_attack(&mut self) -> bool {
        if self.hunter_id == "borge" {
            let mut dmg = self.stats.atk_power;
            dmg *= 1.0 + 0.01 * self.stats.born_for_battle as f64;
            if self.rng.succeeds(self.stats.crit_chance) {
                dmg *= self.stats.crit_power;
            }
            let (hit, _) = self.deal_to_enemy(dmg);
            if hit {
                self.borge_on_hit_followups();
            }
            self.schedule_next_hunter_attack();
            return false;
        }

        let dmg = self.stats.atk_power;
        let (hit, _) = self.deal_to_enemy(dmg);
        if hit {
            self.ozzy_on_hit_followups(false);
        }
        self.schedule_next_hunter_attack();
        false
    }

    fn ozzy_extra_hit(&mut self, multistrike: bool) -> bool {
        let dmg = if multistrike {
            self.stats.atk_power * self.stats.crit_power
        } else {
            self.stats.atk_power * 0.05 * (self.stats.echo_level.max(1) as f64)
        };
        let (hit, _) = self.deal_to_enemy(dmg);
        if hit {
            if multistrike {
                if self.stats.crippling > 0 && self.rng.succeeds(self.stats.effect_chance) {
                    self.hunter.crippling_stacks += self.stats.crippling;
                }
            } else {
                self.ozzy_on_hit_followups(true);
            }
        }
        false
    }

    fn schedule_next_hunter_attack(&mut self) {
        let mut interval = self.stats.atk_interval;
        if self.hunter_id == "borge" && self.hunter.fires_bonus > 0.0 {
            let cut = self.hunter.fires_bonus.min(interval * 0.5);
            interval -= cut;
            self.hunter.fires_bonus -= cut;
        }
        self.actions
            .set(ActionKind::HunterAttack, self.time.in_at(interval.max(0.05)), "");
    }

    fn enemy_attack(&mut self, primary: bool) -> bool {
        let (is_boss, atk_power, crit_chance, crit_power) = {
            let Some(e) = self.enemy.as_ref() else {
                return false;
            };
            (e.is_boss, e.atk_power, e.crit_chance, e.crit_power)
        };

        if is_boss && primary {
            if let Some(e) = self.enemy.as_mut() {
                e.enrage(1);
            }
        }

        if self.hunter.evade_stacks >= 1 {
            self.hunter.evade_stacks -= 1;
            self.reschedule_enemy(primary);
            return false;
        }

        if self.rng.succeeds(self.stats.evade_chance.min(0.9)) {
            self.reschedule_enemy(primary);
            return false;
        }

        let mut dmg = atk_power;
        let was_crit = self.rng.succeeds(crit_chance);
        if was_crit {
            dmg *= crit_power;
            dmg *= (1.0 - 0.11 * self.stats.weakspot as f64).max(0.2);
            if self.hunter_id == "ozzy"
                && self.stats.dance_of_dashes > 0
                && self.rng.succeeds(0.15 * self.stats.dance_of_dashes as f64)
            {
                self.hunter.evade_stacks += 1;
            }
        }

        let mut dr = self.stats.dmg_reduction;
        if self.hunter_id == "ozzy" && self.stats.blessing_scarab > 0 {
            dr = (dr + 0.01 * self.stats.blessing_scarab as f64).min(0.99);
        }
        dmg *= 1.0 - dr;
        self.hunter.hp -= dmg;

        if self.hunter_id == "borge" && self.stats.helltouch > 0 && dmg > 0.0 {
            let mut frac = 0.08 * self.stats.helltouch as f64;
            if is_boss {
                frac *= 0.1;
            }
            let reflect = dmg * frac;
            if reflect > 0.0 {
                if let Some(e) = self.enemy.as_mut() {
                    e.hp -= reflect;
                    if e.hp <= 0.0 {
                        self.on_enemy_killed();
                        return false;
                    }
                }
            }
        }

        self.reschedule_enemy(primary);
        if self.hunter.hp <= 0.0 {
            return self.on_hunter_down();
        }
        false
    }

    fn reschedule_enemy(&mut self, primary: bool) {
        let Some(e) = self.enemy.as_ref() else {
            return;
        };
        if primary {
            self.actions.set(
                ActionKind::EnemyAttack,
                self.time.in_at(e.current_interval()),
                "",
            );
        } else {
            self.actions.set(
                ActionKind::EnemySecondary,
                self.time.in_at(e.current_secondary_interval()),
                "",
            );
        }
    }

    fn on_hunter_down(&mut self) -> bool {
        if self.hunter.revives_left > 0 {
            self.hunter.revives_left -= 1;
            self.revives_used += 1;
            self.hunter.hp = self.hunter.max_hp * 0.8;
            let cyc = self.stats.cycle_of_death;
            if cyc > 0 {
                self.stats.crit_chance =
                    (self.stats.crit_chance + 0.023 * cyc as f64).min(0.95);
                self.stats.crit_power += 0.02 * cyc as f64;
            }
            let deal = self.stats.deal_with_death;
            if deal > 0 {
                self.stats.atk_power *= 1.0 + 0.02 * deal as f64;
                self.stats.dmg_reduction =
                    (self.stats.dmg_reduction + 0.016 * deal as f64).min(0.9);
            }
            return false;
        }
        if let Some(e) = self.enemy.as_ref() {
            if e.is_boss && e.max_hp > 0.0 {
                self.boss_hp_at_death = Some(
                    (100.0 * e.hp / e.max_hp).max(0.0).min(100.0),
                );
            } else {
                self.boss_hp_at_death = None;
            }
        }
        self.stop_reason = "death".into();
        true
    }

    fn on_enemy_killed(&mut self) {
        let (loot, is_boss) = {
            let Some(e) = self.enemy.as_ref() else {
                return;
            };
            (e.loot, e.is_boss)
        };
        self.loot += loot * self.stats.loot_mult;
        self.xp += loot * 0.1 * self.stats.xp_mult;
        self.enemies_killed += 1;
        let cleared_boss = is_boss;
        if cleared_boss {
            self.bosses_killed += 1;
        }

        if self.stats.unfair > 0 && self.rng.succeeds(self.stats.effect_chance) {
            let heal = self.hunter.max_hp * 0.02 * self.stats.unfair as f64;
            self.hunter.hp = (self.hunter.hp + heal).min(self.hunter.max_hp);
            if self.hunter_id == "ozzy" && self.stats.vectid_elixir > 0 {
                let mult = 1.0 + 0.15 * self.stats.vectid_elixir as f64;
                if self.hunter.vectid_ticks <= 0 {
                    self.stats.hp_regen *= mult;
                }
                self.hunter.vectid_ticks = 5;
            }
        }

        self.clear_enemy_actions();
        let advanced = self.hunt_stage.advance();
        self.stage = self.hunt_stage.number;

        if self.spawn_enemy().is_err() {
            self.stop_reason = "spawn_error".into();
            return;
        }

        let enemy = self.enemy.as_ref().unwrap();
        self.actions.set(
            ActionKind::EnemyAttack,
            self.time.in_at(enemy.current_interval()),
            "",
        );
        if enemy.has_secondary {
            self.actions.set(
                ActionKind::EnemySecondary,
                self.time.in_at(enemy.current_secondary_interval()),
                "",
            );
        }
        if advanced {
            self.schedule_boss_skills();
        }
        if let Some(stop) = self.stop_after_boss {
            if cleared_boss && (self.stage - 1) == stop {
                self.stop_reason = format!("stop_after_boss_{stop}");
            }
        }
    }

    fn boss_skill(&mut self, tag: &str) {
        let Some(e) = self.enemy.as_mut() else {
            return;
        };
        match tag {
            "infernal" => {
                e.infernal_stacks += 1;
                e.atk_power *= 1.01;
                e.base_atk_power *= 1.01;
                self.actions
                    .set(ActionKind::BossSkill, self.time.in_at(10.0), "infernal");
            }
            "demonic" => {
                for kind in [ActionKind::EnemyAttack, ActionKind::EnemySecondary] {
                    if let Some(rem) = self.actions.remaining(kind, self.time.now, "") {
                        let new_t = if rem / 3.0 < 5.0 {
                            self.time.in_at(rem / 3.0)
                        } else {
                            self.time.in_at(rem - 5.0)
                        };
                        self.actions.set(kind, new_t, "");
                    }
                }
                self.actions
                    .set(ActionKind::BossSkill, self.time.in_at(60.0), "demonic");
            }
            "rekindle" => {
                if e.hp < e.max_hp {
                    e.hp = (e.hp + 0.12 * e.max_hp).min(e.max_hp);
                }
                self.actions
                    .set(ActionKind::BossSkill, self.time.in_at(120.0), "rekindle");
            }
            _ => {}
        }
    }

    fn harden(&mut self) {
        if let Some(e) = self.enemy.as_mut() {
            e.harden_active = true;
            e.harden_end = self.time.now + 5.0;
            e.enrage(5);
        }
        if let Some(rem) = self
            .actions
            .remaining(ActionKind::HunterAttack, self.time.now, "")
        {
            self.actions
                .set(ActionKind::HunterAttack, self.time.in_at(rem + 5.0), "");
        }
        self.actions
            .set(ActionKind::Harden, self.time.in_at(25.0), "");
    }
}

pub fn run_hunt(
    build: BuildConfig,
    seed: u64,
    stop_after_boss: Option<i32>,
    max_time: f64,
    max_stage: i32,
    stats: Option<CombatStats>,
) -> Result<HuntResult, String> {
    HuntEngine::new(
        build,
        seed,
        stop_after_boss,
        max_time,
        max_stage,
        stats,
    )
    .map(|e| e.run())
}

pub fn run_monte_carlo(
    build: BuildConfig,
    n: u32,
    seed: u64,
    stop_after_boss: Option<i32>,
    keep_runs: bool,
    boss_stages: &[i32],
    max_time: f64,
    max_stage: i32,
) -> Result<MonteCarloResult, String> {
    let boss_stages: Vec<i32> = if boss_stages.is_empty() {
        vec![100, 200, 300]
    } else {
        boss_stages.to_vec()
    };

    let mut runs = Vec::new();
    let mut stage_counts = std::collections::BTreeMap::new();
    let mut clears: std::collections::HashMap<i32, u32> =
        boss_stages.iter().map(|&b| (b, 0)).collect();
    let mut hp_sum: std::collections::HashMap<i32, f64> =
        boss_stages.iter().map(|&b| (b, 0.0)).collect();
    let mut hp_n: std::collections::HashMap<i32, u32> =
        boss_stages.iter().map(|&b| (b, 0)).collect();

    let mut total_time = 0.0;
    let mut total_loot = 0.0;
    let mut min_s = 1_000_000_000i32;
    let mut max_s = 0i32;
    let mut sum_s = 0.0;

    let shared_stats = resolve_combat_stats(&build);

    for i in 0..n {
        let r = run_hunt(
            build.clone(),
            seed + i as u64,
            stop_after_boss,
            max_time,
            max_stage,
            Some(shared_stats.clone()),
        )?;
        if keep_runs {
            runs.push(r.clone());
        }
        *stage_counts.entry(r.end_stage).or_insert(0) += 1;
        sum_s += r.end_stage as f64;
        total_time += r.time_seconds;
        total_loot += r.loot;
        min_s = min_s.min(r.end_stage);
        max_s = max_s.max(r.end_stage);

        for &b in &boss_stages {
            if r.end_stage > b {
                *clears.get_mut(&b).unwrap() += 1;
            } else if r.end_stage == b {
                if let Some(hp) = r.boss_hp_percent {
                    *hp_sum.get_mut(&b).unwrap() += hp;
                    *hp_n.get_mut(&b).unwrap() += 1;
                }
            } else {
                *hp_sum.get_mut(&b).unwrap() += 100.0;
                *hp_n.get_mut(&b).unwrap() += 1;
            }
        }
    }

    let n_f = n as f64;
    Ok(MonteCarloResult {
        hunter: build.hunter_id(),
        n,
        avg_stage: if n > 0 { sum_s / n_f } else { 0.0 },
        min_stage: if n == 0 { 0 } else { min_s },
        max_stage: max_s,
        avg_time_seconds: if n > 0 { total_time / n_f } else { 0.0 },
        avg_loot: if n > 0 { total_loot / n_f } else { 0.0 },
        stage_counts,
        boss_kill_rate: boss_stages
            .iter()
            .map(|&b| (b, clears[&b] as f64 / n_f.max(1.0)))
            .collect(),
        mean_boss_hp_percent: boss_stages
            .iter()
            .map(|&b| {
                let rate = if n > 0 {
                    clears[&b] as f64 / n_f
                } else {
                    0.0
                };
                let mean = if hp_n[&b] > 0 {
                    hp_sum[&b] / hp_n[&b] as f64
                } else if rate == 1.0 && n > 0 {
                    0.0
                } else {
                    100.0
                };
                (b, mean)
            })
            .collect(),
        runs,
        engine: "offline_hunt_port".into(),
        parity: "unvalidated".into(),
    })
}
