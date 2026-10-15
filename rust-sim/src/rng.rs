//! HuntRoll — Xoshiro256** port from extraction combat_primitives.

const MASK: u64 = u64::MAX;

fn rotl64(x: u64, k: u32) -> u64 {
    x.rotate_left(k)
}

#[derive(Clone, Debug)]
pub struct HuntRoll {
    state: [u64; 4],
}

impl HuntRoll {
    pub fn new(state: [u64; 4]) -> Result<Self, String> {
        if !state.iter().any(|&x| x != 0) {
            return Err("four nonzero-in-total uint64 state words required".into());
        }
        Ok(Self { state })
    }

    pub fn next_uint64(&mut self) -> u64 {
        let [mut a, mut b, mut c, mut d] = self.state;
        let result = rotl64(b.wrapping_mul(5), 7).wrapping_mul(9);
        let t = b << 17;
        c ^= a;
        d ^= b;
        b ^= c;
        a ^= d;
        c ^= t;
        d = rotl64(d, 45);
        self.state = [a, b, c, d];
        result
    }

    pub fn succeeds(&mut self, p: f64) -> bool {
        if p <= 0.0 {
            return false;
        }
        if p >= 1.0 {
            return true;
        }
        (self.next_uint64() >> 11) as f64 * 1.1102230246251565e-16 < p
    }
}

pub fn seed_state(seed: u64) -> [u64; 4] {
    let mut s = seed;
    let mut out = [0u64; 4];
    for word in &mut out {
        s = s.wrapping_add(0x9E3779B97F4A7C15);
        let mut z = s;
        z ^= z >> 30;
        z = z.wrapping_mul(0xBF58476D1CE4E5B9);
        z ^= z >> 27;
        z = z.wrapping_mul(0x94D049BB133111EB);
        z ^= z >> 31;
        *word = z;
    }
    if !out.iter().any(|&x| x != 0) {
        out[0] = 1;
    }
    out
}

pub fn boss_attack_interval(base_interval: f64, enrage_stack: i32) -> f64 {
    (base_interval * (1.0 - enrage_stack as f64 / 200.0)).max(0.5)
}
