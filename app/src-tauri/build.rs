fn main() {
    println!("cargo:rerun-if-env-changed=MULTIAGENT_BUILD_VARIANT");
    println!("cargo:rustc-check-cfg=cfg(multiagent_company)");
    if std::env::var("MULTIAGENT_BUILD_VARIANT")
        .map(|value| value.eq_ignore_ascii_case("company"))
        .unwrap_or(false)
    {
        println!("cargo:rustc-cfg=multiagent_company");
    }
    tauri_build::build()
}
