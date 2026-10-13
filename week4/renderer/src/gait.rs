use crate::geometry::Object;
use crate::math::{smooth, V3};
use std::f32::consts::{PI, TAU};

const PERIOD: f32 = 1.9;
const SPEED: f32 = 0.155;
const UPPER: f32 = 0.29;
const LOWER: f32 = 0.29;
fn forward() -> V3 {
    V3(-0.58, 0.0, 0.815).unit()
}
fn right() -> V3 {
    V3(0.815, 0.0, 0.58).unit()
}
#[derive(Debug, Clone, Copy)]
pub struct Leg {
    pub hip: V3,
    pub knee: V3,
    pub ankle: V3,
    pub stance: bool,
    pub roll: f32,
    pub contact: V3,
}

const FOOT_LONG: f32 = 0.075;
const FOOT_HIGH: f32 = 0.018;
const FOOT_CENTER: f32 = 0.034;
const GROUND: f32 = -0.72;

fn foot_roll(phase: f32) -> f32 {
    if phase < 0.10 {
        0.14 * (1.0 - smooth(phase / 0.10))
    } else if phase < 0.48 {
        0.0
    } else if phase <= 0.62 {
        -0.22 * smooth((phase - 0.48) / 0.14)
    } else {
        -0.22 + 0.36 * smooth((phase - 0.62) / 0.38)
    }
}

fn sole_support(roll: f32) -> (f32, f32) {
    let height = ((FOOT_LONG * roll.sin()).powi(2) + (FOOT_HIGH * roll.cos()).powi(2)).sqrt();
    let along = FOOT_CENTER * roll.cos()
        + (FOOT_HIGH.powi(2) - FOOT_LONG.powi(2)) * roll.sin() * roll.cos() / height;
    (height, along)
}

fn weight_shift(time: f32) -> V3 {
    right() * (-0.013 * (time / PERIOD * TAU).sin())
}
fn pelvis_yaw(time: f32) -> f32 {
    -0.035 * (time / PERIOD * TAU).cos()
}
fn pelvis_right(time: f32) -> V3 {
    let yaw = pelvis_yaw(time);
    right() * yaw.cos() + forward() * yaw.sin()
}
fn swing_progress(t: f32) -> f32 {
    t * t * t * (10.0 + t * (-15.0 + t * 6.0))
}

