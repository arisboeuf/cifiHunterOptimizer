//! Cifi.OfflineHunt.UpgradesHelper — closed-form helpers from extraction asm.

pub fn hunter_upgrade(level: f64, a: f64, step: f64, b: f64) -> f64 {
    if level <= 0.0 {
        return 0.0;
    }
    level * (a + (level / step).floor() * b)
}

pub fn additive(level: f64, k: f64) -> f64 {
    level * k
}

pub fn multiplicative(base: f64, level: f64) -> f64 {
    base.powf(level)
}

pub fn gadget_corrected(level: f64, base: f64, interval: f64, base2: f64) -> f64 {
    if level < 1.0 {
        return 1.0;
    }
    base.powf(level) * base2.powf((level / interval).floor())
}

pub fn gem_upgrade(level: f64, base: f64, quality: f64) -> f64 {
    if level < 1.0 {
        return 1.0;
    }
    base.powf(level).powf(1.0 + 0.1 * quality - 0.1)
}

pub fn diamond_ultima(level: f64, k: f64, base: f64, all_ultimas: f64) -> f64 {
    1.0 + k * level * base.powf((all_ultimas / 50.0).floor())
}

pub fn flag_mul(flag: bool, factor: f64) -> f64 {
    if flag { factor } else { 1.0 }
}
