//! Bounded CPU particle simulation. No textures, video, GPU, network, or OS calls.
//! The eye's lid equations, square pupil and gaze/tissue constants derive from
//! the owner's archived Week 1 SignalEye. Weather is authored geometry and
//! kinematics inspired by the Weave references, never image-sampled positions.

use std::{cell::RefCell, f32::consts::PI};

pub const BODY_COUNT: usize = 128 * 60;
pub const STREAM_COUNT: usize = 32;
pub const DROP_COUNT: usize = STREAM_COUNT * 8;
pub const RIPPLE_COUNT: usize = 8 * 32;
pub const PARTICLE_COUNT: usize = BODY_COUNT + DROP_COUNT + RIPPLE_COUNT;
pub const STRIDE: usize = 8;
const REFERENCE_W: f32 = 1088.;
const REFERENCE_H: f32 = 608.;
const WEATHER_CENTER: [f32; 2] = [544., 231.04];
const EYE_CENTER: [f32; 2] = [544., 290.];
const CLOUD_CELLS: usize = BODY_COUNT / 4;
const CLOUD_Y: [f32; 4] = [158., 246., 192., 120.];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode {
    Eye = 0,
    Sun = 1,
    Rain = 2,
}
impl Mode {
    fn from_u32(value: u32) -> Option<Self> {
        match value {
            0 => Some(Self::Eye),
            1 => Some(Self::Sun),
            2 => Some(Self::Rain),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, Debug, Default)]
struct Cell {
    x: f32,
    y: f32,
    size: f32,
    red: f32,
    green: f32,
    blue: f32,
    alpha: f32,
}
impl Cell {
    fn ink(x: f32, y: f32, size: f32, alpha: f32) -> Self {
        Self {
            x,
            y,
            size,
            red: 1.,
            green: 0.23,
            blue: 0.20,
            alpha,
        }
    }
    fn mix(self, other: Self, amount: f32) -> Self {
        Self {
            x: lerp(self.x, other.x, amount),
            y: lerp(self.y, other.y, amount),
            size: lerp(self.size, other.size, amount),
            red: lerp(self.red, other.red, amount),
            green: lerp(self.green, other.green, amount),
            blue: lerp(self.blue, other.blue, amount),
            alpha: lerp(self.alpha, other.alpha, amount),
        }
    }
}

#[derive(Clone, Copy, Debug)]
struct EyeSample {
    x: f32,
    y: f32,
    arch: f32,
    upper: f32,
    lower: f32,
    brow: f32,
    skin: f32,
    threshold: f32,
}

#[derive(Clone, Copy, Debug)]
struct Stream {
    x: f32,
    top: f32,
    ground: f32,
    speed: f32,
    offset: f32,
}
impl Stream {
    fn fall_seconds(self) -> f32 {
        (self.ground - self.top) / self.speed
    }
    fn period(self) -> f32 {
        self.fall_seconds() + 0.95
    }
}

/// All allocations happen in construction. Ordinary stepping/revisions reuse
/// fixed-size storage and never accumulate droplets, ripples or frame history.
pub struct Engine {
    seed: u32,
    shapes: [Vec<Cell>; 3],
    eye: Vec<EyeSample>,
    streams: [Stream; STREAM_COUNT],
    from: Vec<Cell>,
    pose: Vec<Cell>,
    output: Vec<f32>,
    target: Mode,
    previous: Mode,
    generation: u32,
    reduced: bool,
    active: bool,
    sim_time: f64,
    last_input_ms: Option<f64>,
    transition_start: f64,
    sun_spin_start: f64,
    cloud_start: f64,
    duration: f64,
    from_weather_weight: f32,
    weather_weight: f32,
    gaze: [f32; 2],
    tissue: [f32; 2],
}

impl Engine {
    pub fn new(seed: u32) -> Self {
        let eye: Vec<_> = (0..BODY_COUNT).map(|id| eye_sample(id, seed)).collect();
        let shapes: [Vec<Cell>; 3] = [
            (0..BODY_COUNT)
                .map(|id| eye_cell(id, &eye[id], [0., 0.], [0., 0.], 0.))
                .collect(),
            (0..BODY_COUNT).map(|id| sun_cell(id, seed)).collect(),
            (0..BODY_COUNT).map(|id| cloud_cell(id, seed)).collect(),
        ];
        let pose: Vec<Cell> = shapes[0].clone();
        let streams = std::array::from_fn(|id| {
            let group = id / 8;
            Stream {
                x: cloud_x(group, 0.) - 70. + (id % 8) as f32 * 20.,
                top: CLOUD_Y[group] + 24. + random(seed, id as u32, 8) * 20.,
                ground: 419. + random(seed, id as u32, 9) * 87.,
                speed: 90. + random(seed, id as u32, 10) * 65.,
                offset: random(seed, id as u32, 11) * 7.,
            }
        });
        Self {
            seed,
            shapes,
            eye,
            streams,
            from: pose.clone(),
            pose,
            output: vec![0.; PARTICLE_COUNT * STRIDE],
            target: Mode::Eye,
            previous: Mode::Eye,
            generation: 0,
            reduced: false,
            active: false,
            sim_time: 0.,
            last_input_ms: None,
            transition_start: 0.,
            sun_spin_start: 0.,
            cloud_start: 0.,
            duration: 0.,
            from_weather_weight: 0.,
            weather_weight: 0.,
            gaze: [0.; 2],
            tissue: [0.; 2],
        }
    }

