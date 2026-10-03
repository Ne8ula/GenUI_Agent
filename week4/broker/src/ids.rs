//! Closed, renderer-facing identifiers.
//!
//! The renderer may only name a scene and a variant from these fixed enums.
//! It never supplies handles, paths, bytes or text. The broker maps a
//! variant to a fixed approved asset id; only the OS adapter turns that asset
//! id into an opaque [`crate::adapter::WallpaperRef`].

use serde::{Deserialize, Serialize};
use std::fmt;

/// The only scene Week 4 stages.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum SceneId {
    #[serde(rename = "scene:paris-1980s-terrace")]
    ParisTerrace,
}

impl SceneId {
    /// Stable public identifier, e.g. `scene:paris-1980s-terrace`.
    pub fn as_str(self) -> &'static str {
        match self {
            SceneId::ParisTerrace => "scene:paris-1980s-terrace",
        }
    }

    fn slug(self) -> &'static str {
        match self {
            SceneId::ParisTerrace => "paris-1980s-terrace",
        }
    }
}

/// Weather/light state of the far field.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum VariantId {
    AfternoonClear,
    AfternoonRain,
    EveningClear,
    EveningRain,
}

impl VariantId {
    pub const ALL: [VariantId; 4] = [
        VariantId::AfternoonClear,
        VariantId::AfternoonRain,
        VariantId::EveningClear,
        VariantId::EveningRain,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            VariantId::AfternoonClear => "afternoon-clear",
            VariantId::AfternoonRain => "afternoon-rain",
            VariantId::EveningClear => "evening-clear",
            VariantId::EveningRain => "evening-rain",
        }
    }
}

/// An approved catalog asset id, e.g.
/// `wallpaper:paris-1980s-terrace:afternoon-clear`.
///
/// It can only be constructed from the fixed `(scene, variant)` mapping, so
/// no caller can name an arbitrary asset.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct AssetId(String);

impl AssetId {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for AssetId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// Fixed approved mapping from a variant to its far-field wallpaper asset.
pub fn approved_wallpaper_asset(scene: SceneId, variant: VariantId) -> AssetId {
    AssetId(format!("wallpaper:{}:{}", scene.slug(), variant.as_str()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scene_and_variant_serialize_to_fixed_ids() {
        assert_eq!(
            serde_json::to_string(&SceneId::ParisTerrace).unwrap(),
            "\"scene:paris-1980s-terrace\""
        );
        for v in VariantId::ALL {
            assert_eq!(
                serde_json::to_string(&v).unwrap(),
                format!("\"{}\"", v.as_str())
            );
        }
        assert!(serde_json::from_str::<VariantId>("\"tokyo-night\"").is_err());
        assert!(serde_json::from_str::<SceneId>("\"scene:tokyo\"").is_err());
    }

    #[test]
    fn asset_mapping_is_fixed() {
        assert_eq!(
            approved_wallpaper_asset(SceneId::ParisTerrace, VariantId::AfternoonClear).as_str(),
            "wallpaper:paris-1980s-terrace:afternoon-clear"
        );
        assert_eq!(
            approved_wallpaper_asset(SceneId::ParisTerrace, VariantId::EveningRain).as_str(),
            "wallpaper:paris-1980s-terrace:evening-rain"
        );
    }
}
