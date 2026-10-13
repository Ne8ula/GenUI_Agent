mod gait;
mod geometry;
mod materials;
mod math;
mod scene;

#[cfg(target_arch = "wasm32")]
mod gpu;
#[cfg(target_arch = "wasm32")]
mod light;
#[cfg(target_arch = "wasm32")]
pub use gpu::RustRenderer;

#[cfg(test)]
mod tests {
    use super::{geometry::*, math::*, scene::*};
    #[test]
    fn authored_scene_has_stable_ids_and_no_invalid_vertices() {
        let scene = Scene::new(33, 1.0).unwrap();
        let mut ids = std::collections::HashSet::new();
        for o in &scene.objects {
            assert!(ids.insert(&o.id));
            assert_eq!(o.vertices.len() % 3, 0);
            for v in &o.vertices {
                assert!(v.p.finite() && v.n.finite());
                assert!(v.p.2 > 0.1 && v.p.2 < 30.0);
            }
        }
        for name in [
            "obj:cup",
            "obj:saucer",
            "obj:ashtray",
            "obj:table",
            "obj:chair/frame",
            "obj:chair/weave",
            "obj:lamp-near",
            "obj:facade-0",
            "obj:facade-1",
        ] {
            assert!(ids.contains(&name.to_string()), "{name}");
        }
    }
    #[test]
    fn facade_windows_have_open_wall_meshes_and_true_recess_depth() {
        let scene = Scene::new(33, 1.0).unwrap();
        for side in 0..2 {
            let wall = scene
                .objects
                .iter()
                .find(|o| o.id == format!("obj:facade-{side}"))
                .unwrap();
            let corners = &wall.strands[0].points;
            let point = |u: f32, v: f32| {
                corners[0]
                    .lerp(corners[1], u)
                    .lerp(corners[3].lerp(corners[2], u), v)
            };
            let normal = (corners[1] - corners[0])
                .cross(corners[3] - corners[0])
                .unit()
                * if side == 0 { 1.0 } else { -1.0 };
            for col in 0..13 {
                for row in 0..4 {
                    let window = scene
                        .objects
                        .iter()
                        .find(|o| o.id == format!("obj:facade-{side}/window-{col}-{row}"))
                        .unwrap();
                    let [u0, v0, _, v1, depth] = facade_opening(33, side, col, row);
                    assert!(
                        (window.vertices[0].p - (point(u0, v0) - normal * depth)).length()
                            < 0.00001
                    );
                    let center = (window.vertices[0].p + window.vertices[2].p) * 0.5;
                    // A ray from the recessed center toward the street must pass through
                    // the opening even though the authored facade is slightly bilinear.
                    for triangle in wall.vertices.chunks_exact(3) {
                        let a = triangle[0].p;
                        let x = triangle[1].p - a;
                        let y = triangle[2].p - a;
                        let h = normal.cross(y);
                        let det = x.dot(h);
                        if det.abs() < 1e-9 {
                            continue;
                        }
                        let s = center - a;
                        let u = s.dot(h) / det;
                        let q = s.cross(x);
                        let v = normal.dot(q) / det;
                        let t = y.dot(q) / det;
                        assert!(
                            !(t > 0.0 && u >= 0.0 && v >= 0.0 && u + v <= 1.0),
                            "wall covers the opening"
                        );
                    }
                    let jamb = scene
                        .objects
                        .iter()
                        .find(|o| o.id == format!("obj:facade-{side}/jamb-{col}-{row}"))
                        .unwrap();
                    assert!(jamb
                        .vertices
                        .iter()
                        .any(|v| (v.p - window.vertices[0].p).length() < 0.00001));
                    let sill = point(u0 - 0.005, v1) + normal * 0.09;
                    assert!(jamb
                        .vertices
                        .iter()
                        .any(|v| (v.p - sill).length() < 0.00001));
                }
            }
        }
    }
    #[test]
    fn surface_rows_preserve_samples_normals_and_triangle_order() {
        use std::cell::Cell;
        for (nu, nv) in [(1, 1), (7, 5), (36, 24)] {
            let calls = Cell::new(0);
            let shape = |u: f32, v: f32| V3((u * 5.0).sin(), v * v, 3.0 + u * v);
            let mut object = Object::new("test:surface", 0.0, 1.0, 0.0);
            object.surface(nu, nv, [12.0, 18.0], |u, v| {
                calls.set(calls.get() + 1);
                shape(u, v)
            });
            assert_eq!(calls.get(), 5 * (nu + 1) * (nv + 1));
            let mut expected = Vec::new();
            for y in 0..nv {
                for x in 0..nu {
                    for (xx, yy) in [
                        (x, y),
                        (x + 1, y),
                        (x + 1, y + 1),
                        (x, y),
                        (x + 1, y + 1),
                        (x, y + 1),
                    ] {
                        let u = xx as f32 / nu as f32;
                        let v = yy as f32 / nv as f32;
                        let du = shape((u + 0.0005).min(1.0), v) - shape((u - 0.0005).max(0.0), v);
                        let dv = shape(u, (v + 0.0005).min(1.0)) - shape(u, (v - 0.0005).max(0.0));
                        expected.push(Vertex {
                            p: shape(u, v),
                            n: du.cross(dv).unit(),
                            uv: [u * 12.0, v * 18.0],
                        });
                    }
                }
            }
            assert_eq!(object.vertices.len(), expected.len());
            for (actual, previous) in object.vertices.iter().zip(expected) {
                assert_eq!(actual.p, previous.p);
                assert_eq!(actual.n, previous.n);
                assert_eq!(actual.uv, previous.uv);
            }
        }
    }
    #[test]
    fn building_rhythm_varies_but_openings_stay_inside_their_bays() {
        let widths: Vec<_> = (0..13)
            .map(|col| {
                let (u, next, _) = facade_bay(col);
                next - u
            })
            .collect();
        assert!(
            widths.iter().copied().fold(0.0, f32::max) - widths.iter().copied().fold(1.0, f32::min)
                > 0.02
        );
        for side in 0..2 {
            assert_ne!(facade_floors(0, side), facade_floors(1, side));
            for seed in [0, 33, 9999] {
                for col in 0..13 {
                    let (u, next, building) = facade_bay(col);
                    let floors = facade_floors(building, side);
                    for row in 0..4 {
                        let [left, top, right, bottom, depth] =
                            facade_opening(seed, side, col as u32, row);
                        assert!(u < left && left < right && right < next);
                        assert!(floors[row] < top && top < bottom && bottom < floors[row + 1]);
                        if row == 3 {
                            assert!((0.12..=0.1651).contains(&depth));
                        } else {
                            assert!((0.075..=0.12).contains(&depth));
                        }
                    }
                }
            }
        }
    }
    #[test]
    fn shopfront_grammars_keep_existing_identities_and_bound_joinery() {
        for seed in [0, 33, 9999] {
            let scene = Scene::new(seed, 1.0).unwrap();
            let ids: std::collections::HashSet<_> =
                scene.objects.iter().map(|o| o.id.as_str()).collect();
            for side in 0..2 {
                let kinds: std::collections::HashSet<_> =
                    (0..13).map(|col| shopfront_kind(side, col)).collect();
                assert_eq!(kinds.len(), 3);
                for part in 0..10 {
                    assert!(ids.contains(format!("obj:facade-{side}/roof-{part}").as_str()));
                }
                for col in 0..13 {
                    for row in 0..4 {
                        for prefix in ["window", "jamb"] {
                            assert!(ids.contains(
                                format!("obj:facade-{side}/{prefix}-{col}-{row}").as_str()
                            ));
                        }
                    }
                    let window = scene
                        .objects
                        .iter()
                        .find(|o| o.id == format!("obj:facade-{side}/window-{col}-3"))
                        .unwrap();
                    let joinery = scene
                        .objects
                        .iter()
                        .find(|o| o.id == format!("obj:facade-{side}/shopfront-{col}"))
                        .unwrap();
                    assert_eq!(window.material, 13.0);
                    assert_eq!(joinery.material, 12.0);
                    // New joinery must stay within the recessed bay's vertical/depth
                    // envelope, allowing only its small physical frame/handle projection.
                    for v in &joinery.vertices {
                        for axis in [0, 1, 2] {
                            let component = |p: V3| [p.0, p.1, p.2][axis];
                            let lo = window
                                .vertices
                                .iter()
                                .map(|w| component(w.p))
                                .fold(f32::INFINITY, f32::min);
                            let hi = window
                                .vertices
                                .iter()
                                .map(|w| component(w.p))
                                .fold(f32::NEG_INFINITY, f32::max);
                            assert!((lo - 0.04..=hi + 0.04).contains(&component(v.p)));
                        }
                    }
                }
            }
        }
        assert!(!super::materials::FRAGMENT.contains("sampler"));
        assert!(!super::materials::FRAGMENT.contains("texture("));
    }
    #[test]
    fn construction_adds_geometry_before_materials() {
        let scene = Scene::new(33, 1.0).unwrap();
        let mut f = Frame::default();
        scene.frame(&mut f, 0.0, 12000.0, false, true).unwrap();
        assert!(f.triangles.is_empty() && f.lines.is_empty());
        scene.frame(&mut f, 1000.0, 12000.0, false, true).unwrap();
        assert!(f.triangles.is_empty() && !f.lines.is_empty());
        let mut last = 0;
        for t in [3000.0, 5000.0, 7000.0, 9000.0, 12000.0] {
            scene.frame(&mut f, t, 12000.0, false, false).unwrap();
            assert!(f.surfaces >= last);
            last = f.surfaces;
        }
        assert!(last > 10000);
    }
    #[test]
    fn same_seed_time_is_deterministic_and_reduced_is_invariant() {
        let scene = Scene::new(33, 1.0).unwrap();
        let mut a = Frame::default();
        let mut b = Frame::default();
        for t in [1000.0, 6000.0, 13000.0, 24000.0] {
            scene.frame(&mut a, t, 12000.0, false, true).unwrap();
            scene.frame(&mut b, t, 12000.0, false, true).unwrap();
            assert_eq!(a.triangles, b.triangles);
            assert_eq!(a.lines, b.lines);
        }
        scene.frame(&mut a, 1.0, 12000.0, true, true).unwrap();
        scene.frame(&mut b, 48000.0, 12000.0, true, true).unwrap();
        assert_eq!(a.triangles, b.triangles);
        assert_eq!(a.lines, b.lines);
    }
    #[test]
    fn late_scene_stays_live_without_full_scene_randomness() {
        let scene = Scene::new(33, 1.0).unwrap();
        let mut a = Frame::default();
        let mut b = Frame::default();
        scene.frame(&mut a, 13000.0, 12000.0, false, true).unwrap();
        scene.frame(&mut b, 22000.0, 12000.0, false, true).unwrap();
        assert_ne!(a.triangles, b.triangles);
        assert_eq!(a.tiles, TILE_COUNT);
        assert_eq!(b.tiles, TILE_COUNT);
        let static_vertices: usize = scene
            .objects
            .iter()
            .map(|o| o.vertices.len() * STRIDE)
            .sum();
        assert_eq!(
            &a.triangles[..static_vertices],
            &b.triangles[..static_vertices]
        );
        let static_lines: usize = scene
            .objects
            .iter()
            .flat_map(|o| &o.strands)
            .map(|s| (s.points.len() - 1) * 2 * STRIDE)
            .sum();
        assert_eq!(&a.lines[..static_lines], &b.lines[..static_lines]);
    }
    #[test]
    fn input_and_resource_limits() {
        assert!(Scene::new(10000, 1.0).is_err());
        assert!(Scene::new(33, f32::NAN).is_err());
        assert!(Scene::new(33, 999.0).is_err());
        for seed in [0, 33, 9999] {
            let s = Scene::new(seed, 2.0).unwrap();
            let mut f = Frame::default();
            for t in [0.0, 4000.0, 12000.0, 20000.0, 60000.0, 3_600_000.0] {
                s.frame(&mut f, t, 12000.0, false, true).unwrap();
                assert!(f.valid());
            }
            assert!(s.frame(&mut f, f64::NAN, 12000.0, false, true).is_err());
            assert!(s.frame(&mut f, 1.0, -1.0, false, true).is_err());
        }
    }
    #[test]
    fn projection_shader_uses_the_same_camera_constant() {
        let source = super::materials::vertex_source();
        assert!(source.contains(&ASPECT.to_string()));
        assert!(!source.contains("SCENE_ASPECT"));
    }
    #[test]
    fn steam_remains_attached_to_the_constructed_cup_rim() {
        let scene = Scene::new(33, 1.0).unwrap();
        let cup = scene.objects.iter().find(|o| o.id == "obj:cup").unwrap();
        // The handle tube can extend above the rim; use the constructed rim/profile
        // strands, not the maximum of every handle-surface vertex.
        let rim_y = cup
            .strands
            .iter()
            .flat_map(|strand| strand.points.iter())
            .map(|point| point.1)
            .fold(f32::NEG_INFINITY, f32::max);
        for time in [0.0, 2.0, 30.0] {
            for strand in 0..3 {
                let origin = steam_point(time, strand, 0.0);
                assert!((origin.1 - rim_y).abs() < 0.00001);
                assert!((origin.0 - 0.416).abs() <= 0.0141);
            }
        }
    }
    #[test]
    fn vessel_cells_follow_profile_distance_and_limbs_taper() {
        let mut vessel = Object::new("test:vessel", 1.0, 1.0, 0.0);
        vessel.lathe(
            V3(0.0, 0.0, 3.0),
            &[(1.0, 0.0), (1.0, 0.01), (1.0, 1.0)],
            16,
            [64.0, 100.0],
        );
        let lip_rows = vessel.vertices[..16 * 6]
            .iter()
            .map(|v| v.uv[1])
            .fold(0.0, f32::max);
        assert!((lip_rows - 1.0).abs() < 0.0001);
        let mut limb = Object::new("test:limb", 4.0, 1.0, 0.0);
        limb.tapered_tube(
            &[V3(0.0, 0.0, 3.0), V3(0.0, 1.0, 3.0)],
            [0.06, 0.03],
            12,
            [16.0, 40.0],
            true,
        );
        for v in &limb.vertices {
            let radius = (v.p.0.powi(2) + (v.p.2 - 3.0).powi(2)).sqrt();
            assert!((radius - (0.06 - 0.03 * v.p.1)).abs() < 0.00001);
            assert!(v.n.finite());
        }
    }
    #[test]
    fn fixed_camera_round_trips_design_anchors() {
        for [x, y, z] in [[0.36, 0.7, 5.0], [0.7, 0.8, 2.3], [0.45, 0.2, 14.0]] {
            let q = project(anchor(x, y, z));
            assert!((q[0] - x).abs() < 1e-6 && (q[1] - y).abs() < 1e-6);
        }
    }
}