    /// Equal-generation calls are idempotent only for the same target/settings.
    /// A stale request cannot restore superseded weather.
    pub fn set_target(&mut self, mode: u32, generation: u32, reduced: bool) -> bool {
        let Some(mode) = Mode::from_u32(mode) else {
            return false;
        };
        if generation < self.generation {
            return false;
        }
        if generation == self.generation {
            return mode == self.target && reduced == self.reduced;
        }
        let was_active = self.active;
        self.generation = generation;
        self.previous = self.target;
        self.target = mode;
        self.reduced = reduced;
        self.from.copy_from_slice(&self.pose);
        self.from_weather_weight = self.weather_weight;
        self.transition_start = self.sim_time;
        self.duration = if reduced || mode == self.previous {
            0.
        } else if mode == Mode::Eye && was_active {
            0.65
        } else if mode == Mode::Eye {
            3.0
        } else if self.previous == Mode::Eye {
            3.2
        } else {
            2.6
        };
        if mode == Mode::Sun && self.previous != Mode::Sun {
            self.sun_spin_start = self.sim_time + self.duration;
        }
        if mode == Mode::Rain && self.previous != Mode::Rain {
            self.cloud_start = self.sim_time + self.duration;
        }
        self.active = self.duration > 0.;
        true
    }

    #[allow(clippy::too_many_arguments)]
    pub fn step(
        &mut self,
        time_ms: f64,
        width: f32,
        height: f32,
        center_x: f32,
        center_y: f32,
        gaze_x: f32,
        gaze_y: f32,
        paused: bool,
    ) {
        let now = if time_ms.is_finite() {
            time_ms.max(0.)
        } else {
            self.last_input_ms.unwrap_or(0.)
        };
        let delta = self
            .last_input_ms
            .map_or(0., |last| ((now - last) / 1000.).clamp(0., 0.1));
        self.last_input_ms = Some(now);
        if paused {
            return;
        }
        if !self.reduced {
            self.sim_time += delta;
        }
        let progress = if self.duration > 0. {
            ((self.sim_time - self.transition_start) / self.duration).clamp(0., 1.) as f32
        } else {
            1.
        };
        self.active = progress < 1.;
        let t = ease(progress);
        self.weather_weight = lerp(
            self.from_weather_weight,
            if self.target == Mode::Eye { 0. } else { 1. },
            t,
        );
        let width = finite(width, 1088.).clamp(64., 4096.);
        let height = finite(height, 608.).clamp(64., 4096.);
        let scale = (width / REFERENCE_W).min(height / REFERENCE_H);
        let origin = [
            (width - REFERENCE_W * scale) * 0.5,
            (height - REFERENCE_H * scale) * 0.5,
        ];
        let offset = [
            (finite(center_x, 0.5).clamp(0., 1.) - 0.5) * width,
            (finite(center_y, 0.38).clamp(0., 1.) - 0.38) * height,
        ];
        let wanted = if self.reduced {
            [0., 0.]
        } else {
            [
                finite(gaze_x, 0.).clamp(-1., 1.) * 0.145,
                -finite(gaze_y, 0.).clamp(-1., 1.) * 0.075,
            ]
        };
        let follow = if self.reduced {
            1.
        } else {
            1. - (-(delta as f32) / 0.040).exp()
        };
        let weight = if self.reduced {
            1.
        } else {
            1. - (-(delta as f32) / 0.145).exp()
        };
        for (axis, wanted_value) in wanted.iter().enumerate() {
            self.gaze[axis] = lerp(self.gaze[axis], *wanted_value, follow);
            self.tissue[axis] = lerp(self.tissue[axis], self.gaze[axis], weight);
        }
        let closure = if self.reduced {
            0.
        } else {
            blink((self.sim_time as f32 - 2.7).rem_euclid(4.8))
        };
        let sun_angle = if self.reduced {
            0.
        } else {
            (self.sim_time - self.sun_spin_start).max(0.) as f32 * 0.0225
        };
        let weather_time = if self.reduced {
            0.
        } else {
            self.sim_time as f32
        };
        let glow = if self.reduced {
            0.
        } else {
            sunlight(self.seed, weather_time)
        };
        for id in 0..BODY_COUNT {
            let mut goal = if self.target == Mode::Eye {
                eye_cell(id, &self.eye[id], self.gaze, self.tissue, closure)
            } else if self.target == Mode::Sun && id < 3072 {
                sun_sphere_cell(id, sun_angle)
            } else {
                self.shapes[self.target as usize][id]
            };
            if self.target != Mode::Eye {
                let phase = random(self.seed, id as u32, 31) * 2. * PI;
                let drift = weather_time * (0.045 + random(self.seed, id as u32, 32) * 0.035);
                let spread = if self.target == Mode::Rain { 0.1 } else { 1. };
                goal.x += (drift + phase).sin() * 3.5 * spread;
                goal.y += (drift * 0.73 + phase * 1.7).cos() * 2.5 * spread;
                if self.target == Mode::Rain {
                    let group = id / CLOUD_CELLS;
                    goal.x += cloud_x(group, self.cloud_time()) - cloud_x(group, 0.);
                    goal.y += (weather_time * 0.035 + group as f32 * 1.7).sin() * 4.;
                } else {
                    goal.red = lerp(goal.red, 1., glow * 0.45);
                    goal.green *= 1. - glow * 0.35;
                    goal.blue *= 1. - glow * 0.45;
                    if id >= 7168 {
                        goal.alpha *= 0.3 + glow * 1.5;
                        let dx = goal.x - WEATHER_CENTER[0];
                        let dy = goal.y - WEATHER_CENTER[1];
                        goal.x += dx * glow * 0.10;
                        goal.y += dy * glow * 0.10;
                    }
                    // One existing slot carries the soft sunlight envelope to Canvas2D.
                    if id == 7168 {
                        goal = Cell::ink(546., 231., 9., glow * 0.28);
                    }
                }
            }
            // A few cells depart ahead of their neighbours; the authored formation
            // still settles at the exact bounded transition endpoint.
            let local_t = if self.active {
                rhythm(((progress - random(self.seed, id as u32, 21) * 0.04) / 0.96).clamp(0., 1.))
            } else {
                1.
            };
            if self.target == Mode::Sun && self.previous == Mode::Eye && self.active {
                let flare = (PI * progress).sin().max(0.) * 24.;
                let dx = goal.x - WEATHER_CENTER[0];
                let dy = goal.y - WEATHER_CENTER[1];
                let inv = 1. / (dx * dx + dy * dy).sqrt().max(1.);
                goal.x += dx * inv * flare;
                goal.y += dy * inv * flare;
            }
            let mut cell = self.from[id].mix(goal, local_t);
            if self.active {
                let bend = (PI * progress).sin() * (random(self.seed, id as u32, 22) - 0.5);
                cell.x += bend * 18.;
                cell.y += bend * 8.;
            }
            self.pose[id] = cell;
            self.write(
                id,
                cell,
                0.,
                scale,
                origin,
                offset,
                self.weather_weight,
                width,
                height,
            );
        }
        self.rain(progress, scale, origin, offset, width, height);
    }

