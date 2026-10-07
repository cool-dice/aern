//! Mock perception sidecar. JSON lines on stdin/stdout. No weights, no GPU, no network.
//!
//! The observation encoder stays in TypeScript. `encode` only reports the shared layout.

mod actions;

use serde::Serialize;

pub use actions::{ACTION_IDS, OBSERVATION_BLOCKS, OBSERVATION_LENGTH};

#[derive(Serialize)]
struct Typed<'a> {
    #[serde(rename = "type")]
    kind: &'a str,
}

#[derive(Serialize)]
struct ErrorBody<'a> {
    #[serde(rename = "type")]
    kind: &'a str,
    code: &'a str,
}

#[derive(Serialize)]
struct ActionBody<'a> {
    #[serde(rename = "type")]
    kind: &'a str,
    id: &'a str,
    source: &'a str,
}

#[derive(Serialize)]
struct EncodedBlock<'a> {
    name: &'a str,
    length: usize,
    offset: usize,
}

#[derive(Serialize)]
struct EncodedBody<'a> {
    #[serde(rename = "type")]
    kind: &'a str,
    length: usize,
    source: &'a str,
    blocks: Vec<EncodedBlock<'a>>,
}

/// Mock policy. No RNG.
///
/// Empty `legal` is an error. Otherwise: `use_item` when `hp_ratio < 0.3` and that
/// id is legal, else `attack_melee` when the nearest enemy is strictly closer than 2,
/// else `step_n` when it is legal, else the first legal id.
pub fn decide(legal: &[&str], hp_ratio: f64, nearest: Option<f64>) -> Result<String, ()> {
    if legal.is_empty() {
        return Err(());
    }

    let contains = |id: &str| legal.iter().any(|action| *action == id);

    if hp_ratio < 0.3 && contains("use_item") {
        return Ok("use_item".to_string());
    }
    if nearest.is_some_and(|distance| distance < 2.0) {
        return Ok("attack_melee".to_string());
    }
    if contains("step_n") {
        return Ok("step_n".to_string());
    }
    Ok(legal[0].to_string())
}

/// One trimmed JSON value in, one JSON object out. Does not append a newline.
pub fn handle_line(line: &str) -> String {
    let value: serde_json::Value = match serde_json::from_str(line.trim()) {
        Ok(value) => value,
        Err(_) => return error("json"),
    };
    let Some(object) = value.as_object() else {
        return error("json");
    };
    let Some(kind) = object.get("type").and_then(serde_json::Value::as_str) else {
        return error("unknown");
    };

    match kind {
        "ping" => to_json(&Typed { kind: "pong" }),
        "decide" => handle_decide(object),
        "encode" => encode_stub(),
        _ => error("unknown"),
    }
}

fn handle_decide(object: &serde_json::Map<String, serde_json::Value>) -> String {
    if object
        .get("require_model")
        .and_then(serde_json::Value::as_bool)
        == Some(true)
    {
        return error("model");
    }

    let legal = match object.get("legal") {
        Some(serde_json::Value::Array(items)) => {
            let mut ids = Vec::with_capacity(items.len());
            for item in items {
                match item.as_str() {
                    Some(id) => ids.push(id),
                    None => return error("json"),
                }
            }
            ids
        }
        Some(_) => return error("json"),
        None => Vec::new(),
    };

    let hp_ratio = match object.get("hpRatio") {
        Some(serde_json::Value::Number(number)) => match number.as_f64() {
            Some(value) => value,
            None => return error("json"),
        },
        Some(_) => return error("json"),
        None => return error("json"),
    };

    let nearest = match object.get("nearestEnemy") {
        Some(serde_json::Value::Null) | None => None,
        Some(serde_json::Value::Number(number)) => match number.as_f64() {
            Some(value) => Some(value),
            None => return error("json"),
        },
        Some(_) => return error("json"),
    };

    match decide(&legal, hp_ratio, nearest) {
        Ok(id) => to_json(&ActionBody {
            kind: "action",
            id: &id,
            source: "mock",
        }),
        Err(()) => error("none"),
    }
}

/// Layout report. Does not clip, pad, or otherwise rebuild the TypeScript vector.
fn encode_stub() -> String {
    let blocks = OBSERVATION_BLOCKS
        .iter()
        .map(|block| EncodedBlock {
            name: block.name,
            length: block.length,
            offset: block.offset,
        })
        .collect();
    to_json(&EncodedBody {
        kind: "encoded",
        length: OBSERVATION_LENGTH,
        source: "stub",
        blocks,
    })
}

fn error(code: &str) -> String {
    to_json(&ErrorBody {
        kind: "error",
        code,
    })
}

fn to_json<T: Serialize>(value: &T) -> String {
    serde_json::to_string(value).expect("sidecar response")
}

#[cfg(test)]
mod tests {
    use super::{decide, handle_line, ACTION_IDS, OBSERVATION_BLOCKS, OBSERVATION_LENGTH};

