use crate::math::{noise, smooth, V3};
use std::f32::consts::TAU;

pub const STRIDE: usize = 12;
pub const MAX_VERTICES: usize = 240_000;
#[derive(Clone, Copy, Debug)]
pub struct Vertex {
    pub p: V3,
    pub n: V3,
    pub uv: [f32; 2],
}
impl Vertex {
    fn mix(self, b: Self, t: f32) -> Self {
        Self {
            p: self.p.lerp(b.p, t),
            n: self.n.lerp(b.n, t),
            uv: [
                self.uv[0] + (b.uv[0] - self.uv[0]) * t,
                self.uv[1] + (b.uv[1] - self.uv[1]) * t,
            ],
        }
    }
}
#[derive(Clone, Debug)]
pub struct Strand {
    pub points: Vec<V3>,
    pub light: f32,
    pub delay: f32,
    pub detail: bool,
}
#[derive(Clone, Debug)]
pub struct Object {
    pub id: String,
    pub material: f32,
    pub light: f32,
    pub start: f32,
    pub vertices: Vec<Vertex>,
    pub strands: Vec<Strand>,
}
impl Object {
    pub fn new(id: &str, material: f32, light: f32, start: f32) -> Self {
        Self {
            id: id.into(),
            material,
            light,
            start,
            vertices: Vec::new(),
            strands: Vec::new(),
        }
    }
    pub fn scale_about(&mut self, c: V3, s: V3) {
        let scale = |p: V3| {
            let d = p - c;
            c + V3(d.0 * s.0, d.1 * s.1, d.2 * s.2)
        };
        for v in &mut self.vertices {
            v.p = scale(v.p);
            v.n = V3(v.n.0 / s.0, v.n.1 / s.1, v.n.2 / s.2).unit();
        }
        for strand in &mut self.strands {
            for p in &mut strand.points {
                *p = scale(*p);
            }
        }
    }
    pub fn strand(&mut self, points: Vec<V3>, light: f32, detail: bool) {
        if points.len() > 1 {
            let delay = noise(33, self.strands.len() as u32) * 0.14;
            self.strands.push(Strand {
                points,
                light,
                delay,
                detail,
            });
        }
    }
    pub fn line(&mut self, a: V3, b: V3, light: f32) {
        self.strand(vec![a, b], light, false);
    }
    pub fn surface<F: Fn(f32, f32) -> V3>(&mut self, nu: usize, nv: usize, uv: [f32; 2], f: F) {
        let at = |u: f32, v: f32| {
            let p = f(u, v);
            let du = f((u + 0.0005).min(1.0), v) - f((u - 0.0005).max(0.0), v);
            let dv = f(u, (v + 0.0005).min(1.0)) - f(u, (v - 0.0005).max(0.0));
            Vertex {
                p,
                n: du.cross(dv).unit(),
                uv: [u * uv[0], v * uv[1]],
            }
        };
        if nu == 0 || nv == 0 {
            return;
        }
        self.vertices.reserve(nu * nv * 6);
        // Adjacent quads share samples and finite-difference normals. Keep only
        // two rows, not a second full mesh, and preserve triangle order exactly.
        let mut row: Vec<_> = (0..=nu).map(|x| at(x as f32 / nu as f32, 0.0)).collect();
        let mut next = row.clone();
        for y in 0..nv {
            for (x, vertex) in next.iter_mut().enumerate() {
                *vertex = at(x as f32 / nu as f32, (y + 1) as f32 / nv as f32);
            }
            for x in 0..nu {
                let (a, b, c, d) = (row[x], row[x + 1], next[x + 1], next[x]);
                self.vertices.extend([a, b, c, a, c, d]);
            }
            std::mem::swap(&mut row, &mut next);
        }
    }
    pub fn quad(&mut self, a: V3, b: V3, c: V3, d: V3, uv: [f32; 2], grid: usize) {
        self.surface(grid, grid, uv, |u, v| a.lerp(b, u).lerp(d.lerp(c, u), v));
        self.strand(vec![a, b, c, d, a], self.light * 0.75, false);
    }
    pub fn tube(&mut self, points: &[V3], radius: f32, sides: usize, uv: [f32; 2], wire: bool) {
        self.tapered_tube(points, [radius, radius], sides, uv, wire);
    }
    pub fn tapered_tube(
        &mut self,
        points: &[V3],
        radii: [f32; 2],
        sides: usize,
        uv: [f32; 2],
        wire: bool,
    ) {
        if points.len() < 2 {
            return;
        }
        let count = points.len() - 1;
        self.surface(sides, count, uv, |u, v| {
            let i = ((v * count as f32).floor() as usize).min(count - 1);
            let p = points[i].lerp(points[i + 1], v * count as f32 - i as f32);
            let t = (points[i + 1] - points[i]).unit();
            let ref_axis = if t.1.abs() > 0.9 {
                V3(1.0, 0.0, 0.0)
            } else {
                V3(0.0, 1.0, 0.0)
            };
            let n = t.cross(ref_axis).unit();
            let b = t.cross(n).unit();
            let radius = radii[0] + (radii[1] - radii[0]) * v;
            p + (n * (u * TAU).cos() + b * (u * TAU).sin()) * radius
        });
        if wire {
            self.strand(points.to_vec(), self.light, false);
        }
    }
    pub fn ellipsoid(&mut self, c: V3, r: V3, nu: usize, nv: usize, uv: [f32; 2]) {
        let f = |u: f32, v: f32| {
            let a = u * TAU;
            let b = (v - 0.5) * std::f32::consts::PI;
            c + V3(
                r.0 * a.cos() * b.cos(),
                r.1 * b.sin(),
                r.2 * a.sin() * b.cos(),
            )
        };
        self.surface(nu, nv, uv, f);
        for j in 0..4 {
            self.strand(
                (0..=24)
                    .map(|i| f(j as f32 / 4.0, i as f32 / 24.0))
                    .collect(),
                self.light * 0.8,
                false,
            );
        }
        self.strand(
            (0..=32).map(|i| f(i as f32 / 32.0, 0.5)).collect(),
            self.light * 0.65,
            false,
        );
    }
    pub fn lathe(&mut self, c: V3, profile: &[(f32, f32)], segments: usize, uv: [f32; 2]) {
        let rings = profile.len() - 1;
        let f = |u: f32, v: f32| {
            let i = ((v * rings as f32).floor() as usize).min(rings - 1);
            let t = v * rings as f32 - i as f32;
            let r = profile[i].0 + (profile[i + 1].0 - profile[i].0) * t;
            let y = profile[i].1 + (profile[i + 1].1 - profile[i].1) * t;
            c + V3(r * (u * TAU).cos(), y, r * (u * TAU).sin())
        };
        let mut distances = vec![0.0];
        for pair in profile.windows(2) {
            let dr = pair[1].0 - pair[0].0;
            let dy = pair[1].1 - pair[0].1;
            distances.push(distances.last().unwrap() + (dr * dr + dy * dy).sqrt());
        }
        let total = distances[rings].max(0.00001);
        let first = self.vertices.len();
        self.surface(segments, rings, uv, f);
        // Uniform cells along the actual profile: tiny ceramic/glass lips must not
        // receive the same number of bead rows as the entire vessel wall.
        for vertex in &mut self.vertices[first..] {
            let v = vertex.uv[1] / uv[1] * rings as f32;
            let i = (v.floor() as usize).min(rings - 1);
            let distance = distances[i] + (distances[i + 1] - distances[i]) * (v - i as f32);
            vertex.uv[1] = distance / total * uv[1];
        }
        for j in 0..=rings {
            if j == 0 || j == rings || j % 3 == 0 {
                self.strand(
                    (0..=segments)
                        .map(|i| f(i as f32 / segments as f32, j as f32 / rings as f32))
                        .collect(),
                    self.light,
                    false,
                );
            }
        }
        for j in 0..8 {
            self.strand(
                (0..=rings)
                    .map(|i| f(j as f32 / 8.0, i as f32 / rings as f32))
                    .collect(),
                self.light * 0.6,
                false,
            );
        }
    }
}

