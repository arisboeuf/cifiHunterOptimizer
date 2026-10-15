"""Enemy unit factory and runtime state."""

from __future__ import annotations

from dataclasses import dataclass, field

from .enemy_stats import enemy_stats
from .rng import boss_attack_interval


def enemy_name(hunter: str, stage: int) -> str:
    hunter = hunter.lower()
    if hunter == "borge":
        if stage < 100:
            return "BorgeEnemy"
        if stage == 100:
            return "Frogbloth"
        if stage < 200:
            return "Arachnavis"
        if stage == 200:
            return "Gothmorgor"
        if stage < 300:
            return "Beakslasher"
        if stage == 300:
            return "GothulRul"
        if stage < 400:
            return "Warhound"
        if stage == 400:
            return "Dragorim"
        if stage < 500:
            return "Cerebelath"
        if stage == 500:
            return "Mordrekarn"
        return "UnknownBoss" if stage % 100 == 0 else "UnknownEnemy"
    # Ozzy
    if stage == 100:
        return "Benchy"
    if stage == 200:
        return "Exoscarab"
    if stage % 100 == 0:
        return "OzzyBoss"
    if stage < 100:
        return "Drone"
    return "OzzyEnemy"


@dataclass
class EnemyUnit:
    stage: int
    name: str
    is_boss: bool
    max_hp: float
    hp: float
    atk_power: float
    base_atk_power: float
    hp_regen: float
    dmg_reduction: float
    evade_chance: float
    effect_chance: float
    crit_chance: float
    crit_power: float
    base_interval: float
    loot: float
    enrage_stack: int = 0
    is_furious: bool = False
    has_secondary: bool = False
    secondary_interval: float = 0.0
    # Boss skill state
    harden_active: bool = False
    harden_end: float = 0.0
    infernal_stacks: int = 0
    demonic_bonus: float = 0.0
    tags: dict = field(default_factory=dict)

    def current_interval(self) -> float:
        return boss_attack_interval(self.base_interval, self.enrage_stack)

    def current_secondary_interval(self) -> float:
        base = self.secondary_interval or (self.base_interval * 1.8)
        return boss_attack_interval(base, self.enrage_stack)

    def apply_presence(self, presence_level: int) -> None:
        if presence_level <= 0:
            return
        mult = max(0.05, 1.0 - 0.04 * presence_level)
        self.max_hp *= mult
        self.hp = self.max_hp

    def enrage(self, stacks: int = 1) -> None:
        if self.is_furious:
            return
        self.enrage_stack = min(200, self.enrage_stack + stacks)
        if self.enrage_stack >= 200:
            self.enrage_stack = 200
            self.is_furious = True
            self.atk_power = self.base_atk_power * 3.0
            self.crit_chance = 1.0

    def effective_dr(self) -> float:
        dr = self.dmg_reduction
        if self.harden_active:
            dr = max(dr, 0.95)
        return min(0.99, dr)

    def effective_regen(self) -> float:
        r = self.hp_regen
        if self.harden_active:
            r *= 3.0
        return r


def spawn_enemy(hunter: str, stage: int, presence: int = 0) -> EnemyUnit:
    st = enemy_stats(hunter, stage)
    name = enemy_name(hunter, stage)
    has_secondary = hunter.lower() == "borge" and stage == 200
    secondary = st["attack_interval_seconds"] * 1.8 if has_secondary else 0.0
    unit = EnemyUnit(
        stage=stage,
        name=name,
        is_boss=bool(st["boss"]),
        max_hp=float(st["max_hp"]),
        hp=float(st["max_hp"]),
        atk_power=float(st["atk_power"]),
        base_atk_power=float(st["atk_power"]),
        hp_regen=float(st["hp_regen"]),
        dmg_reduction=float(st["dmg_reduction"]),
        evade_chance=float(st["evade_chance"]),
        effect_chance=float(st["effect_chance"]),
        crit_chance=float(st["crit_chance"]),
        crit_power=float(st["crit_power"]),
        base_interval=float(st["attack_interval_seconds"]),
        loot=float(st["loot"]),
        has_secondary=has_secondary,
        secondary_interval=secondary,
    )
    unit.apply_presence(presence)
    return unit
