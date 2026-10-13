// Bounded post-processing of this frame's Rust geometry. No reference image or
// pre-rendered construction state is ever uploaded to the colour attachment.
use crate::gpu::program_sources;
use wasm_bindgen::JsValue;
use web_sys::{
    WebGl2RenderingContext as Gl, WebGlFramebuffer, WebGlProgram, WebGlRenderbuffer, WebGlTexture,
};

const VERTEX: &str = r#"#version 300 es
precision highp float;
out vec2 uv;
void main(){
  vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
  uv=p;gl_Position=vec4(p*2.0-1.0,0,1);
}
"#;
const FRAGMENT: &str = r#"#version 300 es
precision highp float;
uniform sampler2D liveScene;
in vec2 uv;
out vec4 colour;
vec3 bright(vec2 p){
  vec3 c=texture(liveScene,p).rgb;
  float y=dot(c,vec3(0.2126,0.7152,0.0722));
  return c*smoothstep(0.36,0.92,y);
}
void main(){
  vec2 px=1.0/vec2(textureSize(liveScene,0));
  vec3 base=texture(liveScene,uv).rgb;
  vec3 glow=bright(uv)*0.12;
  for(int i=0;i<8;i++){
    float a=float(i)*0.78539816;vec2 d=vec2(cos(a),sin(a))*px;
    glow+=bright(uv+d*2.0)*0.055+bright(uv+d*5.0)*0.035+bright(uv+d*11.0)*0.02;
  }
  colour=vec4(1.0-(1.0-base)*(1.0-glow*0.75),1);
}
"#;
const SAMPLES: i32 = 4;

