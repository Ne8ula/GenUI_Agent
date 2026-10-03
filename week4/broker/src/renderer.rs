//! Closed renderer-facing command set.
//!
//! The renderer can only name fixed enum values. Unknown operations, unknown
//! fields (e.g. a `path`, `hwnd` or `text`) and unknown enum strings are
//! rejected before reaching the broker. Consent receipts stay with the host.

use crate::ids::{SceneId, VariantId};
use crate::journal::RestoreMode;
use serde::Deserialize;

/// Mirrors `week4/schemas/stage-request.schema.json` exactly (planning.md §6.1:
/// prepare, enter, setFarField, restore). Emergency cancellation is
/// `restore` with mode `emergency`; the host maps it to the broker's cancel
/// token before restoring. `fixtures/ipc/stage-requests.json` is checked by
/// both this parser and the TypeScript schema test.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase", deny_unknown_fields)]
pub enum RendererCommand {
    Prepare {
        #[serde(rename = "sceneId")]
        scene: SceneId,
    },
    Enter {
        #[serde(rename = "variantId")]
        variant: VariantId,
    },
    SetFarField {
        #[serde(rename = "variantId")]
        variant: VariantId,
    },
    Restore {
        mode: RestoreMode,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RendererCommandRejected;

/// Parse one renderer command. The error deliberately carries no echo of the
/// input.
pub fn parse_renderer_command(json: &str) -> Result<RendererCommand, RendererCommandRejected> {
    serde_json::from_str(json).map_err(|_| RendererCommandRejected)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SHARED: &str = include_str!("../../fixtures/ipc/stage-requests.json");

    fn shared(key: &str) -> Vec<String> {
        let v: serde_json::Value = serde_json::from_str(SHARED).expect("shared fixture parses");
        v[key]
            .as_array()
            .expect("array")
            .iter()
            .map(|x| x.to_string())
            .collect()
    }

    #[test]
    fn accepts_only_closed_commands() {
        assert_eq!(
            parse_renderer_command(r#"{"op":"prepare","sceneId":"scene:paris-1980s-terrace"}"#),
            Ok(RendererCommand::Prepare {
                scene: SceneId::ParisTerrace
            })
        );
        assert_eq!(
            parse_renderer_command(r#"{"op":"setFarField","variantId":"evening-rain"}"#),
            Ok(RendererCommand::SetFarField {
                variant: VariantId::EveningRain
            })
        );
        assert_eq!(
            parse_renderer_command(r#"{"op":"restore","mode":"emergency"}"#),
            Ok(RendererCommand::Restore {
                mode: RestoreMode::Emergency
            })
        );
    }

    #[test]
    fn shared_fixture_agrees_with_the_json_schema_contract() {
        let valid = shared("valid");
        let invalid = shared("invalid");
        assert!(valid.len() >= 7 && invalid.len() >= 10);
        for ok in &valid {
            assert!(parse_renderer_command(ok).is_ok(), "{ok}");
        }
        for bad in &invalid {
            assert_eq!(
                parse_renderer_command(bad),
                Err(RendererCommandRejected),
                "{bad}"
            );
        }
        assert_eq!(
            parse_renderer_command("not json"),
            Err(RendererCommandRejected)
        );
    }
}
