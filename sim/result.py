"""Hunt / Monte-Carlo result types."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class HuntResult:
    hunter: str
    end_stage: int
    time_seconds: float
    enemies_killed: int
    bosses_killed: int
    loot: float
    xp: float
    revives_used: int
    died: bool
    boss_hp_percent: float | None  # remaining HP% if died on a boss stage
    stop_reason: str
    seed: int

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class MonteCarloResult:
    hunter: str
    n: int
    avg_stage: float
    min_stage: int
    max_stage: int
    avg_time_seconds: float
    avg_loot: float
    stage_counts: dict[int, int] = field(default_factory=dict)
    boss_kill_rate: dict[int, float] = field(default_factory=dict)
    mean_boss_hp_percent: dict[int, float] = field(default_factory=dict)
    runs: list[HuntResult] = field(default_factory=list)
    engine: str = "offline_hunt_port"
    parity: str = "unvalidated"

    def to_dict(self, include_runs: bool = False) -> dict[str, Any]:
        d = asdict(self)
        if not include_runs:
            d.pop("runs", None)
        # JSON keys for stages as strings for stability
        d["stage_counts"] = {str(k): v for k, v in self.stage_counts.items()}
        d["boss_kill_rate"] = {str(k): v for k, v in self.boss_kill_rate.items()}
        d["mean_boss_hp_percent"] = {str(k): v for k, v in self.mean_boss_hp_percent.items()}
        return d
