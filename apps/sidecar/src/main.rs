fn main() {
    let line = serde_json::json!({ "ready": true });
    println!("{line}");
}
