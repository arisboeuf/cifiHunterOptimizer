//! HuntTime — continuous simulation clock with second-aligned regen.

pub struct HuntTime {
    pub now: f64,
}

impl HuntTime {
    pub fn new(now: f64) -> Self {
        Self { now }
    }

    /// Absolute time of an event dt seconds from now.
    pub fn in_at(&self, dt: f64) -> f64 {
        self.now + dt
    }

    /// Next integer second boundary strictly after now (regen ticks).
    pub fn next_second(&self) -> f64 {
        self.now.floor() + 1.0
    }

    pub fn advance(&mut self, t: f64) {
        self.now = t;
    }
}