    #[allow(clippy::too_many_arguments)]
    fn write(
        &mut self,
        id: usize,
        cell: Cell,
        kind: f32,
        scale: f32,
        origin: [f32; 2],
        offset: [f32; 2],
        offset_weight: f32,
        width: f32,
        height: f32,
    ) {
        let row = &mut self.output[id * STRIDE..(id + 1) * STRIDE];
        let x = origin[0] + cell.x * scale + offset[0] * offset_weight;
        let y = origin[1] + cell.y * scale + offset[1] * offset_weight;
        row[0] = x.clamp(0., width);
        row[1] = y.clamp(0., height);
        row[2] = (cell.size * scale).clamp(0.5, 9.);
        row[3] = cell.red.clamp(0., 1.);
        row[4] = cell.green.clamp(0., 1.);
        row[5] = cell.blue.clamp(0., 1.);
        row[6] = if (0.0..=width).contains(&x) && (0.0..=height).contains(&y) {
            cell.alpha.clamp(0., 1.)
        } else {
            0.
        };
        row[7] = kind;
    }

    fn cloud_time(&self) -> f32 {
        if self.reduced {
            0.
        } else {
            (self.sim_time - self.cloud_start).max(0.) as f32
        }
    }

    fn stream_phase(&self, stream: Stream) -> f32 {
        if self.reduced {
            return stream.fall_seconds() * 0.55;
        }
        if self.target == Mode::Rain {
            (self.sim_time as f32 + stream.offset).rem_euclid(stream.period())
        } else {
            // Existing drops can finish after dismissal; no new wrapped cycle starts.
            ((self.transition_start as f32 + stream.offset).rem_euclid(stream.period()))
                + (self.sim_time - self.transition_start) as f32
        }
    }

    fn rain(
        &mut self,
        progress: f32,
        scale: f32,
        origin: [f32; 2],
        offset: [f32; 2],
        width: f32,
        height: f32,
    ) {
        let activity = if self.target == Mode::Rain {
            if self.active {
                ease(((progress - 0.35) / 0.35).clamp(0., 1.))
            } else {
                1.
            }
        } else if self.previous == Mode::Rain && self.active {
            1. - ease((progress / 0.24).clamp(0., 1.))
        } else {
            0.
        };
        for stream_id in 0..STREAM_COUNT {
            let stream = self.streams[stream_id];
            let phase = self.stream_phase(stream);
            let group = stream_id / 8;
            let x =
                stream.x + cloud_x(group, (self.cloud_time() - phase).max(0.)) - cloud_x(group, 0.);
            let head = stream.top + phase * stream.speed;
            for trail in 0..8 {
                let y = head - trail as f32 * 5.5;
                let alpha =
                    if phase <= stream.fall_seconds() && y >= stream.top && y <= stream.ground {
                        activity * (1. - trail as f32 * 0.055)
                    } else {
                        0.
                    };
                let cell = weather_ink(
                    x + (random(self.seed, (stream_id * 8 + trail) as u32, 52) - 0.5) * 1.2,
                    y.clamp(stream.top, stream.ground),
                    alpha,
                    self.seed,
                    BODY_COUNT + stream_id * 8 + trail,
                    0.65 + random(self.seed, stream_id as u32, 53) * 0.28,
                );
                self.write(
                    BODY_COUNT + stream_id * 8 + trail,
                    cell,
                    1.,
                    scale,
                    origin,
                    offset,
                    1.,
                    width,
                    height,
                );
            }
        }
        for ring in 0..8 {
            let stream = self.streams[ring * 4];
            let age = if self.reduced {
                0.28
            } else {
                self.stream_phase(stream) - stream.fall_seconds()
            };
            let group = ring / 2;
            let x = stream.x
                + cloud_x(
                    group,
                    (self.cloud_time() - self.stream_phase(stream)).max(0.),
                )
                - cloud_x(group, 0.);
            let visible = (0.0..=0.85).contains(&age);
            let phase = (age / 0.85).clamp(0., 1.);
            let radius = 10. + phase * 48.;
            for dot in 0..32 {
                let angle = 2. * PI * dot as f32 / 32.;
                let cell = weather_ink(
                    x + radius * angle.cos(),
                    stream.ground + radius * 0.20 * angle.sin(),
                    if visible {
                        activity * (1. - phase) * 0.85
                    } else {
                        0.
                    },
                    self.seed,
                    BODY_COUNT + DROP_COUNT + ring * 32 + dot,
                    0.72,
                );
                self.write(
                    BODY_COUNT + DROP_COUNT + ring * 32 + dot,
                    cell,
                    2.,
                    scale,
                    origin,
                    offset,
                    1.,
                    width,
                    height,
                );
            }
        }
    }

