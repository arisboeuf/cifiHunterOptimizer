"""Event-driven OfflineHunt engine (Borge + Ozzy)."""

from __future__ import annotations

from dataclasses import dataclass

from .actions import ActionKind, UnitActions
from .config import BuildConfig
from .enemy import EnemyUnit, spawn_enemy
from .hunter_stats import CombatStats, resolve_combat_stats
from .result import HuntResult, MonteCarloResult
from .rng import HuntRoll, seed_state
from .time_model import HuntTime


@dataclass
class HunterState:
    hp: float
    max_hp: float
    stats: CombatStats
    revives_left: int
    fires_bonus: float = 0.0  # seconds of interval reduction bank
    crippling_stacks: int = 0
    evade_stacks: int = 0  # trickster stub


class HuntEngine:
    def __init__(
        self,
        build: BuildConfig,
        seed: int = 1,
        stop_after_boss: int | None = None,
        max_time: float = 86_400.0,
        max_stage: int = 2000,
    ):
        if build.hunter_id not in ("borge", "ozzy"):
            raise ValueError("only borge and ozzy are supported")
        self.build = build
        self.hunter_id = build.hunter_id
        self.seed = seed
        self.stop_after_boss = stop_after_boss
        self.max_time = max_time
        self.max_stage = max_stage

        self.stats = resolve_combat_stats(build)
        self.time = HuntTime(0.0)
        self.actions = UnitActions()
        self.rng = HuntRoll(seed_state(seed))
        self.hunter = HunterState(
            hp=self.stats.max_hp,
            max_hp=self.stats.max_hp,
            stats=self.stats,
            revives_left=max(0, self.stats.revival_charges),
        )
        self.stage = 1
        self.enemy: EnemyUnit | None = None
        self.enemies_killed = 0
        self.bosses_killed = 0
        self.loot = 0.0
        self.xp = 0.0
        self.revives_used = 0
        self.boss_hp_at_death: float | None = None
        self.stop_reason = ""
        self._spawn_enemy()
        self._schedule_initial()

    def _spawn_enemy(self) -> None:
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
        for kind in (
            ActionKind.ENEMY_ATTACK,
            ActionKind.ENEMY_SECONDARY,
            ActionKind.BOSS_SKILL,
            ActionKind.HARDEN,
        ):
            # remove all tags for these kinds
            self.actions._items = [a for a in self.actions._items if a.kind != kind]

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
        # Hunter regen
        if self.hunter.hp > 0:
            self.hunter.hp = min(self.hunter.max_hp, self.hunter.hp + self.stats.hp_regen)
        # Enemy regen
        if self.enemy.hp > 0:
            self.enemy.hp = min(
                self.enemy.max_hp,
                self.enemy.hp + self.enemy.effective_regen(),
            )
        # Harden expiry
        if self.enemy.harden_active and self.time.now >= self.enemy.harden_end:
            self.enemy.harden_active = False
        self.actions.set(ActionKind.REGEN_TICK, self.time.next_second())

    def _deal_to_enemy(self, raw_damage: float) -> bool:
        """Apply damage to enemy. Returns True if enemy died."""
        assert self.enemy is not None
        e = self.enemy
        if self.rng.succeeds(e.evade_chance):
            return False
        dmg = raw_damage
        # Crippling shots consume on Ozzy damage applications
        if self.hunter_id == "ozzy" and self.hunter.crippling_stacks >= 1:
            dmg *= 1.0 + 0.03 * self.hunter.crippling_stacks
            self.hunter.crippling_stacks = 0
        dmg *= 1.0 - e.effective_dr()
        e.hp -= dmg
        heal_frac = self.stats.lifesteal
        if self.stats.lifedrain > 0:
            # Lifedrain Inhalers tip: missing-HP regen; stub as small on-hit heal.
            heal_frac += 0.0008 * self.stats.lifedrain
        if heal_frac > 0:
            self.hunter.hp = min(self.hunter.max_hp, self.hunter.hp + dmg * heal_frac)
        if e.is_boss:
            e.enrage(1)
        if e.hp <= 0:
            self._on_enemy_killed()
            return True
        return False

    def _hunter_attack(self) -> bool:
        assert self.enemy is not None
        dmg = self.stats.atk_power
        if self.hunter_id == "borge":
            # Born for Battle
            dmg *= 1.0 + 0.01 * self.stats.born_for_battle
            if self.rng.succeeds(self.stats.crit_chance):
                dmg *= self.stats.crit_power
            killed = self._deal_to_enemy(dmg)
            # Fires of War / Athena stubs after successful connect
            if not killed and self.stats.fires_of_war > 0:
                self.hunter.fires_bonus += 0.05 * self.stats.fires_of_war
            self._schedule_next_hunter_attack()
            if killed:
                return True
            return False

        # Ozzy primary
        killed = self._deal_to_enemy(dmg)
        if killed:
            self._schedule_next_hunter_attack()
            return True
        # Crippling stack chance (effect)
        if self.stats.crippling > 0 and self.rng.succeeds(self.stats.effect_chance):
            self.hunter.crippling_stacks += self.stats.crippling
        # Multistrike
        if self.rng.succeeds(self.stats.crit_chance):
            self.actions.set(ActionKind.MULTISTRIKE, self.time.in_(0.01))
        # Echo
        echo_p = 0.5 * self.stats.effect_chance if self.stats.echo_level > 0 else 0.0
        if echo_p > 0 and self.rng.succeeds(echo_p):
            self.actions.set(ActionKind.ECHO, self.time.in_(0.02))
        # Trickster evade stacks (stub)
        if self.stats.tricksters_boon > 0 and self.rng.succeeds(0.1 * self.stats.tricksters_boon):
            self.hunter.evade_stacks += 1
        self._schedule_next_hunter_attack()
        return False

    def _ozzy_extra_hit(self, multistrike: bool) -> bool:
        if multistrike:
            dmg = self.stats.atk_power * self.stats.crit_power
        else:
            dmg = self.stats.atk_power * 0.05 * max(1, self.stats.echo_level)
        killed = self._deal_to_enemy(dmg)
        if not killed and self.stats.crippling > 0 and self.rng.succeeds(self.stats.effect_chance):
            self.hunter.crippling_stacks += self.stats.crippling
        return killed

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
        evade = self.stats.evade_chance + 0.02 * self.hunter.evade_stacks
        if self.hunter.evade_stacks > 0:
            self.hunter.evade_stacks -= 1
        if self.rng.succeeds(min(0.9, evade)):
            self._reschedule_enemy(primary)
            return False
        dmg = e.atk_power
        if self.rng.succeeds(e.crit_chance):
            dmg *= e.crit_power
            # Weakspot reduces crit damage taken
            dmg *= max(0.2, 1.0 - 0.11 * self.stats.weakspot)
        dmg *= 1.0 - self.stats.dmg_reduction
        # Atlas boss ATK speed note already in enemy interval via enrage
        self.hunter.hp -= dmg
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
            self.hunter.hp = self.hunter.max_hp
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
        self._clear_enemy_actions()
        self.stage += 1
        self._spawn_enemy()
        assert self.enemy is not None
        self.actions.set(ActionKind.ENEMY_ATTACK, self.time.in_(self.enemy.current_interval()))
        if self.enemy.has_secondary:
            self.actions.set(
                ActionKind.ENEMY_SECONDARY,
                self.time.in_(self.enemy.current_secondary_interval()),
            )
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
) -> HuntResult:
    return HuntEngine(
        build,
        seed=seed,
        stop_after_boss=stop_after_boss,
        max_time=max_time,
        max_stage=max_stage,
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

    for i in range(n):
        r = run_hunt(
            build,
            seed=seed + i,
            stop_after_boss=stop_after_boss,
            max_time=max_time,
            max_stage=max_stage,
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
