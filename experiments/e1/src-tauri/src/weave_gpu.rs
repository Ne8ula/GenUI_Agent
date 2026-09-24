//! QUARANTINED: owner reported system-wide graphics failure during a transition.
//! This rejected frame-playback experiment must not be relaunched for diagnosis.
//! Source-derived Weave textures and the original eye rendered by Rust/wgpu.
//! The material WebView is hidden; it never receives authority or renders this layer.
use crate::protocol::{
    MaterialBenchmarkStats, MaterialDiagnostic, MaterialFailureCode, MaterialRendererStats,
    MaterialScene, MaterialStatus, MaterialStatusKind, RendererKind, RequestStatus,
    TransitionStatus, WeatherTimeId,
};
use bytemuck::{Pod, Zeroable};
use raw_window_handle::{
    RawDisplayHandle, RawWindowHandle, Win32WindowHandle, WindowsDisplayHandle,
};
use std::{
    num::NonZeroIsize,
    path::{Path, PathBuf},
    sync::{mpsc, Mutex},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};
use wgpu::util::DeviceExt;
use windows::Win32::{
    Foundation::{HWND, POINT, RECT},
    UI::WindowsAndMessaging::{GetClientRect, GetCursorPos, GetWindowRect},
};

#[cfg(test)]
const FRAME_PERIOD: Duration = Duration::from_micros(41_667);
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Goal {
    Eye,
    Sun,
    Rain,
    Hidden,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Clip {
    Reveal,
    Revise,
    Dismiss,
}
pub(crate) fn texture_scale(clip: Clip, index: usize) -> f32 {
    let smooth = |t: f32| t * t * (3. - 2. * t);
    match clip {
        Clip::Reveal => 0.6 + 0.4 * smooth(index.min(88) as f32 / 88.),
        Clip::Dismiss => 1. - 0.4 * smooth(index.saturating_sub(72).min(72) as f32 / 72.),
        Clip::Revise => 1.,
    }
}

impl Clip {
    fn directory(self) -> &'static str {
        match self {
            Self::Reveal => "v1",
            Self::Revise => "v2",
            Self::Dismiss => "v3",
        }
    }
    fn frames(self) -> usize {
        if self == Self::Dismiss {
            241
        } else {
            145
        }
    }
    fn frame_at(self, elapsed: Duration) -> Option<usize> {
        let frame = (elapsed.as_secs_f64() * 24.).floor() as usize;
        (frame < self.frames()).then_some(frame)
    }
    fn aspect(self) -> f32 {
        if self == Self::Reveal {
            1278. / 720.
        } else {
            1284. / 718.
        }
    }
}
#[derive(Clone)]
enum Command {
    Scene(Box<MaterialScene>),
    Clear,
    Stop,
}
#[derive(Default)]
pub struct GpuState {
    sender: Mutex<Option<mpsc::Sender<Command>>>,
}
impl GpuState {
    pub fn publish(&self, scene: MaterialScene) -> Result<(), String> {
        self.sender
            .lock()
            .map_err(|_| "GPU state unavailable")?
            .as_ref()
            .ok_or("GPU renderer unavailable")?
            .send(Command::Scene(Box::new(scene)))
            .map_err(|_| "GPU renderer stopped".into())
    }
    pub fn clear(&self) {
        if let Ok(sender) = self.sender.lock() {
            if let Some(sender) = sender.as_ref() {
                let _ = sender.send(Command::Clear);
            }
        }
    }
    pub fn stop(&self) {
        if let Ok(sender) = self.sender.lock() {
            if let Some(sender) = sender.as_ref() {
                let _ = sender.send(Command::Stop);
            }
        }
    }
}

