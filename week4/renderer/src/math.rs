use std::ops::{Add, Div, Mul, Sub};

pub const ASPECT: f32 = 2752.0 / 1536.0;
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct V3(pub f32, pub f32, pub f32);
impl Add for V3 {
    type Output = Self;
    fn add(self, r: Self) -> Self {
        Self(self.0 + r.0, self.1 + r.1, self.2 + r.2)
    }
}
impl Sub for V3 {
    type Output = Self;
    fn sub(self, r: Self) -> Self {
        Self(self.0 - r.0, self.1 - r.1, self.2 - r.2)
    }
}
impl Mul<f32> for V3 {
    type Output = Self;
    fn mul(self, s: f32) -> Self {
        Self(self.0 * s, self.1 * s, self.2 * s)
    }
}
impl Div<f32> for V3 {
    type Output = Self;
    fn div(self, s: f32) -> Self {
        self * (1.0 / s)
    }
}
impl V3 {
    pub fn dot(self, r: Self) -> f32 {
        self.0 * r.0 + self.1 * r.1 + self.2 * r.2
    }
    pub fn cross(self, r: Self) -> Self {
        Self(
            self.1 * r.2 - self.2 * r.1,
            self.2 * r.0 - self.0 * r.2,
            self.0 * r.1 - self.1 * r.0,
        )
    }
    pub fn length(self) -> f32 {
        self.dot(self).sqrt()
    }
    pub fn unit(self) -> Self {
        self / self.length().max(1e-8)
    }
    pub fn lerp(self, b: Self, t: f32) -> Self {
        self + (b - self) * t
    }
    pub fn finite(self) -> bool {
        self.0.is_finite() && self.1.is_finite() && self.2.is_finite()
    }
}
// Authored screen anchors are unprojected once into a fixed perspective volume.
// They are design parameters, never sampled image pixels or pixel-colored point clouds.
pub fn anchor(x: f32, y: f32, z: f32) -> V3 {
    V3((x - 0.5) * z, (0.5 - y) * z / ASPECT, z)
}
pub fn project(p: V3) -> [f32; 2] {
    [0.5 + p.0 / p.2, 0.5 - ASPECT * p.1 / p.2]
}
pub fn smooth(t: f32) -> f32 {
    let t = t.clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}
pub fn noise(seed: u32, n: u32) -> f32 {
    let mut x = seed.wrapping_add(n.wrapping_mul(0x9e3779b9));
    x = (x ^ (x >> 16)).wrapping_mul(0x7feb352d);
    x = (x ^ (x >> 15)).wrapping_mul(0x846ca68b);
    ((x ^ (x >> 16)) >> 8) as f32 / 16777216.0
}
