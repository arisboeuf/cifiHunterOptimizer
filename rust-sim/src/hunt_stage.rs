//! HuntStage — OfflineHunt stage number + kill progress (extraction Advance).

#[derive(Clone, Debug)]
pub struct HuntStage {
    pub number: i32,
    pub progress: i32,
}

impl HuntStage {
    pub fn new(number: i32, progress: i32) -> Self {
        Self { number, progress }
    }

    /// Record one kill. Returns true if stage Number increased.
    pub fn advance(&mut self) -> bool {
        self.progress += 1;
        if self.progress > 9 || (self.number >= 1 && self.number % 100 == 0) {
            self.number += 1;
            self.progress = 0;
            return true;
        }
        false
    }
}
