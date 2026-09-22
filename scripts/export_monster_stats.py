"""Export enemy/boss base stats to docs/monster_stats/*.csv (documentation only).

Formulas originally from hunter-sim units.py (Enemy/Boss.fetch_stats).
Values are *base* monster stats before hunter talents (PoG, Omen, …) are applied.
"""

from __future__ import annotations

import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "monster_stats"

# Combat caps from Enemy.__create__ (patch 2024-01-24)
CRIT_CHANCE_CAP = 0.25
CRIT_DAMAGE_CAP = 2.5


def borge_enemy(stage: int) -> dict[str, float]:
    hp = (
        (9 + (stage * 4))
        * (2.85 if stage > 100 else 1)
        * (
            1
            + ((stage // 150) * (stage - 149) * (0.006 + 0.006 * (stage - 150) // 50))
            if stage >= 150
            else 1
        )
    )
    power = (
        (2.5 + (stage * 0.7))
        * (2.85 if stage > 100 else 1)
        * (
            1 + ((stage - 149) * (0.006 + 0.006 * (stage - 150) // 50))
            if stage >= 150
            else 1
        )
    )
    regen = (
        (0.00 + ((stage - 1) * 0.08) if stage > 1 else 0)
        * (1.052 if stage > 100 else 1)
        * (
            1 + ((stage - 149) * (0.006 + 0.006 * (stage - 150) // 50))
            if stage >= 150
            else 1
        )
    )
    return {
        "hp": hp,
        "power": power,
        "regen": regen,
        "damage_reduction": 0.0,
        "evade_chance": 0.004 if stage > 100 else 0.0,
        "special_chance": min(0.0322 + (stage * 0.0004), CRIT_CHANCE_CAP),
        "special_damage": min(1.21 + (stage * 0.008025), CRIT_DAMAGE_CAP),
        "speed": 4.53 - (stage * 0.006),
    }


def ozzy_enemy(stage: int) -> dict[str, float]:
    hp = (
        (11 + (stage * 6))
        * (2.9 if stage > 100 else 1)
        * (
            1
            + ((stage // 150) * (stage - 149) * (0.006 + 0.006 * (stage - 150) // 50))
            if stage >= 150
            else 1
        )
    )
    power = (
        (1.35 + (stage * 0.75))
        * (2.7 if stage > 100 else 1)
        * (
            1 + ((stage - 149) * (0.006 + 0.006 * (stage - 150) // 50))
            if stage >= 150
            else 1
        )
    )
    regen = (
        (0.02 + ((stage - 1) * 0.1) if stage > 0 else 0)
        * (1.25 if stage > 100 else 1)
        * (
            1 + ((stage - 149) * (0.006 + 0.006 * (stage - 150) // 50))
            if stage >= 150
            else 1
        )
    )
    return {
        "hp": hp,
        "power": power,
        "regen": regen,
        "damage_reduction": 0.0,
        "evade_chance": 0.01 if stage > 100 else 0.0,
        "special_chance": min(0.0994 + (stage * 0.0006), CRIT_CHANCE_CAP),
        "special_damage": min(1.03 + (stage * 0.008), CRIT_DAMAGE_CAP),
        "speed": 3.20 - (stage * 0.004),
    }


BOSSES = [
    {
        "hunter": "Borge",
        "stage": 100,
        "name": "Boss_100",
        "hp": 36810,
        "power": 263.18,
        "regen": 15.21,
        "special_chance": 0.1122,
        "special_damage": 2.26,
        "damage_reduction": 0.05,
        "evade_chance": 0.004,
        "speed": 9.50,
        "speed2": "",
        "special": "",
        "enrage_effect": 0.0475,
        "enrage_effect2": 0,
        "notes": "primary enrage only",
    },
    {
        "hunter": "Borge",
        "stage": 200,
        "name": "Gothmorgor",
        "hp": 272250,
        "power": 1930,
        "regen": 42.19,
        "special_chance": 0.1522,
        "special_damage": 2.50,
        "damage_reduction": 0.09,
        "evade_chance": 0.004,
        "speed": 8.05,
        "speed2": 14.49,
        "special": "gothmorgor",
        "enrage_effect": 0.04,
        "enrage_effect2": 0.0725,
        "notes": "secondary attack; enrage on primary + secondary",
    },
    {
        "hunter": "Ozzy",
        "stage": 100,
        "name": "Boss_100",
        "hp": 29328,
        "power": 229.05,
        "regen": 59.52,
        "special_chance": 0.3094,
        "special_damage": 1.83,
        "damage_reduction": 0.05,
        "evade_chance": 0.01,
        "speed": 6.87,
        "speed2": "",
        "special": "",
        "enrage_effect": 0.033658536585365856,
        "enrage_effect2": 0,
        "notes": "fetch returns CHC 30.94%; combat caps CHC to 25% / CHD to 2.5",
    },
    {
        "hunter": "Ozzy",
        "stage": 200,
        "name": "Exoscarab",
        "hp": 221170,
        "power": 1610,
        "regen": 196.01,
        "special_chance": 0.25,
        "special_damage": 2.50,
        "damage_reduction": 0.09,
        "evade_chance": 0.01,
        "speed": 5.89,
        "speed2": 25.4,
        "special": "exoscarab",
        "enrage_effect": 0.029,
        "enrage_effect2": 0,
        "notes": "Harden: +5 enrage, DR=95% for 5 regen ticks, 3x regen while harden",
    },
]

ENEMY_COLS = [
    "stage",
    "hp",
    "power",
    "regen",
    "damage_reduction",
    "evade_chance",
    "special_chance",
    "special_damage",
    "speed",
    "special_chance_capped",
    "special_damage_capped",
]

MILESTONES = [
    1,
    10,
    25,
    50,
    75,
    99,
    100,
    101,
    125,
    149,
    150,
    175,
    199,
    200,
    225,
    250,
    275,
    300,
]


def _enemy_row(stage: int, stats: dict[str, float]) -> dict:
    return {
        "stage": stage,
        "hp": round(stats["hp"], 4),
        "power": round(stats["power"], 4),
        "regen": round(stats["regen"], 4),
        "damage_reduction": stats["damage_reduction"],
        "evade_chance": stats["evade_chance"],
        "special_chance": round(stats["special_chance"], 6),
        "special_damage": round(stats["special_damage"], 6),
        "speed": round(stats["speed"], 4),
        "special_chance_capped": stats["special_chance"] >= CRIT_CHANCE_CAP,
        "special_damage_capped": stats["special_damage"] >= CRIT_DAMAGE_CAP,
    }


def write_enemy_csv(path: Path, fn) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=ENEMY_COLS)
        w.writeheader()
        for stage in range(1, 301):
            w.writerow(_enemy_row(stage, fn(stage)))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    write_enemy_csv(OUT / "borge_enemies.csv", borge_enemy)
    write_enemy_csv(OUT / "ozzy_enemies.csv", ozzy_enemy)

    with (OUT / "enemies_milestones.csv").open("w", newline="", encoding="utf-8") as f:
        fields = ["hunter", *ENEMY_COLS]
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for hunter, fn in (("Borge", borge_enemy), ("Ozzy", ozzy_enemy)):
            for stage in MILESTONES:
                row = _enemy_row(stage, fn(stage))
                row["hunter"] = hunter
                w.writerow(row)

    boss_fields = [
        "hunter",
        "stage",
        "name",
        "hp",
        "power",
        "regen",
        "damage_reduction",
        "evade_chance",
        "special_chance",
        "special_damage",
        "speed",
        "speed2",
        "special",
        "enrage_effect",
        "enrage_effect2",
        "notes",
    ]
    with (OUT / "bosses.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=boss_fields)
        w.writeheader()
        for b in BOSSES:
            w.writerow(b)

    print(f"Wrote CSVs to {OUT}")


if __name__ == "__main__":
    main()
