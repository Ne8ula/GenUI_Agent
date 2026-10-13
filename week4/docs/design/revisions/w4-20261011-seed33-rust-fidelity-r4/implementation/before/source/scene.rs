use crate::gait;
use crate::geometry::{Frame, Object};
use crate::math::{anchor, noise, V3};
use std::f32::consts::{PI, TAU};

pub const SCENE_ID: &str = "scene:paris-1980s-terrace";
pub const TILE_COUNT: usize = 22;
const CUP_CENTER: V3 = V3(0.416, -0.482, 2.08);
const CUP_RIM_HEIGHT: f32 = 0.242 * 0.81;
pub(crate) fn steam_point(life: f32, strand: usize, progress: f32) -> V3 {
    CUP_CENTER
        + V3(
            0.014 * (progress * 8.0 + life * 0.6 + strand as f32).sin(),
            CUP_RIM_HEIGHT + progress * 0.17,
            strand as f32 * 0.006,
        )
}
pub struct Scene {
    pub seed: u32,
    pub density: f32,
    pub objects: Vec<Object>,
}
impl Scene {
    pub fn new(seed: u32, density: f32) -> Result<Self, String> {
        if seed > 9999 || !density.is_finite() || !(0.5..=2.0).contains(&density) {
            return Err("seed/density outside renderer bounds".into());
        }
        let mut scene = Self {
            seed,
            density,
            objects: Vec::new(),
        };
        scene.architecture();
        scene.furniture();
        scene.lamps();
        Ok(scene)
    }
    fn architecture(&mut self) {
        let mut sky = Object::new("layer:sky", 6.0, 1.0, 0.14);
        sky.quad(
            anchor(-0.1, -0.2, 24.0),
            anchor(1.1, -0.2, 24.0),
            anchor(1.1, 0.28, 24.0),
            anchor(-0.1, 0.28, 24.0),
            [1.0, 1.0],
            16,
        );
        sky.strands.clear();
        self.objects.push(sky);
        let mut back = Object::new("obj:far-roof", 0.0, 0.24, 0.18);
        back.quad(
            anchor(0.447, 0.233, 16.0),
            anchor(0.65, 0.233, 16.0),
            anchor(0.65, 0.76, 16.0),
            anchor(0.447, 0.76, 16.0),
            [130.0, 160.0],
            12,
        );
        for (i, x) in [0.475, 0.531].iter().enumerate() {
            let a = anchor(*x, 0.21, 15.8);
            let b = anchor(x + 0.013, 0.21, 15.8);
            let c = anchor(x + 0.013, 0.24, 15.8);
            let d = anchor(*x, 0.24, 15.8);
            back.quad(a, b, c, d, [7.0, 12.0], 2);
            for j in 0..3 {
                let x = x + 0.002 + j as f32 * 0.004;
                back.quad(
                    anchor(x, 0.197 - j as f32 * 0.002, 15.75),
                    anchor(x + 0.002, 0.197 - j as f32 * 0.002, 15.75),
                    anchor(x + 0.002, 0.212, 15.75),
                    anchor(x, 0.212, 15.75),
                    [2.0, 5.0],
                    1,
                );
            }
            let _ = i;
        }
        self.objects.push(back);
        for side in 0..2 {
            let (a, b, c, d) = if side == 0 {
                (
                    anchor(-0.15, -1.65, 2.8),
                    anchor(0.46, 0.232, 12.0),
                    anchor(0.453, 0.62, 12.0),
                    anchor(-0.15, 1.30, 2.8),
                )
            } else {
                (
                    anchor(1.12, -1.50, 3.1),
                    anchor(0.615, 0.228, 13.0),
                    anchor(0.618, 0.68, 13.0),
                    anchor(1.12, 1.36, 3.1),
                )
            };
            let point = |u: f32, v: f32| a.lerp(b, u).lerp(d.lerp(c, u), v);
            let mut wall = Object::new(
                &format!("obj:facade-{side}"),
                0.0,
                if side == 0 { 0.65 } else { 0.42 },
                0.10 + side as f32 * 0.02,
            );
            let normal = (b - a).cross(d - a).unit() * if side == 0 { 1.0 } else { -1.0 };
            let patch = |wall: &mut Object, u0: f32, v0: f32, u1: f32, v1: f32| {
                let first = wall.vertices.len();
                wall.surface(2, 2, [1.0, 1.0], |u, v| {
                    point(u0 + (u1 - u0) * u, v0 + (v1 - v0) * v)
                });
                for vertex in &mut wall.vertices[first..] {
                    vertex.uv = [
                        (u0 + (u1 - u0) * vertex.uv[0]) * 420.0 * self.density,
                        (v0 + (v1 - v0) * vertex.uv[1]) * 240.0 * self.density,
                    ];
                }
            };
            wall.strand(vec![a, b, c, d, a], 0.30, false);
            // Openings are omitted from the wall mesh. Returns connect that plane
            // to inset windows; no dark coplanar plate pretends to be a recess.
            // Cornices and pilasters are separate relief strips, not painted image bands.
            for floor in 0..=4 {
                let v = floor as f32 / 4.0;
                let mut cornice = Object::new(
                    &format!("obj:facade-{side}/cornice-{floor}"),
                    0.0,
                    0.85,
                    wall.start + 0.02,
                );
                for profile in [
                    (0.0, 0.0, 0.003, 0.045),
                    (0.003, 0.045, 0.008, 0.045),
                    (0.008, 0.045, 0.012, 0.015),
                ] {
                    cornice.quad(
                        point(0.0, v + profile.0) + normal * profile.1,
                        point(1.0, v + profile.0) + normal * profile.1,
                        point(1.0, v + profile.2) + normal * profile.3,
                        point(0.0, v + profile.2) + normal * profile.3,
                        [380.0, 3.0],
                        2,
                    );
                }
                cornice.strands.clear();
                cornice.line(
                    point(0.0, v + 0.003) + normal * 0.045,
                    point(1.0, v + 0.003) + normal * 0.045,
                    0.12,
                );
                self.objects.push(cornice);
            }
            for part in 0..10 {
                let u = part as f32 / 10.0;
                let next = (part + 1) as f32 / 10.0;
                let lift = V3(0.0, 0.10 + noise(self.seed, part + side * 50) * 0.16, 0.0);
                let mut roof = Object::new(
                    &format!("obj:facade-{side}/roof-{part}"),
                    11.0,
                    0.04,
                    wall.start + 0.03,
                );
                roof.quad(
                    point(u, 0.0) + lift,
                    point(next, 0.0) + lift,
                    point(next, 0.0),
                    point(u, 0.0),
                    [45.0, 8.0],
                    2,
                );
                roof.line(point(u, 0.0) + lift, point(next, 0.0) + lift, 0.24);
                self.objects.push(roof);
            }
            for col in 0..13 {
                let bay = noise(self.seed + 17, col + side * 31);
                let u = col as f32 / 13.0;
                if col % 3 == 0 {
                    let mut pier = Object::new(
                        &format!("obj:facade-{side}/pilaster-{col}"),
                        0.0,
                        0.85,
                        wall.start + 0.02,
                    );
                    for (l, r, depth) in [(u, u + 0.006, 0.035), (u + 0.001, u + 0.005, 0.060)] {
                        pier.quad(
                            point(l, 0.0) + normal * depth,
                            point(r, 0.0) + normal * depth,
                            point(r, 1.0) + normal * depth,
                            point(l, 1.0) + normal * depth,
                            [5.0, 240.0],
                            2,
                        );
                    }
                    pier.strands.clear();
                    pier.line(
                        point(u, 0.0) + normal * 0.035,
                        point(u, 1.0) + normal * 0.035,
                        0.14,
                    );
                    self.objects.push(pier);
                }
                for row in 0..4 {
                    let v = row as f32 * 0.245 + 0.036 + (bay - 0.5) * 0.009;
                    let u0 = u + 0.010 + bay * 0.008;
                    let u1 = u + 0.058 + bay * 0.009;
                    let v1 = v + 0.153 + bay * 0.017;
                    let next = (col + 1) as f32 / 13.0;
                    let top = row as f32 * 0.245;
                    let bottom = if row == 3 {
                        1.0
                    } else {
                        (row + 1) as f32 * 0.245
                    };
                    patch(&mut wall, u, top, next, v);
                    patch(&mut wall, u, v1, next, bottom);
                    patch(&mut wall, u, v, u0, v1);
                    patch(&mut wall, u1, v, next, v1);
                    let mut window = Object::new(
                        &format!("obj:facade-{side}/window-{col}-{row}"),
                        11.0,
                        0.06,
                        wall.start + 0.025,
                    );
                    let depth = 0.075 + bay * 0.045;
                    let q = |u, v| point(u, v) - normal * depth;
                    window.quad(q(u0, v), q(u1, v), q(u1, v1), q(u0, v1), [14.0, 36.0], 1);
                    window.strands.clear();
                    let edge_light = if side == 0 {
                        if (5..=10).contains(&col) {
                            0.85 + bay * 0.45
                        } else {
                            0.08 + bay * 0.10
                        }
                    } else {
                        0.10 + bay * 0.17
                    };
                    // Narrow relief surfaces carry selective light; the recess stays dark.
                    let mut jamb = Object::new(
                        &format!("obj:facade-{side}/jamb-{col}-{row}"),
                        0.0,
                        if side == 0 { 1.35 } else { 0.46 },
                        wall.start + 0.025,
                    );
                    for edge in [u0, u1] {
                        jamb.quad(
                            point(edge, v),
                            q(edge, v),
                            q(edge, v1),
                            point(edge, v1),
                            [8.0, 80.0],
                            2,
                        );
                    }
                    for edge in [v, v1] {
                        jamb.quad(
                            point(u0, edge),
                            point(u1, edge),
                            q(u1, edge),
                            q(u0, edge),
                            [30.0, 8.0],
                            2,
                        );
                    }
                    // Projecting sill and lintel have horizontal and vertical faces.
                    for (edge, overhang) in [(v - 0.007, 0.055), (v1, 0.09)] {
                        let l = u0 - 0.005;
                        let r = u1 + 0.005;
                        jamb.quad(
                            point(l, edge),
                            point(r, edge),
                            point(r, edge) + normal * overhang,
                            point(l, edge) + normal * overhang,
                            [36.0, 6.0],
                            2,
                        );
                        jamb.quad(
                            point(l, edge) + normal * overhang,
                            point(r, edge) + normal * overhang,
                            point(r, edge + 0.007) + normal * overhang,
                            point(l, edge + 0.007) + normal * overhang,
                            [36.0, 4.0],
                            2,
                        );
                    }
                    jamb.strands.clear();
                    jamb.line(point(u0, v), point(u0, v1), edge_light * 0.22);
                    self.objects.push(jamb);
                    for (index, edge) in [u0 - 0.004, u0, u1, u1 + 0.004, (u0 + u1) * 0.5]
                        .iter()
                        .enumerate()
                    {
                        let light = edge_light * if index == 1 || index == 3 { 0.38 } else { 1.0 };
                        window.line(q(*edge, v), q(*edge, v1), light);
                    }
                    for edge in [v, v + 0.085, v1] {
                        window.line(q(u0, edge), q(u1, edge), edge_light * 0.27);
                    }
                    if col % 4 == 1 && row < 3 {
                        // Half-open slatted shutters vary by bay, not a uniform facade grid.
                        for slat in 0..10 {
                            let y = v + (v1 - v) * slat as f32 / 10.0;
                            window.line(q(u0, y), q(u0 + (u1 - u0) * 0.28, y), edge_light * 0.35);
                        }
                    }
                    // Balcony rails and projecting sill.
                    if row < 3 && (col + row) % 3 != 0 {
                        let rail_at = |u, v| point(u, v) + normal * 0.13;
                        window.line(
                            rail_at(u0, v1 - 0.026),
                            rail_at(u1, v1 - 0.026),
                            edge_light * 0.20,
                        );
                        for rail in 0..7 {
                            let u = u0 + (u1 - u0) * rail as f32 / 6.0;
                            window.strand(
                                (0..=8)
                                    .map(|i| {
                                        let t = i as f32 / 8.0;
                                        rail_at(
                                            u + 0.0018 * (t * TAU).sin(),
                                            v1 - 0.026 + t * 0.036,
                                        )
                                    })
                                    .collect(),
                                edge_light * 0.18,
                                false,
                            );
                        }
                    }
                    self.objects.push(window);
                }
            }
            for j in 0..210 {
                let u = j as f32 / 210.0;
                if noise(self.seed, j + side * 300) > if side == 0 { 0.88 } else { 0.65 } {
                    let v0 = noise(self.seed + 4, j) * 0.22;
                    wall.strand(
                        vec![
                            point(u, v0) * 0.999,
                            point(u, (v0 + 0.40 + noise(self.seed, j + 71) * 0.5).min(1.0)) * 0.999,
                        ],
                        0.055 + noise(self.seed, j) * 0.20,
                        true,
                    );
                }
            }
            self.objects.push(wall);
        }
        let mut awning = Object::new("obj:awning", 11.0, 0.09, 0.10);
        awning.quad(
            anchor(0.055, 0.04, 3.0),
            anchor(0.315, 0.06, 5.4),
            anchor(0.425, 0.36, 8.0),
            anchor(0.11, 0.21, 2.9),
            [190.0, 110.0],
            14,
        );
        awning.strands.clear();
        awning.line(anchor(0.11, 0.21, 2.9), anchor(0.425, 0.36, 8.0), 0.36);
        for i in 0..45 {
            let u = i as f32 / 44.0;
            awning.strand(
                vec![
                    anchor(0.055, 0.04, 3.0).lerp(anchor(0.315, 0.06, 5.4), u),
                    anchor(0.11, 0.21, 2.9).lerp(anchor(0.425, 0.36, 8.0), u),
                ],
                0.16,
                true,
            );
        }
        self.objects.push(awning);
        let mut pavement = Object::new("obj:pavement", 11.0, 0.012, 0.18);
        pavement.quad(
            V3(-8.0, -0.72, 1.0),
            V3(8.0, -0.72, 1.0),
            V3(8.0, -0.72, 20.0),
            V3(-8.0, -0.72, 20.0),
            [150.0, 200.0],
            10,
        );
        pavement.strands.clear();
        self.objects.push(pavement);
    }
    fn furniture(&mut self) {
        let mut table = Object::new("obj:table", 3.0, 0.94, 0.015);
        let center = V3(0.0, -0.49, 2.06);
        table.surface(
            96,
            14,
            [340.0 * self.density, 140.0 * self.density],
            |u, v| center + V3(1.50 * v * (u * TAU).cos(), 0.0, 1.13 * v * (u * TAU).sin()),
        );
        for v in &mut table.vertices {
            v.uv = [
                (v.p.0 + 1.5) * 105.0 * self.density,
                v.p.2 * 110.0 * self.density,
            ];
        }
        for r in [1.0, 0.987, 0.973] {
            table.strand(
                (0..=128)
                    .map(|i| {
                        center
                            + V3(
                                1.5 * r * (i as f32 / 128.0 * TAU).cos(),
                                0.0,
                                1.13 * r * (i as f32 / 128.0 * TAU).sin(),
                            )
                    })
                    .collect(),
                0.8,
                false,
            );
        }
        // Thin true rim, outside the same planar tabletop.
        table.surface(96, 2, [340.0, 5.0], |u, v| {
            center + V3(1.5 * (u * TAU).cos(), -0.023 * v, 1.13 * (u * TAU).sin())
        });
        for j in 0..90 {
            let x = -1.49 + j as f32 / 89.0 * 2.98;
            let rz = (1.0 - (x / 1.5).powi(2)).max(0.0).sqrt() * 1.13;
            table.strand(
                vec![center + V3(x, 0.001, -rz), center + V3(x, 0.001, rz)],
                0.22,
                true,
            );
        }
        self.objects.push(table);
        let cup_center = CUP_CENTER;
        let mut saucer = Object::new("obj:saucer", 1.0, 1.0, 0.035);
        saucer.lathe(
            cup_center,
            &[
                (0.0, 0.0),
                (0.08, 0.002),
                (0.17, 0.004),
                (0.23, 0.012),
                (0.255, 0.032),
                (0.253, 0.038),
                (0.21, 0.031),
                (0.16, 0.021),
                (0.06, 0.021),
            ],
            64,
            [190.0, 32.0],
        );
        saucer.scale_about(cup_center, V3(0.74, 0.81, 0.74));
        self.objects.push(saucer);
        let mut cup = Object::new("obj:cup", 1.0, 1.0, 0.025);
        cup.lathe(
            cup_center,
            &[
                (0.095, 0.026),
                (0.113, 0.04),
                (0.135, 0.09),
                (0.148, 0.16),
                (0.149, 0.23),
                (0.153, 0.235),
                (0.149, 0.242),
                (0.140, 0.242),
                (0.136, 0.225),
                (0.132, 0.174),
            ],
            64,
            [170.0, 65.0],
        );
        let handle: Vec<_> = (0..=32)
            .map(|i| {
                let a = -PI * 0.58 + i as f32 / 32.0 * PI * 1.16;
                cup_center + V3(0.137 + 0.097 * a.cos(), 0.138 + 0.088 * a.sin(), 0.0)
            })
            .collect();
        cup.tube(&handle, 0.017, 8, [18.0, 80.0], true);
        cup.scale_about(cup_center, V3(0.82, 0.81, 0.82));
        self.objects.push(cup);
        let mut coffee = Object::new("obj:coffee", 11.0, 0.02, 0.075);
        coffee.surface(48, 3, [20.0, 20.0], |u, v| {
            cup_center
                + V3(
                    0.132 * v * (u * TAU).cos(),
                    0.177,
                    0.132 * v * (u * TAU).sin(),
                )
        });
        coffee.scale_about(cup_center, V3(0.82, 0.81, 0.82));
        self.objects.push(coffee);
        let ash_c = V3(-0.35, -0.48, 2.12);
        let mut ash = Object::new("obj:ashtray", 5.0, 0.9, 0.06);
        ash.lathe(
            ash_c,
            &[
                (0.155, 0.0),
                (0.172, 0.022),
                (0.177, 0.078),
                (0.166, 0.086),
                (0.154, 0.078),
                (0.147, 0.022),
                (0.05, 0.016),
            ],
            64,
            [125.0, 18.0],
        );
        for (radius, height) in [(0.168, 0.083), (0.155, 0.079), (0.166, 0.016)] {
            let ring: Vec<_> = (0..=96)
                .map(|i| {
                    let a = i as f32 / 96.0 * TAU;
                    ash_c + V3(radius * a.cos(), height, radius * a.sin())
                })
                .collect();
            ash.tube(&ring, 0.0035, 6, [5.0, 170.0], false);
        }
        for i in 0..36 {
            let a = i as f32 / 36.0 * TAU;
            let points = [
                ash_c + V3(0.172 * a.cos(), 0.024, 0.172 * a.sin()),
                ash_c + V3(0.177 * a.cos(), 0.073, 0.177 * a.sin()),
            ];
            ash.tube(&points, 0.0023, 5, [4.0, 14.0], false);
            ash.strand(points.to_vec(), 0.85, true);
        }
        ash.scale_about(ash_c, V3(0.85, 1.0, 0.85));
        self.objects.push(ash);
        let mut cigarette = Object::new("obj:cigarette", 1.0, 0.75, 0.09);
        cigarette.tube(
            &[
                ash_c + V3(-0.015, 0.043, -0.04),
                ash_c + V3(0.08, 0.12, 0.06),
            ],
            0.011,
            8,
            [18.0, 32.0],
            true,
        );
        self.objects.push(cigarette);
        let mut chair = Object::new("obj:chair/frame", 2.0, 0.9, 0.0);
        let c = anchor(0.041, 0.86, 2.65);
        let curve = |t: f32, offset: f32| {
            let a = -PI * 0.10 + t * PI * 1.20;
            c + V3(
                (0.43 + offset) * a.cos(),
                (0.535 + offset) * a.sin(),
                0.025 * a.sin(),
            )
        };
        for offset in [0.0, -0.035] {
            let arc: Vec<_> = (0..=72).map(|i| curve(i as f32 / 72.0, offset)).collect();
            chair.tube(&arc, 0.016, 8, [16.0, 360.0], true);
        }
        for side in [-1.0, 1.0] {
            chair.tube(
                &[
                    c + V3(side * 0.40, -0.15, 0.0),
                    c + V3(side * 0.30, -0.44, 0.13),
                ],
                0.019,
                8,
                [12.0, 100.0],
                true,
            );
        }
        self.objects.push(chair);
        let mut weave = Object::new("obj:chair/weave", 2.0, 0.72, 0.085);
        // Two intersecting local-coordinate rattan families, with alternating over/under bends.
        for family in [-1.0, 1.0] {
            for i in -14..=14 {
                let intercept = i as f32 * 0.040;
                let mut points = Vec::new();
                for j in 0..=40 {
                    let y = -0.33 + j as f32 / 40.0 * 0.83;
                    let x = intercept + family * y * 0.66;
                    if (x / 0.392).powi(2) + (y / 0.50).powi(2) < 1.0 {
                        points.push(c + V3(x, y, 0.008 * (y * 85.0 + intercept * 63.0).sin()));
                    }
                }
                if points.len() > 1 {
                    weave.tube(&points, 0.0034, 4, [5.0, 100.0], true);
                }
            }
        }
        self.objects.push(weave);
    }
    fn lamps(&mut self) {
        for (id, x, top, bottom, z, r) in [
            ("near", 0.575, 0.195, 0.65, 5.8, 0.047),
            ("far", 0.542, 0.343, 0.565, 9.5, 0.034),
        ] {
            let base = anchor(x, bottom, z);
            let h = (bottom - top) * z / crate::math::ASPECT;
            let mut lamp = Object::new(&format!("obj:lamp-{id}"), 1.0, 0.88, 0.11);
            lamp.lathe(
                base,
                &[
                    (r * 1.4, 0.0),
                    (r * 1.1, h * 0.05),
                    (r * 0.7, h * 0.20),
                    (r * 0.48, h * 0.32),
                    (r * 0.65, h * 0.34),
                    (r * 0.44, h * 0.36),
                    (r * 0.32, h * 0.76),
                    (r * 0.8, h * 0.78),
                ],
                16,
                [24.0, 150.0],
            );
            let p = base + V3(0.0, h * 0.78, 0.0);
            let mut glass = Object::new(&format!("obj:lamp-{id}/glass"), 5.0, 0.72, 0.15);
            glass.lathe(p, &[(r * 0.8, 0.0), (r * 1.7, h * 0.15)], 8, [25.0, 30.0]);
            self.objects.push(glass);
            lamp.lathe(
                p,
                &[
                    (r * 1.7, h * 0.15),
                    (r * 1.8, h * 0.16),
                    (r * 0.8, h * 0.20),
                    (r * 0.45, h * 0.22),
                    (r * 0.40, h * 0.225),
                ],
                8,
                [30.0, 50.0],
            );
            for i in 0..6 {
                let a = i as f32 / 6.0 * TAU;
                lamp.tube(
                    &[
                        p + V3(r * 0.8 * a.cos(), 0.0, r * 0.8 * a.sin()),
                        p + V3(r * 1.55 * a.cos(), h * 0.14, r * 1.55 * a.sin()),
                    ],
                    r * 0.075,
                    4,
                    [4.0, 45.0],
                    true,
                );
            }
            self.objects.push(lamp);
        }
    }
    pub fn frame(
        &self,
        out: &mut Frame,
        time_ms: f64,
        build_ms: f64,
        reduced: bool,
        tiles: bool,
    ) -> Result<(), String> {
        if !time_ms.is_finite()
            || !build_ms.is_finite()
            || time_ms < 0.0
            || time_ms > 3_600_000.0
            || !(0.0..=60_000.0).contains(&build_ms)
        {
            return Err("time/build outside renderer bounds".into());
        }
        out.reset();
        let p = if reduced || build_ms == 0.0 {
            1.2
        } else {
            (time_ms / build_ms) as f32 * 1.2
        };
        let life = if reduced {
            0.0
        } else {
            ((time_ms - build_ms).max(0.0) / 1000.0) as f32
        };
        for object in &self.objects {
            out.object(object, p, self.seed);
        }
        for object in gait::figure(life, 1.0, V3(-0.70, 0.0, 5.0), "near", 0.13) {
            out.object(&object, p, self.seed);
        }
        for (i, x) in [-0.13, 0.18, 0.36].iter().enumerate() {
            for mut object in gait::figure(
                life * 0.48 + i as f32,
                0.72,
                V3(*x, -0.20, 10.5 + i as f32 * 1.4),
                &format!("far-{i}"),
                0.18,
            ) {
                object.light = 0.18;
                out.object(&object, p, self.seed + 1);
            }
        }
        if tiles {
            self.tiles(out, p, life);
        }
        if p > 0.8 {
            let mut steam = Object::new("obj:steam", -1.0, 0.10, 0.17);
            for j in 0..3 {
                steam.strand(
                    (0..=30)
                        .map(|i| steam_point(life, j, i as f32 / 30.0))
                        .collect(),
                    0.08,
                    true,
                );
            }
            out.object(&steam, p, self.seed);
        }
        if !out.valid() {
            return Err(
                "procedural frame exceeds geometry budget or contains invalid values".into(),
            );
        }
        Ok(())
    }
    fn tiles(&self, out: &mut Frame, p: f32, life: f32) {
        // Authored anchored regions; no masks, atlas coordinates or image sampling.
        let regions: [(f32, f32, f32, f32, u32); TILE_COUNT] = [
            (0.095, 0.10, 0.065, 0.098, 7),
            (0.160, 0.10, 0.040, 0.098, 9),
            (0.103, 0.297, 0.052, 0.098, 8),
            (0.16, 0.0, 0.041, 0.10, 9),
            (0.734, 0.12, 0.052, 0.08, 9),
            (0.786, 0.10, 0.10, 0.10, 10),
            (0.785, 0.20, 0.05, 0.098, 9),
            (0.835, 0.20, 0.052, 0.098, 7),
            (0.887, 0.20, 0.087, 0.098, 10),
            (0.738, 0.285, 0.035, 0.04, 8),
            (0.737, 0.325, 0.04, 0.075, 10),
            (0.889, 0.328, 0.052, 0.099, 8),
            (0.739, 0.40, 0.048, 0.025, 9),
            (0.239, 0.75, 0.06, 0.089, 10),
            (0.215, 0.82, 0.023, 0.08, 8),
            (0.403, 0.75, 0.049, 0.17, 9),
            (0.452, 0.75, 0.05, 0.17, 10),
            (0.501, 0.79, 0.039, 0.146, 8),
            (0.566, 0.848, 0.048, 0.067, 8),
            (0.539, 0.936, 0.079, 0.064, 8),
            (0.858, 0.81, 0.055, 0.07, 7),
            (0.858, 0.906, 0.03, 0.094, 9),
        ];
        for (i, (x, y, w, h, mat)) in regions.iter().enumerate() {
            let start = 0.12 + (i % 5) as f32 * 0.012;
            if p < start + 0.30 {
                continue;
            }
            let mut tile = Object::new(&format!("tile:{i}"), *mat as f32, 1.0, start);
            let cycle = (life * (0.75 + noise(self.seed, i as u32) * 0.5)
                + noise(self.seed, i as u32 + 90) * 7.0)
                .floor() as u32;
            let burst = noise(self.seed + i as u32, cycle) > 0.48;
            for row in 0..14 {
                let n = noise(self.seed + cycle * 17, i as u32 * 31 + row);
                if burst && n < 0.28 {
                    continue;
                }
                let offset = if burst { (n - 0.5) * w * 0.45 } else { 0.0 };
                let gap = if burst { 0.0025 } else { 0.0002 };
                let yy = y + h * row as f32 / 14.0;
                let z = 0.72;
                tile.quad(
                    anchor(x + offset, yy, z),
                    anchor(x + w + offset, yy, z),
                    anchor(x + w + offset, yy + h / 14.0 - gap, z),
                    anchor(x + offset, yy + h / 14.0 - gap, z),
                    [w * 720.0, h * 720.0 / 14.0],
                    1,
                );
            }
            tile.strands.clear();
            out.object(&tile, p, self.seed);
            out.tiles += 1;
            if i % 4 == 0 {
                let mut track = Object::new(&format!("track:{i}"), -1.0, 0.18, start);
                track.strand(
                    vec![
                        anchor(*x, *y, 0.71),
                        anchor(x + w, *y, 0.71),
                        anchor(x + w, y + h, 0.71),
                    ],
                    0.20,
                    false,
                );
                out.object(&track, p, self.seed);
            }
        }
    }
}
