"""Event-driven OfflineHunt engine (Borge + Ozzy)."""

from __future__ import annotations

from dataclasses import dataclass, replace

from .actions import ActionKind, UnitActions
from .config import BuildConfig
from .enemy import EnemyUnit, spawn_enemy
from .hunt_stage import HuntStage
from .hunter_stats import CombatStats, resolve_combat_stats
from .result import HuntResult, MonteCarloResult
from .rng import HuntRoll, seed_state
from .time_model import HuntTime

# Extraction QueueEffects uses ~0.3s between follow-up hits.
_OZYY_FOLLOWUP_DELAY = 0.3


@dataclass
class HunterState:
    hp: float
    max_hp: float
    stats: CombatStats
    revives_left: int
    fires_bonus: float = 0.0  # seconds of interval reduction bank
    crippling_stacks: int = 0
    evade_stacks: int = 0  # Trickster / Dance free-evade charges
    vectid_ticks: int = 0  # remaining Vectid regen-buff ticks
    catchup_active: bool = False


class HuntEngine:
    def __init__(
        self,
        build: BuildConfig,
        seed: int = 1,
        stop_after_boss: int | None = None,
        max_time: float = 86_400.0,
        max_stage: int = 2000,
        stats: CombatStats | None = None,
    ):
        if build.hunter_id not in ("borge", "ozzy"):
            raise ValueError("only borge and ozzy are supported")
        self.build = build
        self.hunter_id = build.hunter_id
        self.seed = seed
        self.stop_after_boss = stop_after_boss
        self.max_time = max_time
        self.max_stage = max_stage

        # Per-hunt copy so revive buffs (Cycle/Deal) do not leak across MC runs.
        base = stats if stats is not None else resolve_combat_stats(build)
        self.stats = replace(base)
        self.time = HuntTime(0.0)
        self.actions = UnitActions()
        self.rng = HuntRoll(seed_state(seed))
        self.hunter = HunterState(
            hp=self.stats.max_hp,
            max_hp=self.stats.max_hp,
            stats=self.stats,
            revives_left=max(0, self.stats.revival_charges),
        )
        self.hunt_stage = HuntStage(number=1, progress=0)
        self.stage = self.hunt_stage.number
        self.enemy: EnemyUnit | None = None
        self.enemies_killed = 0
        self.bosses_killed = 0
        self.loot = 0.0
        self.xp = 0.0
        self.revives_used = 0
        self.boss_hp_at_death: float | None = None
        self.stop_reason = ""
        self._activate_catchup_if_needed()
        self._spawn_enemy()
        self._schedule_initial()

    def _catchup_mult(self) -> float:
        lvl = self.stats.catchup_level
        if lvl < 1:
            return 1.0
        return 1.08**lvl

    def _activate_catchup_if_needed(self) -> None:
        """Attraction Catch-Up: ×1.08^lvl ATK & speed until stage 100 boss."""
        if self.hunter.catchup_active:
            return
        if self.stats.catchup_level < 1 or self.stage > 99:
            return
        m = self._catchup_mult()
        self.stats.atk_power *= m
        self.stats.atk_interval = max(0.05, self.stats.atk_interval / m)
        self.hunter.catchup_active = True

    def _deactivate_catchup(self) -> None:
        if not self.hunter.catchup_active:
            return
        m = self._catchup_mult()
        self.stats.atk_power /= m
        self.stats.atk_interval *= m
        self.hunter.catchup_active = False

    def _spawn_enemy(self) -> None:
        # Catch-Up drops on first boss (stage 100 / Benchy / Frogbloth).
        if self.stage >= 100 and self.hunter.catchup_active:
            self._deactivate_catchup()
        elif self.stage <= 99:
            self._activate_catchup_if_needed()
        self.enemy = spawn_enemy(self.hunter_id, self.stage, self.stats.presence)

    def _schedule_initial(self) -> None:
        assert self.enemy is not None
        self.actions.set(ActionKind.HUNTER_ATTACK, self.time.in_(self.stats.atk_interval))
        self.actions.set(ActionKind.ENEMY_ATTACK, self.time.in_(self.enemy.current_interval()))
        if self.enemy.has_secondary:
            self.actions.set(
                ActionKind.ENEMY_SECONDARY,
                self.time.in_(self.enemy.current_secondary_interval()),
            )
        self.actions.set(ActionKind.REGEN_TICK, self.time.next_second())
        self._schedule_boss_skills()

    def _schedule_boss_skills(self) -> None:
        assert self.enemy is not None
        e = self.enemy
        if self.hunter_id == "borge" and e.name == "Dragorim":
            self.actions.set(ActionKind.BOSS_SKILL, self.time.in_(10.0), tag="infernal")
            self.actions.set(ActionKind.BOSS_SKILL, self.time.in_(60.0), tag="demonic")
        if self.hunter_id == "borge" and e.name == "Mordrekarn":
            self.actions.set(ActionKind.BOSS_SKILL, self.time.in_(120.0), tag="rekindle")
        if self.hunter_id == "ozzy" and e.name == "Exoscarab":
            self.actions.set(ActionKind.HARDEN, self.time.in_(25.0))

    def _clear_enemy_actions(self) -> None:
        self.actions.clear_kinds(
            (
                ActionKind.ENEMY_ATTACK,
                ActionKind.ENEMY_SECONDARY,
                ActionKind.BOSS_SKILL,
                ActionKind.HARDEN,
            )
        )

    def run(self) -> HuntResult:
        steps = 0
        max_steps = 2_000_000  # hard cap so a stalemate cannot freeze launch.py / UI
        while True:
            steps += 1
            if steps > max_steps:
                self.stop_reason = "max_steps"
                break
            if self.time.now >= self.max_time:
                self.stop_reason = "max_time"
                break
            if self.stage > self.max_stage:
                self.stop_reason = "max_stage"
                break
            nxt = self.actions.pop_next()
            if nxt is None:
                self.stop_reason = "no_actions"
                break
            self.time.advance(nxt.time)
            if nxt.kind == ActionKind.REGEN_TICK:
                self._on_regen()
            elif nxt.kind == ActionKind.HUNTER_ATTACK:
                self._hunter_attack()
            elif nxt.kind == ActionKind.ENEMY_ATTACK:
                if self._enemy_attack(primary=True):
                    break
            elif nxt.kind == ActionKind.ENEMY_SECONDARY:
                if self._enemy_attack(primary=False):
                    break
            elif nxt.kind == ActionKind.BOSS_SKILL:
                self._boss_skill(nxt.tag)
            elif nxt.kind == ActionKind.HARDEN:
                self._harden()
            elif nxt.kind == ActionKind.MULTISTRIKE:
                self._ozzy_extra_hit(multistrike=True)
            elif nxt.kind == ActionKind.ECHO:
                self._ozzy_extra_hit(multistrike=False)

            if self.stop_reason:
                break

        return HuntResult(
            hunter=self.hunter_id,
            end_stage=self.stage,
            time_seconds=self.time.now,
            enemies_killed=self.enemies_killed,
            bosses_killed=self.bosses_killed,
            loot=self.loot,
            xp=self.xp,
            revives_used=self.revives_used,
            died=self.stop_reason.startswith("death"),
            boss_hp_percent=self.boss_hp_at_death,
            stop_reason=self.stop_reason or "unknown",
            seed=self.seed,
        )

    def _on_regen(self) -> None:
        assert self.enemy is not None
        # Batch idle regen until the next scheduled action (or harden expiry).
        nxt_t = self.actions.earliest_time()
        seconds = 1.0
        if nxt_t is not None:
            seconds = max(1.0, min(float(int(nxt_t - self.time.now)), 60.0))
        if self.enemy.harden_active:
            until = max(0.0, self.enemy.harden_end - self.time.now)
            if until <= 0:
                self.enemy.harden_active = False
            else:
                seconds = max(1.0, min(seconds, float(int(until)) or 1.0))

        # Vectid Elixir: one Consume per regen second; don't batch past remaining ticks
        if self.hunter.vectid_ticks > 0:
            seconds = max(1.0, min(seconds, float(self.hunter.vectid_ticks)))
        h_regen = self.stats.hp_regen * seconds
        if self.hunter.vectid_ticks > 0:
            self.hunter.vectid_ticks -= int(seconds)
            if self.hunter.vectid_ticks <= 0:
                self.hunter.vectid_ticks = 0
                if self.stats.vectid_elixir > 0:
                    self.stats.hp_regen /= 1.0 + 0.15 * self.stats.vectid_elixir
                    h_regen = self.stats.hp_regen * seconds

        e_regen = self.enemy.effective_regen() * seconds
        if e_regen > 0:
            if self.hunter_id == "borge" and self.stats.omen > 0:
                # Omen of Defeat: regen × (1 − 0.08×lvl) / boss (1 − 0.04×lvl)
                cut = 0.04 if self.enemy.is_boss else 0.08
                e_regen *= max(0.0, 1.0 - cut * self.stats.omen)
            if self.hunter_id == "ozzy":
                # Soul of Snek: regen × (1 − 0.088×lvl)
                if self.stats.soul_of_snek > 0:
                    e_regen *= max(0.0, 1.0 - 0.088 * self.stats.soul_of_snek)
                # Gift of Medusa: regen − hunter_regen × 0.06×lvl
                if self.stats.gift_of_medusa > 0:
                    e_regen -= self.stats.hp_regen * 0.06 * self.stats.gift_of_medusa * seconds
                    e_regen = max(0.0, e_regen)
        if self.hunter.hp > 0 and h_regen:
            self.hunter.hp = min(self.hunter.max_hp, self.hunter.hp + h_regen)
        if self.enemy.hp > 0 and e_regen:
            self.enemy.hp = min(self.enemy.max_hp, self.enemy.hp + e_regen)
        if self.enemy.harden_active and self.time.now + seconds >= self.enemy.harden_end:
            self.enemy.harden_active = False
        self.actions.set(ActionKind.REGEN_TICK, self.time.now + seconds)

    def _deal_to_enemy(self, raw_damage: float) -> tuple[bool, bool]:
        """Apply damage. Returns (hit_connected, killed).

        Extraction Defend returns hit-connected (!evade), not 'still alive'.
        Follow-ups (MS/Echo/…) must run on connect even if the pack died.
        """
        assert self.enemy is not None
        e = self.enemy
        if self.rng.succeeds(e.evade_chance):
            return False, False
        dmg = raw_damage
        # Ozzy Defend order: Scorpion heal (pre-DR) → Omen %HP → Crippling → DR
        if self.hunter_id == "ozzy":
            if self.stats.shimmering_scorpions > 0:
                heal = dmg * 0.033 * self.stats.shimmering_scorpions
                self.hunter.hp = min(self.hunter.max_hp, self.hunter.hp + heal)
            if self.stats.omen > 0 and e.hp > 0:
                frac = 0.008 * self.stats.omen
                if e.is_boss:
                    frac *= 0.1
                dmg += e.hp * frac
            if self.hunter.crippling_stacks >= 1:
                dmg *= 1.0 + 0.03 * self.hunter.crippling_stacks
                self.hunter.crippling_stacks = 0
        # Life of the Hunt: EC → heal 6%×lvl of pre-DR damage (Defend order)
        if (
            self.hunter_id == "borge"
            and self.stats.life_of_the_hunt > 0
            and self.rng.succeeds(self.stats.effect_chance)
        ):
            heal = dmg * 0.06 * self.stats.life_of_the_hunt
            self.hunter.hp = min(self.hunter.max_hp, self.hunter.hp + heal)
        dmg *= 1.0 - e.effective_dr()
        e.hp -= dmg
        heal_frac = self.stats.lifesteal
        if self.stats.lifedrain > 0:
            heal_frac += 0.0008 * self.stats.lifedrain
        if heal_frac > 0:
            self.hunter.hp = min(self.hunter.max_hp, self.hunter.hp + dmg * heal_frac)
        if e.hp <= 0:
            self._on_enemy_killed()
            return True, True
        return True, False

    def _borge_on_hit_followups(self) -> None:
        """Borge chain after a connected hit (Impeccable → Fires of War)."""
        assert self.enemy is not None
        # Impeccable Impacts: EC → stun 0.1s×lvl (boss half)
        if self.stats.impeccable > 0 and self.rng.succeeds(self.stats.effect_chance):
            stun = 0.1 * self.stats.impeccable
            if self.enemy.is_boss:
                stun *= 0.5
            rem = self.actions.remaining(ActionKind.ENEMY_ATTACK, self.time.now)
            if rem is not None:
                self.actions.set(ActionKind.ENEMY_ATTACK, self.time.in_(rem + stun))
        # Fires of War: EC → SET frenzy bank to 0.1s×lvl (not accumulate)
        if self.stats.fires_of_war > 0 and self.rng.succeeds(self.stats.effect_chance):
            self.hunter.fires_bonus = 0.1 * self.stats.fires_of_war

    def _ozzy_on_hit_followups(self, *, from_echo: bool = False) -> None:
        """Ozzy chain after a connected hit.

        Primary Attack: Crippling → MS → Echo → Trickster → Needles.
        Echo hit: Crippling → TriggerMultiStrike only (no nested Echo).
        """
        if self.stats.crippling > 0 and self.rng.succeeds(self.stats.effect_chance):
            self.hunter.crippling_stacks += self.stats.crippling
        if self.rng.succeeds(self.stats.crit_chance):
            self.actions.set(ActionKind.MULTISTRIKE, self.time.in_(_OZYY_FOLLOWUP_DELAY))
        if from_echo:
            return
        echo_p = 0.5 * self.stats.effect_chance if self.stats.echo_level > 0 else 0.0
        if echo_p > 0 and self.rng.succeeds(echo_p):
            self.actions.set(ActionKind.ECHO, self.time.in_(_OZYY_FOLLOWUP_DELAY))
        # Trickster: ½ effect chance → gain `level` free-evade charges
        if self.stats.tricksters_boon > 0 and self.rng.succeeds(0.5 * self.stats.effect_chance):
            self.hunter.evade_stacks += self.stats.tricksters_boon
        # Thousand Needles: stun enemy attack timer
        if self.stats.thousand_needles > 0 and self.rng.succeeds(self.stats.effect_chance):
            stun = 0.05 * self.stats.thousand_needles
            rem = self.actions.remaining(ActionKind.ENEMY_ATTACK, self.time.now)
            if rem is not None:
                self.actions.set(ActionKind.ENEMY_ATTACK, self.time.in_(rem + stun))

    def _hunter_attack(self) -> bool:
        assert self.enemy is not None
        dmg = self.stats.atk_power
        if self.hunter_id == "borge":
            dmg *= 1.0 + 0.01 * self.stats.born_for_battle
            if self.rng.succeeds(self.stats.crit_chance):
                dmg *= self.stats.crit_power
            hit, _killed = self._deal_to_enemy(dmg)
            if hit:
                self._borge_on_hit_followups()
            self._schedule_next_hunter_attack()
            return False

        # Ozzy primary — follow-ups gate on hit-connect, not on kill
        hit, _killed = self._deal_to_enemy(dmg)
        if hit:
            self._ozzy_on_hit_followups(from_echo=False)
        self._schedule_next_hunter_attack()
        return False

    def _ozzy_extra_hit(self, multistrike: bool) -> bool:
        if multistrike:
            dmg = self.stats.atk_power * self.stats.crit_power
        else:
            dmg = self.stats.atk_power * 0.05 * max(1, self.stats.echo_level)
        hit, _killed = self._deal_to_enemy(dmg)
        if hit:
            if multistrike:
                if self.stats.crippling > 0 and self.rng.succeeds(self.stats.effect_chance):
                    self.hunter.crippling_stacks += self.stats.crippling
            else:
                # Echo connect: Crippling + TriggerMultiStrike (no nested Echo)
                self._ozzy_on_hit_followups(from_echo=True)
        return False

    def _schedule_next_hunter_attack(self) -> None:
        interval = self.stats.atk_interval
        if self.hunter_id == "borge" and self.hunter.fires_bonus > 0:
            cut = min(self.hunter.fires_bonus, interval * 0.5)
            interval -= cut
            self.hunter.fires_bonus -= cut
        self.actions.set(ActionKind.HUNTER_ATTACK, self.time.in_(max(0.05, interval)))

    def _enemy_attack(self, primary: bool) -> bool:
        """Returns True if hunter died for good."""
        assert self.enemy is not None
        e = self.enemy
        # Boss enrage stacks on boss attacks (not on hunter hits).
        if e.is_boss and primary:
            e.enrage(1)
        # Trickster charge = free full evade (consume one stack)
        if self.hunter.evade_stacks >= 1:
            self.hunter.evade_stacks -= 1
            self._reschedule_enemy(primary)
            return False
        if self.rng.succeeds(min(0.9, self.stats.evade_chance)):
            self._reschedule_enemy(primary)
            return False
        dmg = e.atk_power
        was_crit = self.rng.succeeds(e.crit_chance)
        if was_crit:
            dmg *= e.crit_power
            dmg *= max(0.2, 1.0 - 0.11 * self.stats.weakspot)
            # Dance of Dashes: on taking a crit → 15%×lvl chance for +1 evade charge
            if (
                self.hunter_id == "ozzy"
                and self.stats.dance_of_dashes > 0
                and self.rng.succeeds(0.15 * self.stats.dance_of_dashes)
            ):
                self.hunter.evade_stacks += 1
        dr = self.stats.dmg_reduction
        # Blessing of the Scarab: extra incoming DR 1%×lvl
        if self.hunter_id == "ozzy" and self.stats.blessing_scarab > 0:
            dr = min(0.99, dr + 0.01 * self.stats.blessing_scarab)
        dmg *= 1.0 - dr
        self.hunter.hp -= dmg
        # Helltouch Barrier: reflect 8%×lvl of damage taken (boss ÷10)
        if self.hunter_id == "borge" and self.stats.helltouch > 0 and dmg > 0:
            frac = 0.08 * self.stats.helltouch
            if e.is_boss:
                frac *= 0.1
            reflect = dmg * frac
            if reflect > 0:
                e.hp -= reflect
                if e.hp <= 0:
                    self._on_enemy_killed()
                    return False
        self._reschedule_enemy(primary)
        if self.hunter.hp <= 0:
            return self._on_hunter_down()
        return False

    def _reschedule_enemy(self, primary: bool) -> None:
        assert self.enemy is not None
        e = self.enemy
        if primary:
            self.actions.set(ActionKind.ENEMY_ATTACK, self.time.in_(e.current_interval()))
        else:
            self.actions.set(
                ActionKind.ENEMY_SECONDARY,
                self.time.in_(e.current_secondary_interval()),
            )

    def _on_hunter_down(self) -> bool:
        assert self.enemy is not None
        if self.hunter.revives_left > 0:
            self.hunter.revives_left -= 1
            self.revives_used += 1
            # Death Is My Companion: revive at 80% Max HP
            self.hunter.hp = self.hunter.max_hp * 0.8
            # Cycle of Death / Deal with Death apply per revive used
            cyc = self.stats.cycle_of_death
            if cyc > 0:
                self.stats.crit_chance = min(0.95, self.stats.crit_chance + 0.023 * cyc)
                self.stats.crit_power += 0.02 * cyc
            deal = self.stats.deal_with_death
            if deal > 0:
                self.stats.atk_power *= 1.0 + 0.02 * deal
                self.stats.dmg_reduction = min(0.9, self.stats.dmg_reduction + 0.016 * deal)
            return False
        if self.enemy.is_boss and self.enemy.max_hp > 0:
            self.boss_hp_at_death = max(0.0, min(100.0, 100.0 * self.enemy.hp / self.enemy.max_hp))
        else:
            self.boss_hp_at_death = None
        self.stop_reason = "death"
        return True

    def _on_enemy_killed(self) -> None:
        assert self.enemy is not None
        e = self.enemy
        self.loot += e.loot * self.stats.loot_mult
        self.xp += e.loot * 0.1 * self.stats.xp_mult
        self.enemies_killed += 1
        cleared_boss = e.is_boss
        if cleared_boss:
            self.bosses_killed += 1
        # Unfair Advantage: on kill, effect-chance → heal 2% MaxHP × level
        if self.stats.unfair > 0 and self.rng.succeeds(self.stats.effect_chance):
            heal = self.hunter.max_hp * 0.02 * self.stats.unfair
            self.hunter.hp = min(self.hunter.max_hp, self.hunter.hp + heal)
            # Vectid Elixir: after Unfair → +15%×lvl regen for 5 ticks (refresh)
            if self.hunter_id == "ozzy" and self.stats.vectid_elixir > 0:
                mult = 1.0 + 0.15 * self.stats.vectid_elixir
                if self.hunter.vectid_ticks <= 0:
                    self.stats.hp_regen *= mult
                self.hunter.vectid_ticks = 5
        self._clear_enemy_actions()
        # OfflineHunt: 10 kills per normal stage; bosses (stage % 100 == 0) clear in 1.
        advanced = self.hunt_stage.advance()
        self.stage = self.hunt_stage.number
        self._spawn_enemy()
        assert self.enemy is not None
        self.actions.set(ActionKind.ENEMY_ATTACK, self.time.in_(self.enemy.current_interval()))
        if self.enemy.has_secondary:
            self.actions.set(
                ActionKind.ENEMY_SECONDARY,
                self.time.in_(self.enemy.current_secondary_interval()),
            )
        if advanced:
            self._schedule_boss_skills()
        if self.stop_after_boss and cleared_boss and (self.stage - 1) == self.stop_after_boss:
            self.stop_reason = f"stop_after_boss_{self.stop_after_boss}"

    def _boss_skill(self, tag: str) -> None:
        assert self.enemy is not None
        e = self.enemy
        if tag == "infernal":
            e.infernal_stacks += 1
            e.atk_power *= 1.01
            e.base_atk_power *= 1.01
            self.actions.set(ActionKind.BOSS_SKILL, self.time.in_(10.0), tag="infernal")
        elif tag == "demonic":
            # Shift primary/secondary timers toward now (haste)
            for kind in (ActionKind.ENEMY_ATTACK, ActionKind.ENEMY_SECONDARY):
                rem = self.actions.remaining(kind, self.time.now)
                if rem is None:
                    continue
                if rem / 3.0 < 5.0:
                    new_t = self.time.in_(rem / 3.0)
                else:
                    new_t = self.time.in_(rem - 5.0)
                self.actions.set(kind, new_t)
            self.actions.set(ActionKind.BOSS_SKILL, self.time.in_(60.0), tag="demonic")
        elif tag == "rekindle":
            if e.hp < e.max_hp:
                e.hp = min(e.max_hp, e.hp + 0.12 * e.max_hp)
            self.actions.set(ActionKind.BOSS_SKILL, self.time.in_(120.0), tag="rekindle")

    def _harden(self) -> None:
        assert self.enemy is not None
        e = self.enemy
        e.harden_active = True
        e.harden_end = self.time.now + 5.0
        e.enrage(5)
        # Stun hunter path stub: delay hunter attack by 5s
        rem = self.actions.remaining(ActionKind.HUNTER_ATTACK, self.time.now)
        if rem is not None:
            self.actions.set(ActionKind.HUNTER_ATTACK, self.time.in_(rem + 5.0))
        self.actions.set(ActionKind.HARDEN, self.time.in_(25.0))


