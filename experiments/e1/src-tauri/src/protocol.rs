use serde::{Deserialize, Serialize};
use std::collections::HashSet;

pub const INTERACTIVE_LABEL: &str = "main";
pub const MATERIAL_LABEL: &str = "material";
pub const HIT_REGION_LIMIT: usize = 64;
pub const MAX_RENDER_POINTS: u32 = 8_000;
pub const MAX_BENCHMARK_DURATION_MS: u32 = 60_000;
pub const MAX_BENCHMARK_SAMPLES: usize = 18_000;
const MAX_CSS_EXTENT: f64 = 32_768.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SenderRole {
    Interactive,
    Material,
}

pub fn authorize_sender(actual: &str, required: SenderRole) -> Result<(), String> {
    let expected = match required {
        SenderRole::Interactive => INTERACTIVE_LABEL,
        SenderRole::Material => MATERIAL_LABEL,
    };
    if actual == expected {
        Ok(())
    } else {
        Err(format!(
            "native command is not authorized for window label {actual:?}"
        ))
    }
}

fn finite_between(value: f64, min: f64, max: f64) -> bool {
    value.is_finite() && value >= min && value <= max
}

fn valid_identifier(value: &str, max_len: usize) -> bool {
    !value.is_empty()
        && value.len() <= max_len
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b':' | b'-' | b'_' | b'.'))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CssViewport {
    pub width_css_px: f64,
    pub height_css_px: f64,
    pub device_pixel_ratio: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CssHitRegion {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HitRegionUpdate {
    pub schema_version: String,
    pub sequence: u64,
    pub viewport: CssViewport,
    pub regions: Vec<CssHitRegion>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct NativeGeometry {
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PhysicalHitRect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScaledHitRegions {
    pub rects: Vec<PhysicalHitRect>,
    pub clamped_count: usize,
}

pub fn validate_and_scale_hit_regions(
    update: &HitRegionUpdate,
    native: NativeGeometry,
) -> Result<ScaledHitRegions, String> {
    if update.schema_version != "e1.hit-regions/1" {
        return Err("unsupported hit-region schema version".into());
    }
    if update.sequence == 0 {
        return Err("hit-region sequence must be positive".into());
    }
    if update.regions.len() > HIT_REGION_LIMIT {
        return Err(format!(
            "hit-region count exceeds the {HIT_REGION_LIMIT} rectangle limit"
        ));
    }
    if native.width == 0
        || native.height == 0
        || native.width > i32::MAX as u32
        || native.height > i32::MAX as u32
        || !finite_between(native.scale_factor, 0.5, 8.0)
    {
        return Err("native window geometry is invalid".into());
    }
    if !finite_between(update.viewport.width_css_px, 1.0, MAX_CSS_EXTENT)
        || !finite_between(update.viewport.height_css_px, 1.0, MAX_CSS_EXTENT)
        || !finite_between(update.viewport.device_pixel_ratio, 0.5, 8.0)
    {
        return Err("CSS viewport or device pixel ratio is invalid".into());
    }
    if (update.viewport.device_pixel_ratio - native.scale_factor).abs() > 0.25 {
        return Err("CSS device pixel ratio does not match the native window scale".into());
    }

    let native_css_width = f64::from(native.width) / native.scale_factor;
    let native_css_height = f64::from(native.height) / native.scale_factor;
    if (update.viewport.width_css_px - native_css_width).abs() > 4.0
        || (update.viewport.height_css_px - native_css_height).abs() > 4.0
    {
        return Err("CSS viewport does not match the native client area".into());
    }

    let css_width = update.viewport.width_css_px.min(native_css_width);
    let css_height = update.viewport.height_css_px.min(native_css_height);
    let mut seen = HashSet::with_capacity(update.regions.len());
    let mut rects = Vec::with_capacity(update.regions.len());
    let mut clamped_count = 0;

    for region in &update.regions {
        if !valid_identifier(&region.id, 64) || !seen.insert(region.id.as_str()) {
            return Err("hit-region IDs must be unique bounded authored identifiers".into());
        }
        if !finite_between(region.x, -MAX_CSS_EXTENT, MAX_CSS_EXTENT)
            || !finite_between(region.y, -MAX_CSS_EXTENT, MAX_CSS_EXTENT)
            || !finite_between(region.width, f64::EPSILON, MAX_CSS_EXTENT)
            || !finite_between(region.height, f64::EPSILON, MAX_CSS_EXTENT)
        {
            return Err(format!("hit region {:?} has invalid geometry", region.id));
        }

        let raw_right = region.x + region.width;
        let raw_bottom = region.y + region.height;
        if !raw_right.is_finite() || !raw_bottom.is_finite() {
            return Err(format!("hit region {:?} overflows", region.id));
        }
        let left_css = region.x.clamp(0.0, css_width);
        let top_css = region.y.clamp(0.0, css_height);
        let right_css = raw_right.clamp(0.0, css_width);
        let bottom_css = raw_bottom.clamp(0.0, css_height);
        let was_clamped = left_css != region.x
            || top_css != region.y
            || right_css != raw_right
            || bottom_css != raw_bottom;

        if right_css <= left_css || bottom_css <= top_css {
            clamped_count += 1;
            continue;
        }
        if was_clamped {
            clamped_count += 1;
        }

        let left = (left_css * native.scale_factor).floor() as i32;
        let top = (top_css * native.scale_factor).floor() as i32;
        let right = (right_css * native.scale_factor).ceil() as i32;
        let bottom = (bottom_css * native.scale_factor).ceil() as i32;
        rects.push(PhysicalHitRect {
            left: left.clamp(0, native.width as i32),
            top: top.clamp(0, native.height as i32),
            right: right.clamp(0, native.width as i32),
            bottom: bottom.clamp(0, native.height as i32),
        });
    }

    Ok(ScaledHitRegions {
        rects,
        clamped_count,
    })
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq, Hash)]
pub enum WeatherTimeId {
    #[serde(rename = "09:00")]
    Nine,
    #[serde(rename = "12:00")]
    Noon,
    #[serde(rename = "15:00")]
    Fifteen,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RequestStatus {
    Idle,
    Ready,
    Unavailable,
    Dismissed,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RecipeId {
    PartAndRelate,
    WithdrawAndReanchor,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum TransitionStatus {
    Idle,
    Active,
    Settled,
    Interrupted,
    Dismissed,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
pub enum RendererKind {
    #[serde(rename = "canvas2d")]
    Canvas2d,
    #[serde(rename = "webgl")]
    Webgl,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SimulatedFailure {
    CanvasError,
    WebglContextLost,
    WebglUnavailable,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MaterialAnchor {
    pub id: WeatherTimeId,
    pub x: f64,
    pub y: f64,
    pub pinned: bool,
    pub user_moved: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MaterialWeatherRecord {
    pub id: WeatherTimeId,
    pub temperature_c: f64,
    pub cloud_cover_percent: Option<f64>,
    pub precipitation_probability_percent: f64,
    pub wind_kmh: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MaterialComparison {
    pub first: WeatherTimeId,
    pub second: WeatherTimeId,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MaterialTransition {
    pub id: String,
    pub status: TransitionStatus,
    pub duration_ms: u32,
    pub from_revision: u64,
    pub to_revision: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MaterialBenchmarkRequest {
    pub run_id: Option<String>,
    pub active: bool,
    pub duration_ms: Option<u32>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MaterialRendererRequest {
    pub kind: RendererKind,
    pub requested_point_count: u32,
    pub simulated_failure: Option<SimulatedFailure>,
    pub benchmark: MaterialBenchmarkRequest,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MaterialSceneInput {
    pub schema_version: String,
    pub scene_sequence: u64,
    pub response_id: String,
    pub revision: u64,
    pub generation: u64,
    pub fixture_id: Option<String>,
    pub seed: Option<String>,
    pub status: RequestStatus,
    pub selected: WeatherTimeId,
    pub comparison: Option<MaterialComparison>,
    pub anchors: Vec<MaterialAnchor>,
    pub records: Vec<MaterialWeatherRecord>,
    pub recipe: RecipeId,
    pub reduced_motion: bool,
    pub plain: bool,
    pub transition: MaterialTransition,
    pub renderer: MaterialRendererRequest,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialScene {
    pub controller_session_id: String,
    #[serde(flatten)]
    pub input: MaterialSceneInput,
}

fn exactly_authored_times<T, F>(values: &[T], id: F) -> bool
where
    F: Fn(&T) -> WeatherTimeId,
{
    if values.len() != 3 {
        return false;
    }
    let ids: HashSet<_> = values.iter().map(id).collect();
    ids.len() == 3
        && ids.contains(&WeatherTimeId::Nine)
        && ids.contains(&WeatherTimeId::Noon)
        && ids.contains(&WeatherTimeId::Fifteen)
}

pub fn validate_material_scene(scene: &MaterialSceneInput) -> Result<(), String> {
    if scene.schema_version != "e1.material-scene/1" || scene.response_id != "response:e1-weather" {
        return Err("unsupported material scene identity".into());
    }
    if scene.scene_sequence == 0 || scene.revision > 1_000_000 || scene.generation > 1_000_000 {
        return Err("material scene sequence or revision is outside bounds".into());
    }
    if !exactly_authored_times(&scene.anchors, |anchor| anchor.id)
        || scene.anchors.iter().any(|anchor| {
            !finite_between(anchor.x, 0.0, 1.0) || !finite_between(anchor.y, 0.0, 1.0)
        })
    {
        return Err("material scene must contain the three bounded authored anchors".into());
    }
    if let Some(comparison) = &scene.comparison {
        if comparison.first == comparison.second {
            return Err("material comparison endpoints must differ".into());
        }
    }

    match (&scene.fixture_id, &scene.seed) {
        (None, None) if scene.records.is_empty() => {}
        (Some(fixture_id), Some(seed))
            if fixture_id == "W-NYC-01"
                && seed == "W-NYC-01-r1-seed-20261014"
                && exactly_authored_times(&scene.records, |record| record.id) =>
        {
            for record in &scene.records {
                if !finite_between(record.temperature_c, -100.0, 100.0)
                    || record
                        .cloud_cover_percent
                        .is_some_and(|value| !finite_between(value, 0.0, 100.0))
                    || !finite_between(record.precipitation_probability_percent, 0.0, 100.0)
                    || !finite_between(record.wind_kmh, 0.0, 500.0)
                {
                    return Err("material weather record is outside authored bounds".into());
                }
            }
        }
        _ => return Err("material fixture identity and records are inconsistent".into()),
    }
    if scene.status == RequestStatus::Ready && scene.fixture_id.is_none() {
        return Err("ready material scene requires the synthetic fixture".into());
    }
    if scene.status == RequestStatus::Dismissed && scene.fixture_id.is_some() {
        return Err("dismissed material scene cannot retain fixture material".into());
    }
    if !valid_identifier(&scene.transition.id, 96)
        || scene.transition.duration_ms > 1_200
        || scene.transition.from_revision > scene.transition.to_revision
        || scene.transition.to_revision != scene.revision
    {
        return Err("material transition is outside authored bounds".into());
    }
    if !(1..=MAX_RENDER_POINTS).contains(&scene.renderer.requested_point_count) {
        return Err("material point count is outside the native limit".into());
    }
    let benchmark = &scene.renderer.benchmark;
    if benchmark
        .run_id
        .as_deref()
        .is_some_and(|run_id| !valid_identifier(run_id, 96))
        || benchmark
            .duration_ms
            .is_some_and(|duration| duration == 0 || duration > MAX_BENCHMARK_DURATION_MS)
        || (benchmark.active && (benchmark.run_id.is_none() || benchmark.duration_ms.is_none()))
    {
        return Err("material benchmark request is invalid".into());
    }
    Ok(())
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MaterialBenchmarkStats {
    pub run_id: Option<String>,
    pub running: bool,
    pub samples_ms: Vec<f64>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MaterialRendererStats {
    pub renderer: RendererKind,
    pub draw_count: u64,
    pub point_count: u32,
    pub requested_point_count: u32,
    pub last_frame_ms: f64,
    pub frames_rendered: u64,
    pub settled: bool,
    pub context_lost: bool,
    pub forced_continuous: bool,
    pub benchmark: MaterialBenchmarkStats,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum MaterialFailureCode {
    CanvasUnavailable,
    WebglUnavailable,
    ContextLost,
    RenderError,
    BenchmarkError,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MaterialDiagnostic {
    pub code: MaterialFailureCode,
    pub message: String,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum MaterialStatusKind {
    SceneApplied,
    Stats,
    TransitionComplete,
    RendererFailure,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MaterialStatus {
    pub schema_version: String,
    pub controller_session_id: String,
    pub scene_sequence: u64,
    pub response_id: String,
    pub revision: u64,
    pub transition_id: String,
    pub monotonic_ms: f64,
    pub stats: MaterialRendererStats,
    pub kind: MaterialStatusKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diagnostic: Option<MaterialDiagnostic>,
}

pub fn validate_material_status(
    status: &MaterialStatus,
    latest: &MaterialScene,
) -> Result<(), String> {
    if status.schema_version != "e1.material-status/1"
        || status.controller_session_id != latest.controller_session_id
        || status.scene_sequence != latest.input.scene_sequence
        || status.response_id != latest.input.response_id
        || status.revision != latest.input.revision
        || status.transition_id != latest.input.transition.id
    {
        return Err("material status does not match the latest accepted scene".into());
    }
    if !finite_between(status.monotonic_ms, 0.0, 1.0e15)
        || !finite_between(status.stats.last_frame_ms, 0.0, 10_000.0)
        || status.stats.point_count > MAX_RENDER_POINTS
        || status.stats.requested_point_count != latest.input.renderer.requested_point_count
        || status.stats.benchmark.samples_ms.len() > MAX_BENCHMARK_SAMPLES
        || status
            .stats
            .benchmark
            .samples_ms
            .iter()
            .any(|sample| !finite_between(*sample, 0.0, 10_000.0))
    {
        return Err("material renderer statistics are outside native bounds".into());
    }
    if status
        .stats
        .benchmark
        .run_id
        .as_deref()
        .is_some_and(|run_id| !valid_identifier(run_id, 96))
        || (!status.stats.benchmark.samples_ms.is_empty()
            && status.stats.benchmark.run_id != latest.input.renderer.benchmark.run_id)
    {
        return Err("material benchmark statistics do not match the active request".into());
    }

    match (&status.kind, &status.diagnostic) {
        (MaterialStatusKind::RendererFailure, Some(diagnostic)) => {
            if diagnostic.message.is_empty()
                || diagnostic.message.len() > 240
                || diagnostic
                    .message
                    .chars()
                    .any(|character| character.is_control())
            {
                return Err("material failure diagnostic is not bounded plain text".into());
            }
        }
        (MaterialStatusKind::RendererFailure, None) => {
            return Err("renderer failure requires a bounded diagnostic".into())
        }
        (_, Some(_)) => return Err("diagnostics are only valid for renderer failures".into()),
        (_, None) => {}
    }
    if status.kind == MaterialStatusKind::TransitionComplete
        && (!status.stats.settled || status.stats.context_lost)
    {
        return Err("transition completion requires a settled live renderer".into());
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Point2D {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Size2D<T> {
    pub width: T,
    pub height: T,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkAreaMetadata {
    pub schema_version: &'static str,
    pub platform: &'static str,
    pub interactive_window_label: &'static str,
    pub material_window_label: &'static str,
    pub origin_physical_px: Point2D,
    pub size_physical_px: Size2D<u32>,
    pub size_css_px: Size2D<f64>,
    pub scale_factor: f64,
    pub region_limit: usize,
    pub native_region_enabled: bool,
    pub controller_session_id: String,
    pub next_hit_region_sequence: u64,
    pub next_material_scene_sequence: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HitRegionAck {
    pub schema_version: &'static str,
    pub sequence: u64,
    pub mode: &'static str,
    pub applied_region_count: usize,
    pub clamped_region_count: usize,
    pub input_pass_through: bool,
    pub native_scale_factor: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialSceneAck {
    pub schema_version: &'static str,
    pub controller_session_id: String,
    pub scene_sequence: u64,
    pub delivered: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialStatusAck {
    pub schema_version: &'static str,
    pub controller_session_id: String,
    pub scene_sequence: u64,
    pub delivered: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DismissAck {
    pub schema_version: &'static str,
    pub dismissed: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn update(regions: Vec<CssHitRegion>) -> HitRegionUpdate {
        HitRegionUpdate {
            schema_version: "e1.hit-regions/1".into(),
            sequence: 1,
            viewport: CssViewport {
                width_css_px: 800.0,
                height_css_px: 600.0,
                device_pixel_ratio: 1.5,
            },
            regions,
        }
    }

    fn region(id: &str, x: f64, y: f64, width: f64, height: f64) -> CssHitRegion {
        CssHitRegion {
            id: id.into(),
            x,
            y,
            width,
            height,
        }
    }

    #[test]
    fn sender_authorization_is_exact_and_role_bound() {
        assert!(authorize_sender("main", SenderRole::Interactive).is_ok());
        assert!(authorize_sender("material", SenderRole::Material).is_ok());
        assert!(authorize_sender("material", SenderRole::Interactive).is_err());
        assert!(authorize_sender("main", SenderRole::Material).is_err());
        assert!(authorize_sender("main ", SenderRole::Interactive).is_err());
    }

    #[test]
    fn css_regions_scale_and_clamp_to_native_client_area() {
        let scaled = validate_and_scale_hit_regions(
            &update(vec![
                region("anchor:one", 10.25, 20.5, 100.0, 40.0),
                region("edge", 790.0, 590.0, 40.0, 30.0),
            ]),
            NativeGeometry {
                width: 1_200,
                height: 900,
                scale_factor: 1.5,
            },
        )
        .expect("bounded geometry should validate");

        assert_eq!(
            scaled.rects,
            vec![
                PhysicalHitRect {
                    left: 15,
                    top: 30,
                    right: 166,
                    bottom: 91,
                },
                PhysicalHitRect {
                    left: 1_185,
                    top: 885,
                    right: 1_200,
                    bottom: 900,
                },
            ]
        );
        assert_eq!(scaled.clamped_count, 1);
    }

    #[test]
    fn invalid_or_stale_geometry_is_rejected_before_native_region_use() {
        let mut invalid = update(vec![region("duplicate", 0.0, 0.0, 20.0, 20.0)]);
        invalid
            .regions
            .push(region("duplicate", 30.0, 30.0, 20.0, 20.0));
        let geometry = NativeGeometry {
            width: 1_200,
            height: 900,
            scale_factor: 1.5,
        };
        assert!(validate_and_scale_hit_regions(&invalid, geometry).is_err());

        let mut stale_viewport = update(vec![]);
        stale_viewport.viewport.width_css_px = 700.0;
        assert!(validate_and_scale_hit_regions(&stale_viewport, geometry).is_err());
    }

    #[test]
    fn empty_region_is_a_valid_input_open_state() {
        let scaled = validate_and_scale_hit_regions(
            &update(vec![]),
            NativeGeometry {
                width: 1_200,
                height: 900,
                scale_factor: 1.5,
            },
        )
        .expect("empty region must remain valid");
        assert!(scaled.rects.is_empty());
        assert_eq!(scaled.clamped_count, 0);
    }

    #[test]
    fn benchmark_bounds_hold_a_sixty_second_high_refresh_run() {
        assert!(MAX_BENCHMARK_SAMPLES >= 18_000);
        assert_eq!(MAX_BENCHMARK_DURATION_MS, 60_000);
    }
}