pub fn start(app: &AppHandle, hwnd: HWND, width: u32, height: u32) -> Result<(), String> {
    let root = app
        .path()
        .resolve("weave-derived", tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    // A source checkout uses its reviewed public catalog; packaged builds use resource mapping.
    let root = if root.join("manifest.json").is_file() {
        root
    } else {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../public/weave-derived")
    };
    let (tx, rx) = mpsc::channel();
    *app.state::<GpuState>()
        .sender
        .lock()
        .map_err(|_| "GPU state unavailable")? = Some(tx);
    let app = app.clone();
    let window = hwnd.0 as isize;
    thread::Builder::new().name("e1-weave-gpu".into()).spawn(move||{
        match pollster::block_on(Renderer::new(window,width,height)) {
            Ok(renderer)=>run(app,window,root,rx,renderer),
            Err(_)=>while let Ok(command)=rx.recv(){match command{
                Command::Scene(scene)=>report(&app,&scene,MaterialStatusKind::RendererFailure,0,0.,true,Some("Native GPU could not initialize. Facts and controls remain available.")),
                Command::Stop=>break,Command::Clear=>{}
            }}
        }
    }).map_err(|e|e.to_string())?;
    Ok(())
}

fn goal(scene: &MaterialScene) -> Goal {
    if scene.input.status == RequestStatus::Ready && scene.input.plain {
        return Goal::Hidden;
    }
    match scene
        .input
        .forecast
        .as_ref()
        .filter(|_| scene.input.status == RequestStatus::Ready)
        .map(|f| f.condition.as_str())
    {
        Some("sunny") => Goal::Sun,
        Some("rainy") => Goal::Rain,
        _ => Goal::Eye,
    }
}
fn clip_for(from: Goal, to: Goal) -> Option<Clip> {
    match (from, to) {
        (Goal::Eye, Goal::Sun) => Some(Clip::Reveal),
        (_, Goal::Rain) => Some(Clip::Revise),
        (Goal::Sun | Goal::Rain, Goal::Eye) => Some(Clip::Dismiss),
        _ => None,
    }
}
fn report(
    app: &AppHandle,
    scene: &MaterialScene,
    kind: MaterialStatusKind,
    draws: u64,
    frame_ms: f64,
    settled: bool,
    error: Option<&str>,
) {
    let status = MaterialStatus {
        schema_version: "e1.material-status/1".into(),
        controller_session_id: scene.controller_session_id.clone(),
        scene_sequence: scene.input.scene_sequence,
        response_id: scene.input.response_id.clone(),
        revision: scene.input.revision,
        transition_id: scene.input.transition.id.clone(),
        monotonic_ms: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs_f64()
            * 1000.,
        kind,
        diagnostic: error.map(|message| MaterialDiagnostic {
            code: MaterialFailureCode::RenderError,
            message: message.into(),
        }),
        stats: MaterialRendererStats {
            renderer: RendererKind::Wgpu,
            draw_count: draws,
            point_count: 0,
            requested_point_count: scene.input.renderer.requested_point_count,
            last_frame_ms: frame_ms,
            frames_rendered: draws,
            settled,
            context_lost: error.is_some(),
            forced_continuous: false,
            benchmark: MaterialBenchmarkStats {
                run_id: None,
                running: false,
                samples_ms: Vec::new(),
            },
        },
    };
    let _ = crate::overlay::accept_gpu_status(app, status);
}

#[derive(Clone, Copy)]
struct Playback {
    clip: Clip,
    start: Instant,
}
fn run(
    app: AppHandle,
    window: isize,
    root: PathBuf,
    rx: mpsc::Receiver<Command>,
    mut renderer: Renderer,
) {
    let mut current: Option<MaterialScene> = None;
    let mut target = Goal::Eye;
    let mut playback: Option<Playback> = None;
    let mut stopped = false;
    let mut last_asset = String::new();
    let mut frame_dirty = true;
    let mut applied = false;
    let mut complete = false;
    let start = Instant::now();
    let mut previous = Instant::now();
    let mut gaze = [0f32; 4];
    let mut blink_start = -10.;
    let mut next_blink = 2.7;
    let mut blink_index = 0.;
    let mut draws = 0;
    let mut last_frame_ms = 0.;
    let mut pending: Option<Command> = None;
    loop {
        let animating = playback.is_some()
            || (target == Goal::Eye
                && !stopped
                && current.as_ref().is_some_and(|s| !s.input.reduced_motion));
        let timeout = if animating {
            Duration::from_millis(if target == Goal::Eye { 22 } else { 8 })
        } else {
            Duration::from_millis(250)
        };
        let mut command = if pending.is_some() {
            pending.take()
        } else {
            match rx.recv_timeout(timeout) {
                Ok(c) => Some(c),
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
                Err(_) => None,
            }
        };
        // Newest validated scene wins; no queue of old presentation may play later.
        while let Ok(next) = rx.try_recv() {
            command = Some(next);
        }
        if let Some(command) = command {
            match command {
                Command::Stop => break,
                Command::Clear => {
                    current = None;
                    playback = None;
                    target = Goal::Hidden;
                    frame_dirty = true;
                    last_asset.clear();
                }
                Command::Scene(scene) => {
                    let next = goal(&scene);
                    let reset = current
                        .as_ref()
                        .is_none_or(|s| s.controller_session_id != scene.controller_session_id);
                    let next_stopped =
                        scene.input.transition.status == TransitionStatus::Interrupted;
                    if reset {
                        playback = None;
                        target = Goal::Eye;
                        last_asset.clear();
                    }
                    if next != target {
                        playback = if scene.input.reduced_motion || next == Goal::Hidden {
                            None
                        } else {
                            clip_for(target, next).map(|clip| Playback {
                                clip,
                                start: Instant::now(),
                            })
                        };
                        target = next;
                        last_asset.clear();
                    }
                    if scene.input.reduced_motion {
                        playback = None;
                        last_asset.clear();
                    }
                    if next_stopped {
                        playback = None;
                    }
                    stopped = next_stopped;
                    current = Some(*scene);
                    frame_dirty = true;
                    applied = false;
                    complete = false;
                }
            }
        }
        let now = Instant::now();
        let elapsed = now.duration_since(start).as_secs_f32();
        let delta = now.duration_since(previous).as_secs_f32().min(0.1);
        previous = now;
        let hwnd = HWND(window as *mut _);
        let mut rect = RECT::default();
        // SAFETY: HWND is the fixed owned material window, retained by Tauri for this thread.
        if unsafe { GetClientRect(hwnd, &mut rect) }.is_err() {
            break;
        }
        let width = (rect.right - rect.left).max(1) as u32;
        let height = (rect.bottom - rect.top).max(1) as u32;
        if width != renderer.config.width || height != renderer.config.height {
            renderer.resize(width, height);
            frame_dirty = true;
        }
        let reduced = current.as_ref().is_some_and(|s| s.input.reduced_motion);
        let mut uniforms = Uniforms {
            viewport: [
                width as f32,
                height as f32,
                if reduced { 2. } else { elapsed + 1.5 },
                0.,
            ],
            gaze,
            layout: [0., 0., 2000. / 1126., if reduced { 1. } else { 0. }],
            mode: [0., 1., 0., 0.],
        };
        let mut asset = None;
        let mut done = playback.is_none();
        if let Some(p) = playback {
            if let Some(index) = p.clip.frame_at(now.duration_since(p.start)) {
                asset = Some(format!("{}/{index:04}.png", p.clip.directory()));
                uniforms.layout[2] = p.clip.aspect();
                uniforms.mode[1] = texture_scale(p.clip, index);
            } else {
                playback = None;
                done = true;
                last_asset.clear();
            }
        }
        if playback.is_none() {
            match target {
                Goal::Sun => {
                    asset = Some("sun.png".into());
                    uniforms.layout[2] = 1088. / 608.;
                }
                Goal::Rain => {
                    asset = Some("rain.png".into());
                    uniforms.layout[2] = 1088. / 608.;
                }
                Goal::Hidden => uniforms.mode[0] = 2.,
                Goal::Eye => {}
            }
        }
        // Stop freezes the last texture/pose; it never starts the remaining clip.
        if stopped {
            asset = None;
            done = true;
        }
        if let Some(scene) = current.as_ref() {
            if target != Goal::Eye {
                if let Some(anchor) = scene
                    .input
                    .anchors
                    .iter()
                    .find(|a| a.id == WeatherTimeId::Noon && a.user_moved)
                {
                    uniforms.layout[0] = (anchor.x as f32 - 0.5) * width as f32;
                    uniforms.layout[1] = (anchor.y as f32 - 0.38) * height as f32;
                }
            }
        }
        if let Some(asset) = asset {
            uniforms.mode[0] = 1.;
            if asset != last_asset && !stopped {
                match load_frame(&root, &asset) {
                    Ok(image) => {
                        // Decode only this frame. A newer scene is checked before it can be shown.
                        if let Ok(new) = rx.try_recv() {
                            pending = Some(new);
                            continue;
                        }
                        renderer.upload(&image);
                        last_asset = asset;
                        frame_dirty = true;
                    }
                    Err(_) => {
                        if let Some(scene) = current.as_ref() {
                            report(&app,scene,MaterialStatusKind::RendererFailure,draws,last_frame_ms,true,Some("Source-derived Weave artwork is unavailable. Rebuild its local asset catalog; facts remain available."));
                        }
                        playback = None;
                        target = Goal::Hidden;
                        uniforms.mode[0] = 2.;
                        stopped = true;
                        frame_dirty = true;
                    }
                }
            }
        } else if stopped {
            uniforms = renderer.last_uniforms;
        }
        if target == Goal::Eye && playback.is_none() && !stopped {
            if !reduced {
                let mut cursor = POINT::default();
                let mut window_rect = RECT::default();
                // Owner-authorized cursor position only: no hooks, capture, or other-window inspection.
                if unsafe { GetCursorPos(&mut cursor) }.is_ok()
                    && unsafe { GetWindowRect(hwnd, &mut window_rect) }.is_ok()
                {
                    let x = ((cursor.x - window_rect.left) as f32 - width as f32 * 0.5)
                        / (width as f32 * 0.32);
                    let y = ((cursor.y - window_rect.top) as f32 - height as f32 * 0.4778)
                        / (height as f32 * 0.28);
                    let follow = 1. - (-delta / 0.040).exp();
                    let weight = 1. - (-delta / 0.145).exp();
                    gaze[0] += (x.clamp(-1., 1.) * 0.145 - gaze[0]) * follow;
                    gaze[1] += (-y.clamp(-1., 1.) * 0.075 - gaze[1]) * follow;
                    gaze[2] += (gaze[0] - gaze[2]) * weight;
                    gaze[3] += (gaze[1] - gaze[3]) * weight;
                }
                if elapsed >= next_blink {
                    blink_start = elapsed;
                    blink_index += 1.;
                    next_blink = elapsed + 4.4 + (blink_index * 2.17_f32).sin() * 1.2;
                }
                uniforms.viewport[3] = blink(elapsed - blink_start);
                frame_dirty = true;
            }
            uniforms.gaze = if reduced { [0.; 4] } else { gaze };
        }
        if frame_dirty {
            let before = Instant::now();
            if renderer.draw(uniforms).is_err() {
                if let Some(scene) = current.as_ref() {
                    report(&app,scene,MaterialStatusKind::RendererFailure,draws,last_frame_ms,true,Some("Native GPU presentation failed. Facts and local controls remain available."));
                }
                break;
            }
            last_frame_ms = before.elapsed().as_secs_f64() * 1000.;
            draws += 1;
            frame_dirty = false;
        }
        if let Some(scene) = current.as_ref() {
            if !applied {
                report(
                    &app,
                    scene,
                    MaterialStatusKind::SceneApplied,
                    draws,
                    last_frame_ms,
                    done,
                    None,
                );
                applied = true;
            }
            if done && !complete {
                report(
                    &app,
                    scene,
                    MaterialStatusKind::TransitionComplete,
                    draws,
                    last_frame_ms,
                    true,
                    None,
                );
                complete = true;
            }
        }
    }
}
fn blink(age: f32) -> f32 {
    fn ease(t: f32) -> f32 {
        let t = t.clamp(0., 1.);
        t * t * (3. - 2. * t)
    }
    if age < 0.09 {
        ease(age / 0.09)
    } else if age < 0.125 {
        1.
    } else {
        1. - ease((age - 0.125) / 0.175)
    }
}
fn load_frame(root: &Path, asset: &str) -> Result<image::RgbaImage, String> {
    // Only fixed developer-owned names assembled above enter this function.
    let mut reader = image::ImageReader::open(root.join(asset)).map_err(|e| e.to_string())?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(2048);
    limits.max_image_height = Some(1200);
    limits.max_alloc = Some(16 * 1024 * 1024);
    reader.limits(limits);
    let image = reader.decode().map_err(|e| e.to_string())?.into_rgba8();
    if image.width() > 2048 || image.height() > 1200 {
        return Err("oversized local frame".into());
    }
    Ok(image)
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct Uniforms {
    viewport: [f32; 4],
    gaze: [f32; 4],
    layout: [f32; 4],
    mode: [f32; 4],
}
struct Renderer {
    surface: wgpu::Surface<'static>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
    pipeline: wgpu::RenderPipeline,
    uniform: wgpu::Buffer,
    texture: wgpu::Texture,
    bind: wgpu::BindGroup,
    bind_layout: wgpu::BindGroupLayout,
    sampler: wgpu::Sampler,
    last_uniforms: Uniforms,
}
impl Renderer {
    async fn new(window: isize, width: u32, height: u32) -> Result<Self, String> {
        let mut descriptor = wgpu::InstanceDescriptor {
            backends: wgpu::Backends::DX12,
            ..Default::default()
        };
        descriptor.backend_options.dx12.presentation_system =
            wgpu_types::Dx12SwapchainKind::DxgiFromVisual;
        let instance = wgpu::Instance::new(&descriptor);
        let handle =
            Win32WindowHandle::new(NonZeroIsize::new(window).ok_or("invalid material HWND")?);
        // SAFETY: the HWND belongs to the fixed material Tauri window and outlives this renderer.
        let surface = unsafe {
            instance.create_surface_unsafe(wgpu::SurfaceTargetUnsafe::RawHandle {
                raw_display_handle: RawDisplayHandle::Windows(WindowsDisplayHandle::new()),
                raw_window_handle: RawWindowHandle::Win32(handle),
            })
        }
        .map_err(|e| e.to_string())?;
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: Some(&surface),
                force_fallback_adapter: false,
            })
            .await
            .map_err(|e| e.to_string())?;
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor {
                label: Some("E1 source-art GPU"),
                ..Default::default()
            })
            .await
            .map_err(|e| e.to_string())?;
        let capabilities = surface.get_capabilities(&adapter);
        if !capabilities
            .alpha_modes
            .contains(&wgpu::CompositeAlphaMode::PreMultiplied)
        {
            return Err("GPU surface lacks premultiplied transparency".into());
        }
        let format = capabilities
            .formats
            .iter()
            .copied()
            .find(|f| *f == wgpu::TextureFormat::Bgra8Unorm)
            .unwrap_or(capabilities.formats[0]);
        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format,
            width,
            height,
            present_mode: wgpu::PresentMode::Fifo,
            desired_maximum_frame_latency: 2,
            alpha_mode: wgpu::CompositeAlphaMode::PreMultiplied,
            view_formats: vec![],
        };
        surface.configure(&device, &config);
        let uniforms = Uniforms::zeroed();
        let uniform = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("E1 authored uniforms"),
            contents: bytemuck::bytes_of(&uniforms),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let bind_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: None,
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
            ],
        });
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            mag_filter: wgpu::FilterMode::Nearest,
            min_filter: wgpu::FilterMode::Nearest,
            ..Default::default()
        });
        let texture = Self::texture(&device, 1, 1);
        let bind = Self::bind(&device, &bind_layout, &uniform, &texture, &sampler);
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Original Week1 eye and source artwork"),
            source: wgpu::ShaderSource::Wgsl(include_str!("weave_gpu.wgsl").into()),
        });
        let layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: None,
            bind_group_layouts: &[&bind_layout],
            push_constant_ranges: &[],
        });
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("E1 premultiplied native material"),
            layout: Some(&layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs"),
                buffers: &[],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs"),
                targets: &[Some(wgpu::ColorTargetState {
                    format,
                    blend: None,
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: Default::default(),
            }),
            primitive: Default::default(),
            depth_stencil: None,
            multisample: Default::default(),
            multiview: None,
            cache: None,
        });
        Ok(Self {
            surface,
            device,
            queue,
            config,
            pipeline,
            uniform,
            texture,
            bind,
            bind_layout,
            sampler,
            last_uniforms: uniforms,
        })
    }
    fn texture(device: &wgpu::Device, width: u32, height: u32) -> wgpu::Texture {
        device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Bounded current source frame"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        })
    }
    fn bind(
        device: &wgpu::Device,
        layout: &wgpu::BindGroupLayout,
        uniform: &wgpu::Buffer,
        texture: &wgpu::Texture,
        sampler: &wgpu::Sampler,
    ) -> wgpu::BindGroup {
        device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: None,
            layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: uniform.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(
                        &texture.create_view(&Default::default()),
                    ),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::Sampler(sampler),
                },
            ],
        })
    }
    fn upload(&mut self, image: &image::RgbaImage) {
        if self.texture.width() != image.width() || self.texture.height() != image.height() {
            self.texture = Self::texture(&self.device, image.width(), image.height());
            self.bind = Self::bind(
                &self.device,
                &self.bind_layout,
                &self.uniform,
                &self.texture,
                &self.sampler,
            );
        }
        self.queue.write_texture(
            wgpu::TexelCopyTextureInfo {
                texture: &self.texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            image.as_raw(),
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(image.width() * 4),
                rows_per_image: Some(image.height()),
            },
            wgpu::Extent3d {
                width: image.width(),
                height: image.height(),
                depth_or_array_layers: 1,
            },
        );
    }
    fn resize(&mut self, width: u32, height: u32) {
        self.config.width = width;
        self.config.height = height;
        self.surface.configure(&self.device, &self.config);
    }
    fn draw(&mut self, uniforms: Uniforms) -> Result<(), String> {
        self.last_uniforms = uniforms;
        self.queue
            .write_buffer(&self.uniform, 0, bytemuck::bytes_of(&uniforms));
        let frame = match self.surface.get_current_texture() {
            Ok(frame) => frame,
            Err(wgpu::SurfaceError::Outdated | wgpu::SurfaceError::Lost) => {
                self.surface.configure(&self.device, &self.config);
                self.surface
                    .get_current_texture()
                    .map_err(|e| e.to_string())?
            }
            Err(error) => return Err(error.to_string()),
        };
        let view = frame.texture.create_view(&Default::default());
        let mut encoder = self.device.create_command_encoder(&Default::default());
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: None,
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                occlusion_query_set: None,
                timestamp_writes: None,
            });
            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(0, &self.bind, &[]);
            pass.draw(0..3, 0..1);
        }
        self.queue.submit(Some(encoder.finish()));
        frame.present();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "Quarantined after reported system-wide graphics failure; no hardware test without separate owner authorization"]
    fn authored_wgsl_compiles_on_the_actual_dx12_adapter() {
        pollster::block_on(async {
            let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
                backends: wgpu::Backends::DX12,
                ..Default::default()
            });
            let adapter = instance
                .request_adapter(&wgpu::RequestAdapterOptions::default())
                .await
                .expect("DX12 adapter");
            let (device, _) = adapter
                .request_device(&wgpu::DeviceDescriptor::default())
                .await
                .expect("GPU device");
            device.push_error_scope(wgpu::ErrorFilter::Validation);
            let _shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
                label: Some("E1 reviewed eye/source shader"),
                source: wgpu::ShaderSource::Wgsl(include_str!("weave_gpu.wgsl").into()),
            });
            let error = device.pop_error_scope().await;
            if let Some(error) = error {
                panic!("Authored shader failed: {error}");
            }
        });
    }
    #[test]
    fn texture_scale_matches_the_smaller_eye_endpoints() {
        assert_eq!(texture_scale(Clip::Reveal, 0), 0.6);
        assert_eq!(texture_scale(Clip::Reveal, 44), 0.8);
        assert_eq!(texture_scale(Clip::Reveal, 88), 1.);
        assert_eq!(texture_scale(Clip::Reveal, 144), 1.);
        assert_eq!(texture_scale(Clip::Revise, 72), 1.);
        assert_eq!(texture_scale(Clip::Dismiss, 0), 1.);
        assert_eq!(texture_scale(Clip::Dismiss, 72), 1.);
        assert_eq!(texture_scale(Clip::Dismiss, 108), 0.8);
        assert_eq!(texture_scale(Clip::Dismiss, 144), 0.6);
        assert_eq!(texture_scale(Clip::Dismiss, 240), 0.6);
    }
    #[test]
    fn reference_frames_keep_original_timing() {
        assert_eq!(Clip::Reveal.frame_at(Duration::ZERO), Some(0));
        assert_eq!(Clip::Revise.frame_at(Duration::from_secs(3)), Some(72));
        assert_eq!(Clip::Dismiss.frame_at(Duration::from_secs(10)), Some(240));
        assert_eq!(Clip::Reveal.frame_at(FRAME_PERIOD * 145), None);
    }
    #[test]
    fn canonical_sequence_does_not_recreate_eye_between_weather_days() {
        assert_eq!(clip_for(Goal::Eye, Goal::Sun), Some(Clip::Reveal));
        assert_eq!(clip_for(Goal::Sun, Goal::Rain), Some(Clip::Revise));
        assert_eq!(clip_for(Goal::Rain, Goal::Eye), Some(Clip::Dismiss));
        assert_eq!(clip_for(Goal::Sun, Goal::Hidden), None);
    }
    #[test]
    fn original_blink_envelope_is_retained() {
        assert_eq!(blink(0.), 0.);
        assert_eq!(blink(0.10), 1.);
        assert_eq!(blink(0.3), 0.);
    }
}