    pub fn particles(&self) -> &[f32] {
        &self.output
    }
    pub fn transition_active(&self) -> bool {
        self.active
    }
    pub fn generation(&self) -> u32 {
        self.generation
    }
}

fn finite(value: f32, fallback: f32) -> f32 {
    if value.is_finite() {
        value
    } else {
        fallback
    }
}
fn lerp(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}
fn ease(value: f32) -> f32 {
    let t = value.clamp(0., 1.);
    t * t * (3. - 2. * t)
}
fn random(seed: u32, index: u32, lane: u32) -> f32 {
    let mut x = seed ^ index.wrapping_mul(0x9e37_79b9) ^ lane.wrapping_mul(0x85eb_ca6b);
    x ^= x >> 16;
    x = x.wrapping_mul(0x7feb_352d);
    x ^= x >> 15;
    x = x.wrapping_mul(0x846c_a68b);
    x ^= x >> 16;
    (x >> 8) as f32 / 16_777_216.
}
fn bayer(x: usize, y: usize) -> f32 {
    const TABLE: [[u8; 4]; 4] = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    (TABLE[y % 4][x % 4] as f32 + 0.5) / 16.
}
fn band(distance: f32, width: f32) -> f32 {
    (-(distance * distance) / (width * width)).exp()
}
fn ellipse(x: f32, y: f32, cx: f32, cy: f32, rx: f32, ry: f32) -> f32 {
    ((x - cx) / rx).powi(2) + ((y - cy) / ry).powi(2)
}

fn rhythm(t: f32) -> f32 {
    // Gather, turn, settle: three continuous beats with no overshoot.
    if t < 0.18 {
        0.08 * ease(t / 0.18)
    } else if t < 0.76 {
        0.08 + 0.84 * ease((t - 0.18) / 0.58)
    } else {
        0.92 + 0.08 * ease((t - 0.76) / 0.24)
    }
}

fn matrix_ink(mut cell: Cell, tone: f32, threshold: f32) -> Cell {
    let level = ((tone.clamp(0., 1.) * 5. + threshold).floor() / 5.).min(1.);
    cell.red = lerp(0.012, 1., level);
    cell.green = lerp(0.014, 0.23, level);
    cell.blue = lerp(0.013, 0.20, level);
    cell
}

fn sunlight(seed: u32, time: f32) -> f32 {
    let cycle = (time / 6.).floor() as u32;
    let start = 0.3 + random(seed, cycle, 40) * 1.7;
    let phase = ((time.rem_euclid(6.) - start) / 2.8).clamp(0., 1.);
    (PI * phase).sin().powi(2)
}

fn sun_sphere_cell(id: usize, angle: f32) -> Cell {
    // Equal-area spiral avoids latitude rows and packed polar cells.
    let ny = 1. - 2. * (id as f32 + 0.5) / 3072.;
    let radius = (1. - ny * ny).sqrt();
    let longitude = id as f32 * 2.3999631 + angle;
    let nx = radius * longitude.cos();
    let nz = radius * longitude.sin();
    let x = 546. + nx * 116.;
    let y = 231. + ny * 116.;
    let light = (0.78 * nz - 0.32 * nx - 0.26 * ny).max(0.);
    matrix_ink(
        Cell::ink(x, y, 1.7, ease((nz - 0.08) / 0.22)),
        (0.21 + 0.80 * light).clamp(0., 1.),
        random(17, id as u32, 41),
    )
}

fn sun_cell(id: usize, seed: u32) -> Cell {
    if id < 3072 {
        sun_sphere_cell(id, 0.)
    } else if id < 7168 {
        let local = id - 3072;
        let row = local / 128;
        let col = local % 128;
        let yy = row as f32 / 31.;
        let y = 71. + yy * 283. + (random(seed, id as u32, 3) - 0.5) * 7.;
        let envelope = (1. - ((yy - 0.5) * 1.7).abs()).max(0.);
        let extent = 84. + envelope * 103. + random(seed, row as u32, 4) * 139.;
        let center = 509. + (row as f32 * 0.58).sin() * 47.;
        let u = col as f32 / 127.;
        let x = center + (u - 0.5) * extent * 2. + (random(seed, id as u32, 42) - 0.5) * 2.;
        let edge = ((u.min(1. - u)) * 7.).clamp(0., 1.);
        let density = edge * (0.10 + envelope * 0.30);
        let alpha = if random(seed, id as u32, 5) < density {
            0.55 + envelope * 0.4
        } else {
            0.
        };
        matrix_ink(
            Cell::ink(
                x,
                y,
                1.2 + random(seed, id as u32, 43) * 0.6,
                if alpha > 0. { 0.65 } else { 0. },
            ),
            0.30 + envelope * 0.50 + random(seed, row as u32, 17) * 0.18,
            bayer(col, row),
        )
    } else {
        let local = id - 7168;
        let col = local % 32;
        let row = local / 32;
        let x = 339. + col as f32 * 13.7;
        let y = 34. + row as f32 * 22.;
        let r = ellipse(x, y, 546., 222., 204., 190.);
        let alpha = if r < 1.2 && random(seed, id as u32, 6) < 0.30 {
            0.5
        } else {
            0.
        };
        matrix_ink(
            Cell::ink(x, y, 2.2 + random(seed, id as u32, 7) * 2.5, alpha),
            0.35 + random(seed, id as u32, 18) * 0.5,
            bayer(col, row),
        )
    }
}

fn cloud_noise(seed: u32, x: f32, y: f32) -> f32 {
    let ix = x.floor() as i32;
    let iy = y.floor() as i32;
    let sample = |dx: i32, dy: i32| random(seed, (ix + dx) as u32, (iy + dy) as u32);
    let tx = ease(x - x.floor());
    let ty = ease(y - y.floor());
    lerp(
        lerp(sample(0, 0), sample(1, 0), tx),
        lerp(sample(0, 1), sample(1, 1), tx),
        ty,
    )
}

fn cloud_x(group: usize, time: f32) -> f32 {
    let start = [410., 730., -155., 1240.][group];
    let speed = [7., -6., 9., -8.][group];
    (start + 220. + time * speed).rem_euclid(1528.) - 220.
}

fn weather_ink(x: f32, y: f32, alpha: f32, seed: u32, id: usize, tone: f32) -> Cell {
    matrix_ink(
        Cell::ink(x, y, 2.7 + random(seed, id as u32, 46) * 0.5, alpha),
        tone,
        random(seed, id as u32, 48),
    )
}

fn cloud_cell(id: usize, seed: u32) -> Cell {
    let group = id / CLOUD_CELLS;
    let local = id % CLOUD_CELLS;
    let col = local % 48;
    let row = local / 48;
    let x = (col as f32 - 23.5) * 7.2 + (random(seed, id as u32, 44) - 0.5) * 1.2;
    let y = (row as f32 - 19.5) * 5.0 + (random(seed, id as u32, 45) - 0.5) * 1.2;
    let shape_seed = seed ^ (group as u32 + 1).wrapping_mul(7919);
    // Separate opaque halftone clouds with independently eroded silhouettes.
    let broad = cloud_noise(shape_seed, x * 0.017, y * 0.019);
    let detail = cloud_noise(shape_seed ^ 73, x * 0.047, y * 0.047);
    let wx = x + (broad - 0.5) * 65.;
    let wy = y + (cloud_noise(shape_seed ^ 91, x * 0.016, y * 0.012) - 0.5) * 65.;
    let mass = ellipse(
        wx,
        wy,
        0.,
        0.,
        [145., 125., 138., 155.][group],
        [76., 59., 68., 72.][group],
    );
    let edge = 1.18 - mass + (detail - 0.5) * 0.50;
    let density = (edge * 1.8).clamp(0., 1.);
    let alpha = if random(seed, id as u32, 12) < density {
        1.
    } else {
        0.
    };
    weather_ink(
        x + cloud_x(group, 0.),
        y + CLOUD_Y[group],
        alpha,
        seed,
        id,
        0.56 + density * 0.28 + broad * 0.16,
    )
}

fn eye_sample(id: usize, seed: u32) -> EyeSample {
    let col = id % 128;
    let row = id / 128;
    let x = (col as f32 + 0.5 - 64.) / 60.;
    let y = (30. - row as f32 - 0.5) / 60.;
    let t = ((x + 0.77) / 1.5).clamp(0., 1.);
    let arch = (t * PI).sin().max(0.);
    let upper = 0.32 * arch.powf(0.88) * (1.19 - 0.42 * t) + 0.007 * (t * 17.).sin() * arch;
    let lower = -0.22 * arch.powf(1.15) * (0.72 + 0.38 * t);
    let brow = 0.44 + 0.06 * (t * 3.3).sin() - 0.05 * t;
    let mut skin = 0.34 + random(seed, id as u32, 14) * 0.11;
    skin += 0.23 * band(y - lower + 0.11, 0.15) * arch;
    skin -= 0.35 * band(y - upper - 0.055, 0.09) * arch;
    skin -= 0.19 * band(y - upper - 0.10 - 0.035 * (t * 3.).sin(), 0.017) * arch;
    skin += 0.11 * band(y - upper - 0.175, 0.046) * arch;
    if (0.05..0.97).contains(&t) {
        skin -= 0.24 * band(y - brow, 0.065);
    }
    EyeSample {
        x,
        y,
        arch,
        upper,
        lower,
        brow,
        skin,
        threshold: bayer(col, row),
    }
}

fn eye_cell(id: usize, sample: &EyeSample, gaze: [f32; 2], tissue: [f32; 2], closure: f32) -> Cell {
    let col = id % 128;
    let row = id / 128;
    let x = sample.x - tissue[0] * 0.52;
    let y = sample.y - tissue[1] * 0.58 + x * 0.075;
    let upper = sample.upper + tissue[1] * 0.8 * sample.arch;
    let lower = sample.lower + tissue[1] * 0.38 * sample.arch;
    let top = lerp(lower * 0.55, upper, 1. - closure);
    let bottom = lower * (0.55 + 0.45 * (1. - closure));
    let inside = (-0.77..0.745).contains(&x) && y <= top && y >= bottom;
    let mut value = sample.skin - 0.08 * band(y - sample.brow, 0.04);
    if inside {
        value = 0.86
            - 0.28 * (x.abs() / 0.8).powi(2)
            - 0.38 * band(y - top, 0.08)
            - 0.1 * band(y - bottom, 0.035);
        let qx = x - gaze[0] * 0.78 + 0.055;
        let qy = y - gaze[1] * 0.78 - 0.125;
        let radius_sq = qx * qx + qy * qy;
        if radius_sq < 0.278 * 0.278 {
            let radius = radius_sq.sqrt();
            let angle = qy.atan2(qx);
            value = 0.19
                + 0.12 * (angle * 61. + radius * 70.).sin()
                + 0.08 * (angle * 197. - radius * 46.).sin();
            value += 0.12 * band(radius - 0.16, 0.055) - 0.14 * band(radius - 0.265, 0.016);
            value -= 0.33 * band(y - top, 0.105);
            if qx.abs() < 0.105 && qy.abs() < 0.103 {
                value = 0.014;
            }
            value += 0.85
                * (-((qx + 0.072).powi(2) + ((qy - 0.055) * 1.8).powi(2)) / 0.029_f32.powi(2))
                    .exp();
        }
        value += 0.21 * band(y - bottom - 0.006, 0.007) * sample.arch;
    }
    value -= 0.34 * band(y - top, 0.013) * sample.arch;
    let ink = if ((value - 0.14) * 1.48).clamp(0., 1.) >= sample.threshold {
        1.
    } else {
        0.
    };
    let x = EYE_CENTER[0] + (col as f32 - 63.5) * 2.5;
    let y = EYE_CENTER[1] + (row as f32 - 29.5) * 2.5;
    Cell {
        x,
        y,
        size: 2.55,
        red: lerp(0.012, 1., ink),
        green: lerp(0.014, 0.23, ink),
        blue: lerp(0.013, 0.20, ink),
        alpha: 1.,
    }
}

fn blink(age: f32) -> f32 {
    if age < 0.09 {
        ease(age / 0.09)
    } else if age < 0.125 {
        1.
    } else if age < 0.3 {
        1. - ease((age - 0.125) / 0.175)
    } else {
        0.
    }
}

thread_local! { static ENGINE: RefCell<Engine> = RefCell::new(Engine::new(1)); }

/// Raw WASM ABI is synchronous and single-threaded. Re-read the pointer after
/// init; ordinary set_target/step never reallocate the output memory.
#[no_mangle]
pub extern "C" fn init(seed: u32) {
    ENGINE.with(|engine| *engine.borrow_mut() = Engine::new(seed));
}
#[no_mangle]
pub extern "C" fn set_target(mode: u32, generation: u32, reduced: u32) -> u32 {
    ENGINE.with(|engine| {
        u32::from(
            engine
                .borrow_mut()
                .set_target(mode, generation, reduced != 0),
        )
    })
}
#[no_mangle]
pub extern "C" fn step(
    time_ms: f64,
    width: f32,
    height: f32,
    center_x: f32,
    center_y: f32,
    gaze_x: f32,
    gaze_y: f32,
    paused: u32,
) {
    ENGINE.with(|engine| {
        engine.borrow_mut().step(
            time_ms,
            width,
            height,
            center_x,
            center_y,
            gaze_x,
            gaze_y,
            paused != 0,
        )
    });
}
#[no_mangle]
pub extern "C" fn positions_ptr() -> *const f32 {
    ENGINE.with(|engine| engine.borrow().output.as_ptr())
}
#[no_mangle]
pub extern "C" fn particle_count() -> u32 {
    PARTICLE_COUNT as u32
}
#[no_mangle]
pub extern "C" fn stride() -> u32 {
    STRIDE as u32
}
#[no_mangle]
pub extern "C" fn transition_active() -> u32 {
    ENGINE.with(|engine| u32::from(engine.borrow().transition_active()))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn advance(engine: &mut Engine, start: f64, duration: f64) {
        for frame in 0..=(duration / 33.333).ceil() as u32 {
            engine.step(
                start + frame as f64 * 33.333,
                1088.,
                608.,
                0.5,
                0.38,
                0.,
                0.,
                false,
            );
        }
    }
    fn visible(engine: &Engine, kind: f32) -> usize {
        engine
            .particles()
            .chunks_exact(STRIDE)
            .filter(|p| p[7] == kind && p[6] > 0.05)
            .count()
    }
    #[test]
    fn settled_sun_rotates_with_matrix_shades_and_fixed_storage() {
        let mut engine = Engine::new(19);
        engine.set_target(1, 1, false);
        advance(&mut engine, 0., 3400.);
        assert!(!engine.transition_active());
        let pointer = engine.output.as_ptr();
        let before = engine.particles()[..3072 * STRIDE].to_vec();
        advance(&mut engine, 3433., 1200.);
        assert_ne!(before, &engine.particles()[..3072 * STRIDE]);
        assert_eq!(pointer, engine.output.as_ptr());
        let shades: std::collections::BTreeSet<_> = engine.particles()[..3072 * STRIDE]
            .chunks_exact(STRIDE)
            .filter(|p| p[6] > 0.5)
            .map(|p| (p[3] * 255.) as u8)
            .collect();
        assert!(shades.len() >= 5);
        engine.set_target(1, 2, true);
        engine.step(4700., 1088., 608., 0.5, 0.38, 0., 0., false);
        let still = engine.particles().to_vec();
        advance(&mut engine, 4733., 800.);
        assert_eq!(still, engine.particles());
    }
    #[test]
    fn sunlight_is_soft_intermittent_and_seeded() {
        let mut starts = Vec::new();
        for cycle in 0..6 {
            let samples: Vec<_> = (0..60)
                .map(|i| sunlight(19, cycle as f32 * 6. + i as f32 * 0.1))
                .collect();
            assert!(samples.iter().all(|v| (0.0..=1.0).contains(v)));
            assert!(samples.iter().any(|v| *v > 0.95));
            assert!(samples.iter().filter(|v| **v < 0.01).count() > 20);
            starts.push(samples.iter().position(|v| *v > 0.1).unwrap());
        }
        assert!(starts.windows(2).any(|pair| pair[0] != pair[1]));
    }
    #[test]
    fn settled_clouds_and_sun_dust_drift_without_touching_sizes() {
        for mode in [1, 2] {
            let mut engine = Engine::new(19);
            engine.set_target(mode, 1, false);
            advance(&mut engine, 0., 4000.);
            let before = engine.particles().to_vec();
            advance(&mut engine, 4033., 1000.);
            let after = engine.particles();
            let start = if mode == 1 { 3072 } else { 0 };
            for id in start..7168 {
                let a = &before[id * STRIDE..(id + 1) * STRIDE];
                let b = &after[id * STRIDE..(id + 1) * STRIDE];
                assert!(b[2] < if mode == 1 { 2. } else { 3.3 });
                if a[6] == 0. || b[6] == 0. {
                    continue;
                }
                assert!(a[0] != b[0] || a[1] != b[1]);
                assert!((a[0] - b[0]).abs() < if mode == 1 { 3. } else { 10. });
                assert!((a[1] - b[1]).abs() < 1.);
            }
        }
    }
    #[test]
    fn distinct_clouds_enter_from_both_edges_and_remain_opaque() {
        assert!(cloud_x(2, 0.) < 0. && cloud_x(2, 24.) > 0.);
        assert!(cloud_x(3, 0.) > REFERENCE_W && cloud_x(3, 24.) < REFERENCE_W);
        assert!(cloud_x(0, 1.) > cloud_x(0, 0.));
        assert!(cloud_x(1, 1.) < cloud_x(1, 0.));
        for group in 0..4 {
            let cells: Vec<_> = (group * CLOUD_CELLS..(group + 1) * CLOUD_CELLS)
                .map(|id| cloud_cell(id, 19))
                .filter(|cell| cell.alpha > 0.)
                .collect();
            assert!(cells.len() > 500);
            assert!(cells
                .iter()
                .all(|cell| cell.alpha == 1. && cell.size >= 2.7 && cell.size <= 3.2));
        }
        let rain = weather_ink(0., 0., 1., 19, BODY_COUNT, 0.8);
        assert!(rain.size >= 2.7 && rain.size <= 3.2);
    }
    #[test]
    fn rain_recycles_until_dismissed_without_growing_memory() {
        let mut engine = Engine::new(19);
        engine.set_target(2, 1, false);
        advance(&mut engine, 0., 3400.);
        let pointer = engine.output.as_ptr();
        for cycle in 0..12 {
            advance(&mut engine, 3433. + cycle as f64 * 2000., 1967.);
            assert!(visible(&engine, 1.) > 0);
            assert_eq!(pointer, engine.output.as_ptr());
        }
        engine.set_target(0, 2, true);
        engine.step(28000., 1088., 608., 0.5, 0.38, 0., 0., false);
        assert_eq!(visible(&engine, 1.), 0);
        assert_eq!(visible(&engine, 2.), 0);
    }
    #[test]
    fn fixed_budget_and_finite_bounds_hold_for_invalid_inputs() {
        assert_eq!(PARTICLE_COUNT, 8192);
        let mut engine = Engine::new(17);
        engine.set_target(2, 1, true);
        engine.step(
            f64::NAN,
            f32::INFINITY,
            f32::NAN,
            f32::NEG_INFINITY,
            f32::NAN,
            f32::INFINITY,
            f32::NAN,
            false,
        );
        assert_eq!(engine.particles().len(), PARTICLE_COUNT * STRIDE);
        for particle in engine.particles().chunks_exact(STRIDE) {
            assert!(particle.iter().all(|n| n.is_finite()));
            assert!((0.0..=1088.).contains(&particle[0]));
            assert!((0.0..=608.).contains(&particle[1]));
            assert!((0.0..=1.).contains(&particle[6]));
        }
    }
    #[test]
    fn seed_is_deterministic_and_changes_authored_distribution() {
        let mut a = Engine::new(9);
        let mut b = Engine::new(9);
        let mut c = Engine::new(10);
        for engine in [&mut a, &mut b, &mut c] {
            engine.set_target(1, 1, true);
            engine.step(0., 1088., 608., 0.5, 0.38, 0., 0., false);
        }
        assert_eq!(a.particles(), b.particles());
        assert_ne!(a.particles(), c.particles());
    }
    #[test]
    fn eye_sun_and_cloud_have_real_distinct_geometry() {
        let mut engine = Engine::new(7);
        engine.step(0., 1088., 608., 0.5, 0.38, 0., 0., false);
        assert_eq!(visible(&engine, 0.), BODY_COUNT);
        let eye = engine.particles().to_vec();
        engine.set_target(1, 1, true);
        engine.step(1., 1088., 608., 0.5, 0.38, 0., 0., false);
        let sun = engine.particles().to_vec();
        assert!(visible(&engine, 0.) > 1500);
        engine.set_target(2, 2, true);
        engine.step(2., 1088., 608., 0.5, 0.38, 0., 0., false);
        assert!(visible(&engine, 0.) > 800);
        assert_ne!(eye, sun);
        assert_ne!(sun, engine.particles());
    }
    #[test]
    fn reduced_motion_is_immediate_and_static() {
        let mut engine = Engine::new(4);
        engine.set_target(2, 1, true);
        engine.step(1000., 1088., 608., 0.5, 0.38, 0., 0., false);
        assert!(!engine.transition_active());
        let before = engine.particles().to_vec();
        engine.step(50000., 1088., 608., 0.5, 0.38, 1., -1., false);
        assert_eq!(before, engine.particles());
    }
    #[test]
    fn paused_step_freezes_exact_visible_state() {
        let mut engine = Engine::new(4);
        engine.set_target(2, 1, false);
        advance(&mut engine, 0., 7000.);
        let before = engine.particles().to_vec();
        engine.step(10000., 400., 300., 1., 1., 1., 1., true);
        assert_eq!(before, engine.particles());
    }
    #[test]
    fn stale_generation_and_invalid_mode_cannot_revive_weather() {
        let mut engine = Engine::new(1);
        assert!(engine.set_target(1, 1, false));
        assert!(engine.set_target(0, 2, false));
        assert!(!engine.set_target(2, 1, false));
        assert!(!engine.set_target(99, 3, false));
        assert_eq!(engine.generation(), 2);
    }
    #[test]
    fn canonical_timing_and_interrupted_return_are_bounded() {
        let mut engine = Engine::new(1);
        engine.set_target(1, 1, false);
        advance(&mut engine, 0., 2000.);
        assert!(engine.transition_active());
        engine.set_target(0, 2, false);
        advance(&mut engine, 2033.333, 1000.);
        assert!(!engine.transition_active());
        engine.set_target(2, 3, false);
        advance(&mut engine, 3100., 6100.);
        assert!(!engine.transition_active());
    }
    #[test]
    fn droplets_fall_and_impacts_create_expanding_ripples() {
        let mut engine = Engine::new(33);
        engine.set_target(2, 1, false);
        advance(&mut engine, 0., 7000.);
        let first = engine.particles()[BODY_COUNT * STRIDE..].to_vec();
        let mut saw_drops = false;
        let mut saw_ripples = false;
        for frame in 0..100 {
            engine.step(
                7033.333 + frame as f64 * 33.333,
                1088.,
                608.,
                0.5,
                0.38,
                0.,
                0.,
                false,
            );
            saw_drops |= visible(&engine, 1.) > 0;
            saw_ripples |= visible(&engine, 2.) > 0;
        }
        assert!(saw_drops && saw_ripples);
        assert_ne!(first, &engine.particles()[BODY_COUNT * STRIDE..]);
    }
    #[test]
    fn pointer_changes_eye_without_rebuilding_identity() {
        let mut engine = Engine::new(5);
        advance(&mut engine, 0., 500.);
        let before = engine.particles().to_vec();
        for i in 0..12 {
            engine.step(
                533. + i as f64 * 33.,
                1088.,
                608.,
                0.5,
                0.38,
                1.,
                -1.,
                false,
            );
        }
        assert_ne!(before, engine.particles());
        assert_eq!(engine.particles().len(), PARTICLE_COUNT * STRIDE);
    }
    #[test]
    fn repeated_revisions_do_not_grow_storage_or_leave_rain_after_dismissal() {
        let mut engine = Engine::new(5);
        let pointer = engine.output.as_ptr();
        let capacity = engine.output.capacity();
        for generation in 1..401 {
            engine.set_target(generation % 3, generation, true);
            engine.step(
                generation as f64 * 33.,
                1088.,
                608.,
                0.5,
                0.38,
                0.,
                0.,
                false,
            );
            assert_eq!(pointer, engine.output.as_ptr());
            assert_eq!(capacity, engine.output.capacity());
        }
        engine.set_target(0, 401, true);
        engine.step(20000., 1088., 608., 0.5, 0.38, 0., 0., false);
        assert_eq!(visible(&engine, 1.), 0);
        assert_eq!(visible(&engine, 2.), 0);
    }
}