def run_hunt(
    build: BuildConfig,
    seed: int = 1,
    stop_after_boss: int | None = None,
    max_time: float = 86_400.0,
    max_stage: int = 2000,
    stats: CombatStats | None = None,
) -> HuntResult:
    return HuntEngine(
        build,
        seed=seed,
        stop_after_boss=stop_after_boss,
        max_time=max_time,
        max_stage=max_stage,
        stats=stats,
    ).run()


def run_monte_carlo(
    build: BuildConfig,
    n: int = 100,
    seed: int = 1,
    stop_after_boss: int | None = None,
    keep_runs: bool = False,
    boss_stages: list[int] | None = None,
    max_time: float = 86_400.0,
    max_stage: int = 2000,
) -> MonteCarloResult:
    boss_stages = boss_stages or [100, 200, 300]
    runs: list[HuntResult] = []
    stage_counts: dict[int, int] = {}
    clears = {b: 0 for b in boss_stages}
    hp_sum = {b: 0.0 for b in boss_stages}
    hp_n = {b: 0 for b in boss_stages}
    total_time = 0.0
    total_loot = 0.0
    min_s = 10**9
    max_s = 0
    sum_s = 0.0
    # Finals are deterministic for a build — resolve once for the whole batch.
    shared_stats = resolve_combat_stats(build)

    for i in range(n):
        r = run_hunt(
            build,
            seed=seed + i,
            stop_after_boss=stop_after_boss,
            max_time=max_time,
            max_stage=max_stage,
            stats=shared_stats,
        )
        if keep_runs:
            runs.append(r)
        stage_counts[r.end_stage] = stage_counts.get(r.end_stage, 0) + 1
        sum_s += r.end_stage
        total_time += r.time_seconds
        total_loot += r.loot
        min_s = min(min_s, r.end_stage)
        max_s = max(max_s, r.end_stage)
        for b in boss_stages:
            if r.end_stage > b:
                clears[b] += 1
            elif r.end_stage == b and r.boss_hp_percent is not None:
                hp_sum[b] += r.boss_hp_percent
                hp_n[b] += 1
            elif r.end_stage < b:
                hp_sum[b] += 100.0
                hp_n[b] += 1

    return MonteCarloResult(
        hunter=build.hunter_id,
        n=n,
        avg_stage=sum_s / n if n else 0.0,
        min_stage=0 if n == 0 else min_s,
        max_stage=max_s,
        avg_time_seconds=total_time / n if n else 0.0,
        avg_loot=total_loot / n if n else 0.0,
        stage_counts=dict(sorted(stage_counts.items())),
        boss_kill_rate={b: clears[b] / n if n else 0.0 for b in boss_stages},
        mean_boss_hp_percent={
            b: (hp_sum[b] / hp_n[b] if hp_n[b] else (0.0 if clears[b] == n else 100.0))
            for b in boss_stages
        },
        runs=runs,
    )
