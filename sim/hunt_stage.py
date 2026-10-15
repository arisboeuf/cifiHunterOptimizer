"""HuntStage — OfflineHunt stage number + kill progress (extraction Advance).

Advance (0x1a81408):
- Progress += 1 on each kill
- If Progress > 9 → Number += 1, Progress = 0 (10 kills per normal stage)
- Else if Number % 100 == 0 → same (boss stages clear in 1 kill)
- Returns whether Number advanced
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class HuntStage:
    number: int = 1
    progress: int = 0

    def advance(self) -> bool:
        """Record one kill. Returns True if stage Number increased."""
        self.progress += 1
        if self.progress > 9 or (self.number >= 1 and self.number % 100 == 0):
            self.number += 1
            self.progress = 0
            return True
        return False
