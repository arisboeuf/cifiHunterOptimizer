"""Build configuration (web JSON compatible)."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class BuildConfig:
    hunter: str
    level: int = 0
    stats: dict[str, float] = field(default_factory=dict)
    talents: dict[str, float] = field(default_factory=dict)
    attributes: dict[str, float] = field(default_factory=dict)
    inscryptions: dict[str, float] = field(default_factory=dict)
    relics: dict[str, float] = field(default_factory=dict)
    gems: dict[str, float] = field(default_factory=dict)
    mods: dict[str, Any] = field(default_factory=dict)
    # Final fight stats (prefer WASM dump from the same build)
    combat: dict[str, float] = field(default_factory=dict)
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def hunter_id(self) -> str:
        return self.hunter.lower()


def load_build(path: str | Path) -> BuildConfig:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return build_from_dict(data)


def build_from_dict(data: dict[str, Any]) -> BuildConfig:
    meta = data.get("meta") or {}
    hunter = str(meta.get("hunter") or data.get("hunter") or "Borge")
    return BuildConfig(
        hunter=hunter,
        level=int(meta.get("level") or data.get("level") or 0),
        stats=dict(data.get("stats") or {}),
        talents=dict(data.get("talents") or {}),
        attributes=dict(data.get("attributes") or {}),
        inscryptions=dict(data.get("inscryptions") or {}),
        relics=dict(data.get("relics") or {}),
        gems=dict(data.get("gems") or {}),
        mods=dict(data.get("mods") or {}),
        combat=dict(data.get("combat") or {}),
        raw=data,
    )