    #[test]
    fn ping_returns_pong() {
        assert_eq!(handle_line(r#"{"type":"ping"}"#), r#"{"type":"pong"}"#);
        assert_eq!(
            handle_line("  \n{\"type\":\"ping\"}\n  "),
            r#"{"type":"pong"}"#
        );
    }

    #[test]
    fn broken_json_returns_json_error() {
        assert_eq!(handle_line("not-json"), r#"{"type":"error","code":"json"}"#);
        assert_eq!(handle_line(""), r#"{"type":"error","code":"json"}"#);
        assert_eq!(handle_line("{"), r#"{"type":"error","code":"json"}"#);
        assert_eq!(
            handle_line(r#"{"type":"ping"}{"type":"ping"}"#),
            r#"{"type":"error","code":"json"}"#
        );
        assert_eq!(handle_line("[]"), r#"{"type":"error","code":"json"}"#);
    }

    #[test]
    fn unknown_type_returns_unknown() {
        assert_eq!(
            handle_line(r#"{"type":"train"}"#),
            r#"{"type":"error","code":"unknown"}"#
        );
        assert_eq!(handle_line("{}"), r#"{"type":"error","code":"unknown"}"#);
    }

    #[test]
    fn decide_example_returns_step_n() {
        assert_eq!(
            handle_line(
                r#"{"type":"decide","legal":["step_n"],"hpRatio":1.0,"nearestEnemy":null}"#
            ),
            r#"{"type":"action","id":"step_n","source":"mock"}"#
        );
    }

    #[test]
    fn low_hp_and_legal_use_item_returns_use_item() {
        assert_eq!(
            decide(&["step_n", "use_item"], 0.29, Some(0.5)).as_deref(),
            Ok("use_item")
        );
        assert_eq!(
            handle_line(
                r#"{"type":"decide","legal":["attack_melee","use_item"],"hpRatio":0.1,"nearestEnemy":1}"#
            ),
            r#"{"type":"action","id":"use_item","source":"mock"}"#
        );
        assert_eq!(
            decide(&["step_n", "use_item"], 0.3, None).as_deref(),
            Ok("step_n")
        );
    }

    #[test]
    fn enemy_closer_than_two_returns_attack_melee() {
        assert_eq!(
            decide(&["step_n", "attack_melee"], 1.0, Some(1.9)).as_deref(),
            Ok("attack_melee")
        );
        assert_eq!(
            decide(&["step_n"], 1.0, Some(0.5)).as_deref(),
            Ok("attack_melee")
        );
        assert_eq!(
            decide(&["step_n", "attack_melee"], 1.0, Some(2.0)).as_deref(),
            Ok("step_n")
        );
        assert_eq!(decide(&[], 1.0, Some(0.5)), Err(()));
    }

    #[test]
    fn first_legal_when_step_n_is_absent() {
        assert_eq!(decide(&["wait", "scan"], 1.0, None).as_deref(), Ok("wait"));
    }

    #[test]
    fn empty_legal_is_none() {
        assert_eq!(decide(&[], 0.1, Some(0.0)), Err(()));
        assert_eq!(
            handle_line(r#"{"type":"decide","legal":[],"hpRatio":0.1,"nearestEnemy":0}"#),
            r#"{"type":"error","code":"none"}"#
        );
        assert_eq!(
            handle_line(r#"{"type":"decide","hpRatio":1.0,"nearestEnemy":null}"#),
            r#"{"type":"error","code":"none"}"#
        );
    }

    #[test]
    fn require_model_returns_model_error_and_defaults_to_mock() {
        assert_eq!(
            handle_line(
                r#"{"type":"decide","legal":["step_n"],"hpRatio":1.0,"nearestEnemy":null,"require_model":true}"#
            ),
            r#"{"type":"error","code":"model"}"#
        );
        assert_eq!(
            handle_line(
                r#"{"type":"decide","legal":["step_n"],"hpRatio":1.0,"nearestEnemy":null,"require_model":false}"#
            ),
            r#"{"type":"action","id":"step_n","source":"mock"}"#
        );
    }

    #[test]
    fn action_ids_length_and_anchors() {
        assert_eq!(ACTION_IDS.len(), 64);
        assert_eq!(ACTION_IDS[0], "step_n");
        assert_eq!(ACTION_IDS[16], "wait");
        assert_eq!(ACTION_IDS[ACTION_IDS.len() - 1], "scan");
        let mut seen = std::collections::BTreeSet::new();
        for id in ACTION_IDS {
            assert!(seen.insert(id), "duplicate action id {id}");
        }
    }

    #[test]
    fn decide_is_deterministic() {
        let first = decide(&["step_n", "wait"], 1.0, None);
        let second = decide(&["step_n", "wait"], 1.0, None);
        assert_eq!(first, second);
        assert_eq!(first.as_deref(), Ok("step_n"));
    }

    #[test]
    fn observation_layout_matches_domain() {
        assert_eq!(OBSERVATION_LENGTH, 896);
        let expected = [
            ("self", 64, 0),
            ("grid", 128, 64),
            ("actors", 256, 192),
            ("objects", 128, 448),
            ("events", 64, 576),
            ("quests", 64, 640),
            ("economy", 32, 704),
            ("guild", 32, 736),
            ("memory", 128, 768),
        ];
        assert_eq!(OBSERVATION_BLOCKS.len(), expected.len());
        let mut cursor = 0;
        for (block, (name, length, offset)) in OBSERVATION_BLOCKS.iter().zip(expected) {
            assert_eq!(block.name, name);
            assert_eq!(block.length, length);
            assert_eq!(block.offset, offset);
            assert_eq!(block.offset, cursor);
            cursor += block.length;
        }
        assert_eq!(cursor, OBSERVATION_LENGTH);
    }

    #[test]
    fn encode_stub_reports_layout_without_a_vector() {
        let raw = handle_line(r#"{"type":"encode","self":[2,-1]}"#);
        let value: serde_json::Value = serde_json::from_str(&raw).expect("encode json");
        assert_eq!(value["type"], "encoded");
        assert_eq!(value["length"], 896);
        assert_eq!(value["source"], "stub");
        assert!(value.get("values").is_none());
        assert_eq!(value["blocks"][0]["name"], "self");
        assert_eq!(value["blocks"][0]["offset"], 0);
        assert_eq!(value["blocks"][8]["name"], "memory");
        assert_eq!(value["blocks"][8]["offset"], 768);
    }
}