pub struct LightPass {
    gl: Gl,
    program: Option<WebGlProgram>,
    colour: Option<WebGlTexture>,
    multisample_colour: Option<WebGlRenderbuffer>,
    depth: Option<WebGlRenderbuffer>,
    target: Option<WebGlFramebuffer>,
    resolve: Option<WebGlFramebuffer>,
    size: (u32, u32),
}
impl LightPass {
    pub fn new(gl: &Gl) -> Result<Self, JsValue> {
        if gl.get_parameter(Gl::MAX_SAMPLES)?.as_f64().unwrap_or(0.0) < SAMPLES as f64 {
            return Err(JsValue::from_str(
                "live light pass requires four-sample WebGL2 support",
            ));
        }
        // Partial setup failures use exactly the same Drop cleanup path.
        let mut pass = Self {
            gl: gl.clone(),
            program: None,
            colour: None,
            multisample_colour: None,
            depth: None,
            target: None,
            resolve: None,
            size: (0, 0),
        };
        pass.program = Some(program_sources(gl, VERTEX, FRAGMENT)?);
        pass.colour = Some(
            gl.create_texture()
                .ok_or_else(|| JsValue::from_str("live light texture allocation failed"))?,
        );
        pass.multisample_colour = Some(
            gl.create_renderbuffer()
                .ok_or_else(|| JsValue::from_str("live light colour allocation failed"))?,
        );
        pass.depth = Some(
            gl.create_renderbuffer()
                .ok_or_else(|| JsValue::from_str("live light depth allocation failed"))?,
        );
        pass.target = Some(
            gl.create_framebuffer()
                .ok_or_else(|| JsValue::from_str("live light framebuffer allocation failed"))?,
        );
        pass.resolve = Some(
            gl.create_framebuffer()
                .ok_or_else(|| JsValue::from_str("live light resolve allocation failed"))?,
        );
        Ok(pass)
    }
    fn complete(&self) -> Result<(), JsValue> {
        if self.gl.check_framebuffer_status(Gl::FRAMEBUFFER) != Gl::FRAMEBUFFER_COMPLETE {
            return Err(JsValue::from_str("live light framebuffer incomplete"));
        }
        let code = self.gl.get_error();
        if code != Gl::NO_ERROR {
            return Err(JsValue::from_str(&format!(
                "live light allocation GL error {code}"
            )));
        }
        Ok(())
    }
    pub fn begin(&mut self, width: u32, height: u32) -> Result<(), JsValue> {
        if width == 0
            || height == 0
            || width > 4096
            || height > 4096
            || u64::from(width) * u64::from(height) > 8_388_608
        {
            return Err(JsValue::from_str(
                "live light target exceeds framebuffer budget",
            ));
        }
        let gl = &self.gl;
        if self.size != (width, height) {
            // Render thin strands with MSAA, then resolve into a sampled texture.
            // Context antialias:true alone does not multisample an offscreen FBO.
            gl.bind_framebuffer(Gl::FRAMEBUFFER, self.target.as_ref());
            for (buffer, format, attachment) in [
                (
                    self.multisample_colour.as_ref(),
                    Gl::RGBA8,
                    Gl::COLOR_ATTACHMENT0,
                ),
                (
                    self.depth.as_ref(),
                    Gl::DEPTH_COMPONENT24,
                    Gl::DEPTH_ATTACHMENT,
                ),
            ] {
                gl.bind_renderbuffer(Gl::RENDERBUFFER, buffer);
                gl.renderbuffer_storage_multisample(
                    Gl::RENDERBUFFER,
                    SAMPLES,
                    format,
                    width as i32,
                    height as i32,
                );
                gl.framebuffer_renderbuffer(Gl::FRAMEBUFFER, attachment, Gl::RENDERBUFFER, buffer);
            }
            self.complete()?;
            gl.bind_framebuffer(Gl::FRAMEBUFFER, self.resolve.as_ref());
            gl.active_texture(Gl::TEXTURE0);
            gl.bind_texture(Gl::TEXTURE_2D, self.colour.as_ref());
            for name in [Gl::TEXTURE_MIN_FILTER, Gl::TEXTURE_MAG_FILTER] {
                gl.tex_parameteri(Gl::TEXTURE_2D, name, Gl::LINEAR as i32);
            }
            for name in [Gl::TEXTURE_WRAP_S, Gl::TEXTURE_WRAP_T] {
                gl.tex_parameteri(Gl::TEXTURE_2D, name, Gl::CLAMP_TO_EDGE as i32);
            }
            gl.tex_image_2d_with_i32_and_i32_and_i32_and_format_and_type_and_opt_u8_array(
                Gl::TEXTURE_2D,
                0,
                Gl::RGBA8 as i32,
                width as i32,
                height as i32,
                0,
                Gl::RGBA,
                Gl::UNSIGNED_BYTE,
                None,
            )?;
            gl.framebuffer_texture_2d(
                Gl::FRAMEBUFFER,
                Gl::COLOR_ATTACHMENT0,
                Gl::TEXTURE_2D,
                self.colour.as_ref(),
                0,
            );
            self.complete()?;
            self.size = (width, height);
        }
        gl.bind_framebuffer(Gl::FRAMEBUFFER, self.target.as_ref());
        gl.bind_texture(Gl::TEXTURE_2D, None);
        Ok(())
    }
    pub fn finish(&self) {
        let gl = &self.gl;
        gl.bind_framebuffer(Gl::READ_FRAMEBUFFER, self.target.as_ref());
        gl.bind_framebuffer(Gl::DRAW_FRAMEBUFFER, self.resolve.as_ref());
        let (w, h) = (self.size.0 as i32, self.size.1 as i32);
        gl.blit_framebuffer(0, 0, w, h, 0, 0, w, h, Gl::COLOR_BUFFER_BIT, Gl::NEAREST);
        gl.bind_framebuffer(Gl::FRAMEBUFFER, None);
        gl.viewport(0, 0, w, h);
        gl.disable(Gl::DEPTH_TEST);
        gl.disable(Gl::BLEND);
        gl.use_program(self.program.as_ref());
        gl.active_texture(Gl::TEXTURE0);
        gl.bind_texture(Gl::TEXTURE_2D, self.colour.as_ref());
        gl.draw_arrays(Gl::TRIANGLES, 0, 3);
        gl.bind_texture(Gl::TEXTURE_2D, None);
    }
    pub fn requested_bytes(&self) -> usize {
        // Single-sample RGBA8 + four-sample RGBA8/depth24 (4-byte accounting).
        self.size.0 as usize * self.size.1 as usize * (4 + SAMPLES as usize * 8)
    }
}
impl Drop for LightPass {
    fn drop(&mut self) {
        if self.gl.is_context_lost() {
            return;
        }
        self.gl.delete_framebuffer(self.target.as_ref());
        self.gl.delete_framebuffer(self.resolve.as_ref());
        self.gl.delete_renderbuffer(self.depth.as_ref());
        self.gl
            .delete_renderbuffer(self.multisample_colour.as_ref());
        self.gl.delete_texture(self.colour.as_ref());
        self.gl.delete_program(self.program.as_ref());
    }
}