pub fn leg(time: f32, side: usize) -> Leg {
    let offset = side as f32 * 0.5;
    let cycle = time / PERIOD + offset;
    let phase = cycle.fract();
    let stride = SPEED * PERIOD;
    let planted = (cycle.floor() - offset) * stride;
    let swing = ((phase - 0.62) / 0.38).clamp(0.0, 1.0);
    let travel = planted + stride * swing_progress(swing) + stride * 0.31;
    let lift = 0.028 * (swing * PI).sin().powi(2);
    let roll = foot_roll(phase);
    let (support, along) = sole_support(roll);
    let lateral = right() * if side == 0 { -0.075 } else { 0.075 };
    let contact = forward() * (travel + FOOT_CENTER) + lateral + V3(0.0, GROUND + lift, 0.0);
    // Solve the ankle from the rolling sole's actual lowest point. During stance
    // that world-space contact stays planted even as the heel lifts for toe-off.
    let ankle = contact - forward() * along + V3(0.0, support - FOOT_CENTER * roll.sin(), 0.0);
    let bob = -0.004 * (time / PERIOD * TAU * 2.0).cos();
    let hip = forward() * (time * SPEED)
        + pelvis_right(time) * if side == 0 { -0.075 } else { 0.075 }
        + weight_shift(time)
        + V3(0.0, -0.135 + bob, 0.0);
    let delta = ankle - hip;
    let distance = delta.length().min(UPPER + LOWER - 0.0001);
    let axis = delta.unit();
    let a = (UPPER * UPPER - LOWER * LOWER + distance * distance) / (2.0 * distance);
    let bend = (forward() - axis * forward().dot(axis)).unit();
    let knee = hip + axis * a + bend * (UPPER * UPPER - a * a).max(0.0).sqrt();
    Leg {
        hip,
        knee,
        ankle,
        stance: phase <= 0.62,
        roll,
        contact,
    }
}
fn coat_rest(u: f32, v: f32) -> V3 {
    let angle = u * TAU;
    let hem = (1.0 - v).powi(2);
    let shoulder = 0.028 * (-((v - 0.82) / 0.20).powi(2)).exp();
    let waist = 0.015 * (-((v - 0.50) / 0.20).powi(2)).exp();
    let width = (0.130 + 0.055 * hem + shoulder - waist) * (1.0 - 0.48 * smooth((v - 0.89) / 0.11));
    // Unequal vertical folds and a small back vent belong to the rest garment;
    // the established rig and temporal lag below remain independent of this shape.
    let folds = 1.0
        + (0.025 + 0.060 * hem)
            * ((angle * 5.0 + v * 0.6).cos() * 0.65 + (angle * 9.0 - v * 0.4).cos() * 0.35);
    let edge = hem * (0.008 * (angle * 3.0 + 0.4).sin() + 0.022 * (-angle.sin()).max(0.0).powi(24));
    V3(
        width * angle.cos() * folds,
        -0.41 + v * 0.66 + edge,
        (0.086 + 0.025 * hem) * angle.sin() * folds,
    )
}
pub fn figure(time: f32, scale: f32, origin: V3, id: &str, start: f32) -> Vec<Object> {
    let t = time.max(0.0);
    let map = |v: V3| origin + v * scale;
    let tess = |n: usize| if scale < 0.9 { (n / 2).max(6) } else { n };
    let pelvis = forward() * (t * SPEED);
    let sway = weight_shift(t);
    let torso = pelvis + sway + V3(0.0, -0.005 - 0.004 * (t / PERIOD * TAU * 2.0).cos(), 0.0);
    let phase = t / PERIOD * TAU;
    let yaw = 0.045 * phase.cos();
    let shoulder_right = right() * yaw.cos() + forward() * yaw.sin();
    let shoulder_forward = forward() * yaw.cos() - right() * yaw.sin();
    let pelvis_forward = forward() * pelvis_yaw(t).cos() - right() * pelvis_yaw(t).sin();
    let local = |x: f32, y: f32, z: f32| {
        let turn = smooth((y + 0.20) / 0.45);
        let r = pelvis_right(t).lerp(shoulder_right, turn);
        let f = pelvis_forward.lerp(shoulder_forward, turn);
        map(torso + r * x + V3(0.0, y, 0.0) + f * (z + 0.022 * (y + 0.13)))
    };
    let mut coat = Object::new(&format!("actor:{id}/coat"), 4.0, 0.93, start);
    // Smooth cloth envelope rather than a stack of straight tapered rings.
    let shape = |u: f32, v: f32| {
        let rest = coat_rest(u, v);
        let angle = u * TAU;
        let hem = (1.0 - v).powi(2);
        let lag = hem * 0.012 * (phase - 0.7 + angle * 2.0).sin();
        local(rest.0, rest.1 + lag, rest.2 + lag)
    };
    coat.surface(tess(36), tess(24), [62.0, 76.0], shape);
    for u in [0.0, 0.25, 0.5, 0.75] {
        coat.strand(
            (0..=16).map(|i| shape(u, i as f32 / 16.0)).collect(),
            0.52,
            false,
        );
    }
    for u in [0.34, 0.48, 0.64, 0.83] {
        coat.strand(
            (0..=14)
                .map(|i| shape(u, 0.08 + i as f32 / 14.0 * 0.82))
                .collect(),
            0.26,
            true,
        );
    }
    coat.strand(
        (0..=28).map(|i| shape(i as f32 / 28.0, 0.0)).collect(),
        0.57,
        true,
    );
    // Back belt and center seam, not front-facing lapels or face pixels.
    let belt: Vec<_> = (0..=20)
        .map(|i| shape(0.5 + i as f32 / 20.0 * 0.5, 0.50))
        .collect();
    coat.tube(&belt, 0.004 * scale, 4, [40.0, 3.0], false);
    let mut out = vec![coat];
    let mut head = Object::new(&format!("actor:{id}/head-hair"), 11.0, 0.16, start + 0.015);
    head.ellipsoid(
        local(0.0, 0.327, 0.0),
        V3(0.070, 0.088, 0.068) * scale,
        tess(24),
        tess(14),
        [42.0, 42.0],
    );
    // The selected rear-view reference has its cloth hood resting on the back.
    // Preserve the historical stable ID while separating head from folded cloth.
    let mut hair = Object::new(&format!("actor:{id}/hair"), 4.0, 0.95, start + 0.035);
    hair.ellipsoid(
        local(0.0, 0.215, -0.083),
        V3(0.084, 0.061, 0.048) * scale,
        tess(28),
        tess(18),
        [38.0, 30.0],
    );
    hair.strand(
        (0..=24)
            .map(|i| {
                let a = i as f32 / 24.0 * PI;
                local(0.0, 0.215 + 0.061 * a.cos(), -0.083 - 0.049 * a.sin())
            })
            .collect(),
        0.44,
        true,
    );
    out.push(head);
    out.push(hair);
    for side in 0..2 {
        let l = leg(t, side);
        let sign = if side == 0 { -1.0 } else { 1.0 };
        let mut pants = Object::new(&format!("actor:{id}/leg-{side}"), 4.0, 0.24, start + 0.02);
        pants.tapered_tube(
            &[map(l.hip), map(l.knee)],
            [0.058 * scale, 0.039 * scale],
            14,
            [22.0, 38.0],
            true,
        );
        pants.tapered_tube(
            &[map(l.knee), map(l.ankle)],
            [0.039 * scale, 0.025 * scale],
            14,
            [18.0, 38.0],
            true,
        );
        let toe_axis = forward() * l.roll.cos() + V3(0.0, l.roll.sin(), 0.0);
        let up_axis = V3(0.0, l.roll.cos(), 0.0) - forward() * l.roll.sin();
        let foot = |u: f32, v: f32| {
            let a = u * TAU;
            let b = (v - 0.5) * PI;
            map(l.ankle
                + toe_axis * (FOOT_CENTER + FOOT_LONG * a.cos() * b.cos())
                + right() * (0.027 * a.sin() * b.cos())
                + up_axis * (FOOT_HIGH * b.sin()))
        };
        pants.surface(tess(16), tess(8), [24.0, 12.0], foot);
        pants.strand(
            (0..=24).map(|i| foot(i as f32 / 24.0, 0.5)).collect(),
            0.56,
            false,
        );
        out.push(pants);
        let shoulder = torso
            + shoulder_right * (sign * 0.143)
            + V3(0.0, 0.155, 0.0)
            + shoulder_forward * 0.0066;
        let swing = -(phase + side as f32 * PI).cos();
        let angle = swing * 0.22;
        let elbow =
            shoulder + V3(0.0, -angle.cos(), 0.0) * 0.205 + forward() * (angle.sin() * 0.205);
        let wrist = elbow
            + V3(0.0, -(angle + 0.16).cos(), 0.0) * 0.18
            + forward() * ((angle + 0.16).sin() * 0.18);
        let mut arm = Object::new(&format!("actor:{id}/arm-{side}"), 4.0, 0.85, start + 0.02);
        arm.tapered_tube(
            &[map(shoulder), map(elbow)],
            [0.057 * scale, 0.042 * scale],
            14,
            [23.0, 30.0],
            true,
        );
        arm.tapered_tube(
            &[map(elbow), map(wrist)],
            [0.042 * scale, 0.027 * scale],
            14,
            [18.0, 27.0],
            true,
        );
        // Rounded sleeve cap overlaps the coat and both sections of the sleeve;
        // wire paths still begin with the two measured arm segments above.
        arm.ellipsoid(
            map(shoulder),
            V3(0.055, 0.055, 0.055) * scale,
            14,
            10,
            [20.0, 20.0],
        );
        arm.ellipsoid(
            map(elbow),
            V3(0.043, 0.043, 0.043) * scale,
            12,
            8,
            [16.0, 16.0],
        );
        arm.ellipsoid(
            map(wrist + V3(0.0, -0.033, 0.0)),
            V3(0.024, 0.040, 0.024) * scale,
            10,
            6,
            [10.0, 14.0],
        );
        out.push(arm);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rest_coat_is_bounded_seamless_and_has_a_shaped_hem() {
        let mut low = f32::INFINITY;
        let mut high = f32::NEG_INFINITY;
        for i in 0..=120 {
            let u = i as f32 / 120.0;
            let edge = coat_rest(u, 0.0);
            low = low.min(edge.1);
            high = high.max(edge.1);
            for j in 0..=40 {
                let v = j as f32 / 40.0;
                let p = coat_rest(u, v);
                assert!(p.finite());
                assert!(p.0.abs() < 0.21 && p.2.abs() < 0.125);
                assert!((-0.43..=0.251).contains(&p.1));
                assert!((coat_rest(0.0, v) - coat_rest(1.0, v)).length() < 0.00001);
            }
        }
        assert!(high - low > 0.02 && high - low < 0.045);
    }
    #[test]
    fn connected_leg_lengths_and_ground_contacts() {
        for i in 0..2400 {
            let t = i as f32 / 120.0;
            for side in 0..2 {
                let l = leg(t, side);
                assert!(((l.knee - l.hip).length() - UPPER).abs() < 0.0005);
                assert!(((l.ankle - l.knee).length() - LOWER).abs() < 0.0005);
                assert!((-0.705..=-0.664).contains(&l.ankle.1));
                assert!((GROUND - 0.00001..=GROUND + 0.0351).contains(&l.contact.1));
                if l.stance {
                    let knee_bend = (l.knee - l.hip)
                        .unit()
                        .dot((l.ankle - l.knee).unit())
                        .clamp(-1.0, 1.0)
                        .acos();
                    assert!(
                        knee_bend < 0.50,
                        "stance leg is over-bent for this slow-walk rig"
                    );
                    let b = leg(t + 0.0001, side);
                    if b.stance {
                        assert!((l.contact - b.contact).length() < 0.00001);
                        assert!((l.contact.1 - GROUND).abs() < 0.00001);
                    }
                }
            }
        }
    }
    #[test]
    fn rendered_arm_segments_keep_their_lengths() {
        for i in 0..120 {
            for object in figure(i as f32 / 12.0, 1.0, V3(0.0, 0.0, 5.0), "test", 0.0) {
                if object.id.contains("/arm-") {
                    let upper = &object.strands[0].points;
                    let lower = &object.strands[1].points;
                    assert!(((upper[1] - upper[0]).length() - 0.205).abs() < 0.00001);
                    assert!(((lower[1] - lower[0]).length() - 0.18).abs() < 0.00001);
                    assert_eq!(upper[1], lower[0]);
                }
            }
        }
    }
    #[test]
    fn rolling_sole_is_continuous_and_rendered_feet_clear_the_ground() {
        for i in 0..180 {
            let t = i as f32 * PERIOD / 180.0;
            for side in 0..2 {
                let l = leg(t, side);
                let next = leg(t + 0.0001, side);
                assert!((l.ankle - next.ankle).length() < 0.0002);
                let (height, along) = sole_support(l.roll);
                let bottom =
                    l.ankle + forward() * along + V3(0.0, FOOT_CENTER * l.roll.sin() - height, 0.0);
                assert!((bottom - l.contact).length() < 0.00001);
            }
            for object in figure(t, 1.0, V3(0.0, 0.0, 5.0), "contact", 0.0) {
                if let Some(side) = object.id.strip_prefix("actor:contact/leg-") {
                    let l = leg(t, side.parse().unwrap());
                    let lowest = object
                        .vertices
                        .iter()
                        .map(|v| v.p.1)
                        .fold(f32::INFINITY, f32::min);
                    assert!(lowest >= GROUND - 0.00001);
                    if l.stance {
                        assert!(lowest < GROUND + 0.003);
                    }
                }
            }
        }
        for boundary in [0.10, 0.48, 0.62, 1.0] {
            let a = leg((boundary - 0.00001) * PERIOD, 0);
            let b = leg((boundary + 0.00001) * PERIOD, 0);
            assert!((a.ankle - b.ankle).length() < 0.0001);
            assert!((a.roll - b.roll).abs() < 0.0001);
        }
    }
    #[test]
    fn background_coats_use_less_geometry_without_changing_identity() {
        let near = figure(1.0, 1.0, V3(0.0, 0.0, 5.0), "test", 0.0);
        let far = figure(1.0, 0.72, V3(0.0, 0.0, 10.0), "test", 0.0);
        assert_eq!(
            near.iter().map(|o| &o.id).collect::<Vec<_>>(),
            far.iter().map(|o| &o.id).collect::<Vec<_>>()
        );
        assert!(
            far.iter().map(|o| o.vertices.len()).sum::<usize>()
                < near.iter().map(|o| o.vertices.len()).sum::<usize>() * 2 / 3
        );
    }
    #[test]
    fn support_transfer_keeps_uncrossed_paths_and_reachable_hips() {
        for i in 0..1900 {
            let t = i as f32 * PERIOD / 1900.0;
            let left = leg(t, 0);
            let right_leg = leg(t, 1);
            assert!(((right_leg.contact - left.contact).dot(right()) - 0.15).abs() < 0.00001);
            assert!(left.stance || right_leg.stance);
            for l in [left, right_leg] {
                assert!((l.hip - l.ankle).length() < UPPER + LOWER - 0.0001);
            }
            if left.stance && !right_leg.stance {
                assert!(weight_shift(t).dot(right()) < 0.0);
            }
            if right_leg.stance && !left.stance {
                assert!(weight_shift(t).dot(right()) > 0.0);
            }
        }
        assert!(pelvis_yaw(0.0) < 0.0 && pelvis_yaw(PERIOD * 0.5) > 0.0);
        let h = 0.0001;
        assert!(swing_progress(h) / h < 0.00001);
        assert!((1.0 - swing_progress(1.0 - h)).abs() / h < 0.005);
    }
    #[test]
    fn walking_moves_left_and_into_depth() {
        let d = forward() * 10.0 * SPEED;
        assert!(d.0 < 0.0 && d.2 > 0.0);
    }
}
