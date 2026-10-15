fn main() {
    let build = r#"{"meta":{"hunter":"Borge","level":14},"stats":{"hp":50,"power":50,"regen":20,"damage_reduction":10,"evade_chance":10,"effect_chance":10,"special_chance":20,"special_damage":20,"speed":20},"talents":{},"attributes":{},"inscryptions":{},"relics":{},"gems":{},"mods":{}}"#;
    let out = cifi_sim::run_mc_from_json(build, 3, 1, 3600.0);
    println!("{out}");
}
