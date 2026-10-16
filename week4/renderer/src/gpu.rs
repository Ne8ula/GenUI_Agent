use crate::{
    geometry::{Frame, MAX_VERTICES, STRIDE},
    light::LightPass,
    materials,
    math::ASPECT,
    scene::{Scene, SCENE_ID},
};
use wasm_bindgen::{prelude::*, JsCast};
use web_sys::{
    HtmlCanvasElement, WebGl2RenderingContext as Gl, WebGlBuffer, WebGlProgram, WebGlShader,
    WebGlVertexArrayObject,
};

fn error(s: impl AsRef<str>) -> JsValue {
    JsValue::from_str(s.as_ref())
}
fn compile(gl: &Gl, kind: u32, source: &str) -> Result<WebGlShader, JsValue> {
    let shader = gl
        .create_shader(kind)
        .ok_or_else(|| error("WebGL shader allocation failed"))?;
    gl.shader_source(&shader, source);
    gl.compile_shader(&shader);
    if !gl
        .get_shader_parameter(&shader, Gl::COMPILE_STATUS)
        .as_bool()
        .unwrap_or(false)
    {
        let reason = gl.get_shader_info_log(&shader).unwrap_or_default();
        gl.delete_shader(Some(&shader));
        return Err(error(reason));
    }
    Ok(shader)
}
pub(crate) fn program_sources(
    gl: &Gl,
    vertex_source: &str,
    fragment_source: &str,
) -> Result<WebGlProgram, JsValue> {
    let vertex = compile(gl, Gl::VERTEX_SHADER, vertex_source)?;
    let fragment = match compile(gl, Gl::FRAGMENT_SHADER, fragment_source) {
        Ok(v) => v,
        Err(e) => {
            gl.delete_shader(Some(&vertex));
            return Err(e);
        }
    };
    let result = (|| {
        let p = gl
            .create_program()
            .ok_or_else(|| error("WebGL program allocation failed"))?;
        gl.attach_shader(&p, &vertex);
        gl.attach_shader(&p, &fragment);
        gl.link_program(&p);
        if !gl
            .get_program_parameter(&p, Gl::LINK_STATUS)
            .as_bool()
            .unwrap_or(false)
        {
            let why = gl.get_program_info_log(&p).unwrap_or_default();
            gl.delete_program(Some(&p));
            return Err(error(why));
        }
        Ok(p)
    })();
    gl.delete_shader(Some(&vertex));
    gl.delete_shader(Some(&fragment));
    result
}
fn upload(
    gl: &Gl,
    buffer: &WebGlBuffer,
    capacity: &mut usize,
    values: &[f32],
    usage: u32,
) -> usize {
    gl.bind_buffer(Gl::ARRAY_BUFFER, Some(buffer));
    let needed = values.len().max(STRIDE);
    if *capacity < needed {
        let allocation = needed.next_power_of_two().min(MAX_VERTICES * STRIDE);
        gl.buffer_data_with_i32(Gl::ARRAY_BUFFER, (allocation * 4) as i32, usage);
        *capacity = allocation;
    }
    if !values.is_empty() {
        // WebGL copies the view synchronously; no Rust allocation occurs while it is borrowed.
        let data = unsafe { js_sys::Float32Array::view(values) };
        gl.buffer_sub_data_with_i32_and_array_buffer_view(Gl::ARRAY_BUFFER, 0, &data);
    }
    values.len() * 4
}
fn draw_buffer(gl: &Gl, buffer: &WebGlBuffer, mode: u32, floats: usize) {
    gl.bind_buffer(Gl::ARRAY_BUFFER, Some(buffer));
    for (location, size, offset) in [(0, 3, 0), (1, 3, 12), (2, 2, 24), (3, 4, 32)] {
        gl.enable_vertex_attrib_array(location);
        gl.vertex_attrib_pointer_with_i32(
            location,
            size,
            Gl::FLOAT,
            false,
            (STRIDE * 4) as i32,
            offset,
        );
    }
    gl.draw_arrays(mode, 0, (floats / STRIDE) as i32);
}
#[wasm_bindgen]
pub struct RustRenderer {
    canvas: HtmlCanvasElement,
    gl: Gl,
    program: WebGlProgram,
    light: Option<LightPass>,
    buffers: Vec<WebGlBuffer>,
    capacities: [usize; 4],
    static_lengths: [usize; 2],
    static_uploaded: bool,
    uploaded_bytes: usize,
    vao: WebGlVertexArrayObject,
    scene: Scene,
    paris: Option<crate::paris::Paris>,
    frame: Frame,
    disposed: bool,
    draws: u32,
    context_extension: Option<js_sys::Object>,
    cached_inputs: Option<[f64; 6]>,
}
#[wasm_bindgen]
impl RustRenderer {
    #[wasm_bindgen(constructor)]
    pub fn new(
        canvas: HtmlCanvasElement,
        seed: u32,
        density: f32,
    ) -> Result<RustRenderer, JsValue> {
        let scene = Scene::new(seed, density).map_err(error)?;
        let options = js_sys::Object::new();
        for (key, value) in [
            ("alpha", false),
            ("antialias", true),
            ("preserveDrawingBuffer", true),
            ("depth", true),
        ] {
            js_sys::Reflect::set(
                &options,
                &JsValue::from_str(key),
                &JsValue::from_bool(value),
            )?;
        }
        let gl: Gl = canvas
            .get_context_with_context_options("webgl2", &options)?
            .ok_or_else(|| error("Rust WebGL2 unavailable; no image or TypeScript fallback"))?
            .dyn_into()?;
        let p = program_sources(&gl, &materials::vertex_source(), materials::FRAGMENT)?;
        let mut buffers = Vec::with_capacity(4);
        for _ in 0..4 {
            let Some(buffer) = gl.create_buffer() else {
                for allocated in &buffers {
                    gl.delete_buffer(Some(allocated));
                }
                gl.delete_program(Some(&p));
                return Err(error("WebGL buffer allocation failed"));
            };
            buffers.push(buffer);
        }
        let Some(vao) = gl.create_vertex_array() else {
            for allocated in &buffers {
                gl.delete_buffer(Some(allocated));
            }
            gl.delete_program(Some(&p));
            return Err(error("WebGL vertex array allocation failed"));
        };
        let static_lengths = [
            scene
                .objects
                .iter()
                .map(|o| o.vertices.len() * STRIDE)
                .sum(),
            scene
                .objects
                .iter()
                .flat_map(|o| &o.strands)
                .map(|s| s.points.len().saturating_sub(1) * 2 * STRIDE)
                .sum(),
        ];
        let light = match LightPass::new(&gl) {
            Ok(light) => light,
            Err(error) => {
                for buffer in &buffers {
                    gl.delete_buffer(Some(buffer));
                }
                gl.delete_vertex_array(Some(&vao));
                gl.delete_program(Some(&p));
                return Err(error);
            }
        };
        let context_extension = gl.get_extension("WEBGL_lose_context").ok().flatten();
        Ok(Self {
            canvas,
            gl,
            program: p,
            light: Some(light),
            buffers,
            capacities: [0; 4],
            static_lengths,
            static_uploaded: false,
            uploaded_bytes: 0,
            vao,
            scene,
            paris: None,
            frame: Frame::default(),
            disposed: false,
            draws: 0,
            context_extension,
            cached_inputs: None,
        })
    }
    pub fn set_paris(&mut self, enabled: bool) {
        self.paris = enabled.then(|| crate::paris::Paris::new(self.scene.seed));
        self.cached_inputs = None;
        self.static_uploaded = false;
    }
    pub fn render(
        &mut self,
        time_ms: f64,
        build_ms: f64,
        reduced: bool,
        tiles: bool,
        width: u32,
        height: u32,
    ) -> Result<bool, JsValue> {
        if self.disposed {
            return Err(error("Rust renderer disposed"));
        }
        if self.gl.is_context_lost() {
            return Ok(false);
        }
        if width == 0
            || height == 0
            || width > 4096
            || height > 4096
            || u64::from(width) * u64::from(height) > 8_388_608
        {
            return Err(error(
                "framebuffer exceeds bounded 4096 / 8-megapixel budget",
            ));
        }
        if !time_ms.is_finite()
            || !build_ms.is_finite()
            || !(0.0..=3_600_000.0).contains(&time_ms)
            || !(0.0..=60_000.0).contains(&build_ms)
        {
            return Err(error("time/build outside renderer bounds"));
        }
        let inputs = [
            if reduced { 0.0 } else { time_ms },
            if reduced { 0.0 } else { build_ms },
            if reduced { 1.0 } else { 0.0 },
            if tiles { 1.0 } else { 0.0 },
            width as f64,
            height as f64,
        ];
        // Paused and reduced states require no new GPU work. This retains the live
        // framebuffer, not a captured image; resize/flags/context replacement invalidate it.
        self.uploaded_bytes = 0;
        if self.cached_inputs == Some(inputs) {
            return Ok(true);
        }
        if let Some(paris) = &self.paris {
            paris
                .frame(&mut self.frame, time_ms, reduced, tiles)
                .map_err(error)?;
        } else {
            self.scene
                .frame(&mut self.frame, time_ms, build_ms, reduced, tiles)
                .map_err(error)?;
        }
        if self.canvas.width() != width {
            self.canvas.set_width(width);
        }
        if self.canvas.height() != height {
            self.canvas.set_height(height);
        }
        if self.paris.is_none() {
            self.light
                .as_mut()
                .ok_or_else(|| error("live light pass unavailable"))?
                .begin(width, height)?;
        } else {
            self.gl.bind_framebuffer(Gl::FRAMEBUFFER, None);
        }
        let gl = &self.gl;
        gl.disable(Gl::SCISSOR_TEST);
        gl.viewport(0, 0, width as i32, height as i32);
        if self.paris.is_some() {
            gl.clear_color(0.0, 0.0, 0.0, 1.0);
        } else {
            gl.clear_color(0.055, 0.025, 0.012, 1.0);
        }
        gl.clear_depth(1.0);
        gl.depth_mask(true);
        gl.clear(Gl::COLOR_BUFFER_BIT | Gl::DEPTH_BUFFER_BIT);
        let w = (height as f32 * ASPECT).min(width as f32).round() as i32;
        let h = (w as f32 / ASPECT).round() as i32;
        gl.viewport((width as i32 - w) / 2, (height as i32 - h) / 2, w, h);
        gl.enable(Gl::DEPTH_TEST);
        gl.depth_func(Gl::LEQUAL);
        gl.disable(Gl::CULL_FACE);
        gl.enable(Gl::BLEND);
        gl.blend_func(Gl::SRC_ALPHA, Gl::ONE_MINUS_SRC_ALPHA);
        gl.use_program(Some(&self.program));
        gl.bind_vertex_array(Some(&self.vao));
        let formed = self.paris.is_none() && (reduced || build_ms == 0.0 || time_ms >= build_ms);
        let [static_triangles, static_lines] = if formed { self.static_lengths } else { [0, 0] };
        if static_triangles > self.frame.triangles.len() || static_lines > self.frame.lines.len() {
            return Err(error("static geometry prefix is inconsistent"));
        }
        // Cache geometry, not pixels. Construction still submits only the born
        // primitives; settled architecture/furniture need one GPU upload per scene.
        if formed && !self.static_uploaded {
            self.uploaded_bytes += upload(
                gl,
                &self.buffers[0],
                &mut self.capacities[0],
                &self.frame.triangles[..static_triangles],
                Gl::STATIC_DRAW,
            );
            self.uploaded_bytes += upload(
                gl,
                &self.buffers[1],
                &mut self.capacities[1],
                &self.frame.lines[..static_lines],
                Gl::STATIC_DRAW,
            );
            self.static_uploaded = true;
        }
        self.uploaded_bytes += upload(
            gl,
            &self.buffers[2],
            &mut self.capacities[2],
            &self.frame.triangles[static_triangles..],
            Gl::DYNAMIC_DRAW,
        );
        self.uploaded_bytes += upload(
            gl,
            &self.buffers[3],
            &mut self.capacities[3],
            &self.frame.lines[static_lines..],
            Gl::DYNAMIC_DRAW,
        );
        if formed {
            draw_buffer(gl, &self.buffers[0], Gl::TRIANGLES, static_triangles);
        }
        draw_buffer(
            gl,
            &self.buffers[2],
            Gl::TRIANGLES,
            self.frame.triangles.len() - static_triangles,
        );
        if formed {
            draw_buffer(gl, &self.buffers[1], Gl::LINES, static_lines);
        }
        draw_buffer(
            gl,
            &self.buffers[3],
            Gl::LINES,
            self.frame.lines.len() - static_lines,
        );
        if self.paris.is_none() {
            self.light
                .as_ref()
                .ok_or_else(|| error("live light pass unavailable"))?
                .finish();
        }
        gl.bind_vertex_array(None);
        if gl.is_context_lost() {
            return Ok(false);
        }
        let e = gl.get_error();
        if e == Gl::CONTEXT_LOST_WEBGL {
            return Ok(false);
        }
        if e != Gl::NO_ERROR {
            return Err(error(format!("Rust WebGL draw error {e}")));
        }
        self.cached_inputs = Some(inputs);
        self.draws = self.draws.saturating_add(1);
        Ok(true)
    }
    pub fn stats(&self) -> String {
        format!("{{\"sceneId\":\"{}\",\"vertices\":{},\"triangles\":{},\"segments\":{},\"objects\":{},\"tiles\":{},\"draws\":{},\"cpuBufferBytes\":{},\"uploadedBytes\":{},\"gpuAllocatedBytes\":{},\"renderTargetBytes\":{}}}",if self.paris.is_some() { crate::paris::ID } else { SCENE_ID },(self.frame.triangles.len()+self.frame.lines.len())/STRIDE,self.frame.surfaces,self.frame.segments,self.frame.objects,self.frame.tiles,self.draws,(self.frame.triangles.capacity()+self.frame.lines.capacity())*4,self.uploaded_bytes,self.capacities.iter().sum::<usize>()*4,self.light.as_ref().map_or(0, LightPass::requested_bytes))
    }
    pub fn inventory(&self) -> String {
        let objects = self
            .paris
            .as_ref()
            .map_or(&self.scene.objects, |p| &p.objects);
        let rows: Vec<_> = objects
            .iter()
            .map(|o| {
                format!(
                    "{{\"id\":\"{}\",\"material\":{},\"start\":{},\"vertices\":{},\"strands\":{}}}",
                    o.id,
                    o.material,
                    o.start,
                    o.vertices.len(),
                    o.strands.len()
                )
            })
            .collect();
        format!("[{}]", rows.join(","))
    }
    pub fn device(&self) -> String {
        let parameter = if self
            .gl
            .get_extension("WEBGL_debug_renderer_info")
            .ok()
            .flatten()
            .is_some()
        {
            0x9246
        } else {
            Gl::RENDERER
        };
        let device = self
            .gl
            .get_parameter(parameter)
            .ok()
            .and_then(|v| v.as_string())
            .unwrap_or_else(|| "WebGL2 device unreported".into());
        format!("Rust/WASM procedural WebGL2 — {device}")
    }
    pub fn dispose(&mut self) {
        if self.disposed {
            return;
        }
        if !self.gl.is_context_lost() {
            for buffer in &self.buffers {
                self.gl.delete_buffer(Some(buffer));
            }
            self.gl.delete_vertex_array(Some(&self.vao));
            self.gl.delete_program(Some(&self.program));
        }
        self.light.take();
        self.buffers.clear();
        self.capacities = [0; 4];
        self.static_uploaded = false;
        self.frame = Frame::default();
        self.scene.objects.clear();
        self.disposed = true;
    }
    pub fn lose_context(&self) {
        if let Some(extension) = &self.context_extension {
            if let Ok(f) = js_sys::Reflect::get(&extension, &JsValue::from_str("loseContext")) {
                if let Ok(f) = f.dyn_into::<js_sys::Function>() {
                    let _ = f.call0(&extension);
                }
            }
        }
    }
    pub fn restore_context(&self) {
        if let Some(extension) = &self.context_extension {
            if let Ok(f) = js_sys::Reflect::get(&extension, &JsValue::from_str("restoreContext")) {
                if let Ok(f) = f.dyn_into::<js_sys::Function>() {
                    let _ = f.call0(&extension);
                }
            }
        }
    }
}
impl Drop for RustRenderer {
    fn drop(&mut self) {
        self.dispose();
    }
}