#[derive(Default)]
pub struct Frame {
    pub triangles: Vec<f32>,
    pub lines: Vec<f32>,
    pub objects: usize,
    pub surfaces: usize,
    pub segments: usize,
    pub tiles: usize,
}
impl Frame {
    pub fn reset(&mut self) {
        self.triangles.clear();
        self.lines.clear();
        self.objects = 0;
        self.surfaces = 0;
        self.segments = 0;
        self.tiles = 0;
    }
    fn push(out: &mut Vec<f32>, v: Vertex, material: f32, detail: f32, light: f32, seed: f32) {
        out.extend([
            v.p.0, v.p.1, v.p.2, v.n.0, v.n.1, v.n.2, v.uv[0], v.uv[1], material, detail, light,
            seed,
        ]);
    }
    pub fn object(&mut self, o: &Object, p: f32, seed: u32) {
        let wire = ((p - o.start) / 0.34).clamp(0.0, 1.0);
        let form = ((p - o.start - 0.24) / 0.34).clamp(0.0, 1.0);
        let detail = smooth((p - o.start - 0.52) / 0.30);
        if wire <= 0.0 {
            return;
        }
        self.objects += 1;
        // The CPU submits only born triangles. A partially born triangle grows from
        // its first authored vertex; no render-to-image or full-scene alpha exists.
        let count = o.vertices.len() / 3;
        let complete = (form * count as f32).floor() as usize;
        for tri in o.vertices[..complete * 3].chunks_exact(3) {
            for v in tri {
                Self::push(
                    &mut self.triangles,
                    *v,
                    o.material,
                    detail,
                    o.light,
                    seed as f32,
                );
            }
        }
        if complete < count && form > 0.0 {
            let t = smooth(form * count as f32 - complete as f32);
            let tri = &o.vertices[complete * 3..complete * 3 + 3];
            for v in [tri[0], tri[0].mix(tri[1], t), tri[0].mix(tri[2], t)] {
                Self::push(
                    &mut self.triangles,
                    v,
                    o.material,
                    detail,
                    o.light,
                    seed as f32,
                );
            }
        }
        self.surfaces += complete;
        for s in &o.strands {
            let q = if s.detail {
                detail
            } else {
                ((wire - s.delay) / (1.0 - s.delay)).clamp(0.0, 1.0)
            };
            let n = s.points.len() - 1;
            let extent = q * n as f32;
            for j in 0..n {
                let t = (extent - j as f32).clamp(0.0, 1.0);
                if t <= 0.0 {
                    break;
                }
                let a = s.points[j];
                let b = a.lerp(s.points[j + 1], t);
                // Tiny bias keeps a surface's own structural edge visible, not geometry behind it.
                let vertex = |p: V3, u: f32| Vertex {
                    p: p * 0.9998,
                    n: V3(0.0, 0.0, -1.0),
                    uv: [u, 0.0],
                };
                let settled = if o.material == 5.0 {
                    0.92
                } else if o.material == 1.0 || o.material == 4.0 {
                    0.18
                } else {
                    0.48
                };
                let l = s.light * (1.0 - (1.0 - settled) * detail);
                Self::push(
                    &mut self.lines,
                    vertex(a, j as f32),
                    -1.0,
                    detail,
                    l,
                    seed as f32,
                );
                Self::push(
                    &mut self.lines,
                    vertex(b, j as f32 + t),
                    -1.0,
                    detail,
                    l,
                    seed as f32,
                );
                self.segments += 1;
            }
        }
    }
    pub fn valid(&self) -> bool {
        self.triangles.len() % (STRIDE * 3) == 0
            && self.lines.len() % (STRIDE * 2) == 0
            && (self.triangles.len() + self.lines.len()) / STRIDE <= MAX_VERTICES
            && self
                .triangles
                .iter()
                .chain(&self.lines)
                .all(|v| v.is_finite())
    }
}
