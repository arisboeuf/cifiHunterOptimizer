//! UnitActions — pending action schedule (hot path for the event loop).

use std::cmp::Ordering;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[repr(u8)]
pub enum ActionKind {
    HunterAttack = 1,
    EnemyAttack = 2,
    EnemySecondary = 3,
    RegenTick = 4,
    BossSkill = 5,
    Harden = 6,
    Multistrike = 7,
    Echo = 8,
}

impl ActionKind {
    fn from_u8(v: u8) -> Option<Self> {
        match v {
            1 => Some(ActionKind::HunterAttack),
            2 => Some(ActionKind::EnemyAttack),
            3 => Some(ActionKind::EnemySecondary),
            4 => Some(ActionKind::RegenTick),
            5 => Some(ActionKind::BossSkill),
            6 => Some(ActionKind::Harden),
            7 => Some(ActionKind::Multistrike),
            8 => Some(ActionKind::Echo),
            _ => None,
        }
    }
}

#[derive(Clone, Debug)]
pub struct ScheduledAction {
    pub time: f64,
    pub kind: ActionKind,
    pub tag: String,
}

pub struct UnitActions {
    times: Vec<(u8, String, f64)>,
}

impl UnitActions {
    pub fn new() -> Self {
        Self { times: Vec::new() }
    }

    pub fn set(&mut self, kind: ActionKind, time: f64, tag: &str) {
        let key_kind = kind as u8;
        if let Some(entry) = self
            .times
            .iter_mut()
            .find(|(k, t, _)| *k == key_kind && t == tag)
        {
            entry.2 = time;
        } else {
            self.times.push((key_kind, tag.to_string(), time));
        }
    }

    pub fn unset(&mut self, kind: ActionKind, tag: &str) {
        let key_kind = kind as u8;
        self.times
            .retain(|(k, t, _)| !(*k == key_kind && t == tag));
    }

    pub fn clear_kinds(&mut self, kinds: &[ActionKind]) {
        let drop: std::collections::HashSet<u8> = kinds.iter().map(|k| *k as u8).collect();
        self.times.retain(|(k, _, _)| !drop.contains(k));
    }

    pub fn delay(&mut self, kind: ActionKind, delta: f64, tag: &str) {
        let key_kind = kind as u8;
        if let Some(entry) = self
            .times
            .iter_mut()
            .find(|(k, t, _)| *k == key_kind && t == tag)
        {
            entry.2 += delta;
        }
    }

    pub fn find_next(&self) -> Option<ScheduledAction> {
        let mut best: Option<(u8, String, f64)> = None;
        for (k, tag, t) in &self.times {
            let better = match &best {
                None => true,
                Some((bk, bt, bt_t)) => {
                    t.partial_cmp(bt_t).unwrap_or(Ordering::Equal) == Ordering::Less
                        || (t == bt_t
                            && (*k < *bk
                                || (*k == *bk && tag.as_str() < bt.as_str())))
                }
            };
            if better {
                best = Some((*k, tag.clone(), *t));
            }
        }
        best.and_then(|(k, tag, time)| {
            ActionKind::from_u8(k).map(|kind| ScheduledAction { time, kind, tag })
        })
    }

    pub fn pop_next(&mut self) -> Option<ScheduledAction> {
        let nxt = self.find_next()?;
        let kind = nxt.kind;
        let tag = nxt.tag.clone();
        self.unset(kind, &tag);
        Some(nxt)
    }

    pub fn remaining(&self, kind: ActionKind, now: f64, tag: &str) -> Option<f64> {
        let key_kind = kind as u8;
        self.times
            .iter()
            .find(|(k, t, _)| *k == key_kind && t == tag)
            .map(|(_, _, t)| (t - now).max(0.0))
    }

    pub fn earliest_time(&self) -> Option<f64> {
        self.times.iter().map(|(_, _, t)| *t).reduce(f64::min)
    }
}

impl Default for UnitActions {
    fn default() -> Self {
        Self::new()
    }
}
