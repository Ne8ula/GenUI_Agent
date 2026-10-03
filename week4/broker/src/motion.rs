//! Deterministic motion planning: edge slots and eased steps.

use crate::adapter::{Placement, Rect, ShowState};

/// Cubic ease-in-out on `t ∈ [0, 1]`.
pub fn ease_in_out_cubic(t: f64) -> f64 {
    let t = t.clamp(0.0, 1.0);
    if t < 0.5 {
        4.0 * t * t * t
    } else {
        1.0 - (-2.0 * t + 2.0).powi(3) / 2.0
    }
}

fn lerp(a: i32, b: i32, e: f64) -> i32 {
    a + ((f64::from(b) - f64::from(a)) * e).round() as i32
}

fn lerp_rect(a: Rect, b: Rect, e: f64) -> Rect {
    Rect {
        left: lerp(a.left, b.left, e),
        top: lerp(a.top, b.top, e),
        right: lerp(a.right, b.right, e),
        bottom: lerp(a.bottom, b.bottom, e),
    }
}

/// Plan `n` eased steps from `from` to `to`. Intermediate steps are shown
/// normal with an interpolated rectangle; the final step equals `to` exactly
/// (including its show state). `n == 0` is treated as one step.
pub fn plan_steps(from: &Placement, to: &Placement, n: u32) -> Vec<Placement> {
    let n = n.max(1);
    (1..=n)
        .map(|k| {
            if k == n {
                *to
            } else {
                let e = ease_in_out_cubic(f64::from(k) / f64::from(n));
                Placement {
                    show_state: ShowState::Normal,
                    normal_rect: lerp_rect(from.normal_rect, to.normal_rect, e),
                    min_position: to.min_position,
                    max_position: to.max_position,
                }
            }
        })
        .collect()
}

/// Edge slot for window `index` of `count`: even indices go to the left
/// edge, odd to the right, stacked vertically in equal bands.
///
/// The slot always lies entirely inside `work` (the stage monitor's work
/// area). A window wider than `strip` or taller than its band is fitted into
/// a `strip`-wide column, so it never overhangs onto a neighbouring monitor.
/// On a real desk an overhang can make the OS reassign the window to the
/// other monitor (largest overlap), which restore would then mistake for a
/// user change.
pub fn edge_slot(work: Rect, window: Rect, index: usize, count: usize, strip: i32) -> Rect {
    let per_side = count.div_ceil(2).max(1) as i32;
    let row = (index / 2) as i32;
    let band = (work.height() / per_side).max(1);
    let w = window.width().min(strip).min(work.width()).max(1);
    let h = window.height().min(band).max(1);
    let top = work.top + row * band;
    let left = if index.is_multiple_of(2) {
        work.left
    } else {
        work.right - w
    };
    Rect {
        left,
        top,
        right: left + w,
        bottom: top + h,
    }
}

/// True if `inner` lies entirely inside `outer`.
pub fn contains(outer: Rect, inner: Rect) -> bool {
    inner.left >= outer.left
        && inner.top >= outer.top
        && inner.right <= outer.right
        && inner.bottom <= outer.bottom
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapter::Point;

    fn placement(l: i32, t: i32, r: i32, b: i32) -> Placement {
        Placement {
            show_state: ShowState::Normal,
            normal_rect: Rect {
                left: l,
                top: t,
                right: r,
                bottom: b,
            },
            min_position: Point { x: -1, y: -1 },
            max_position: Point { x: -1, y: -1 },
        }
    }

    #[test]
    fn easing_endpoints_and_monotonic() {
        assert_eq!(ease_in_out_cubic(0.0), 0.0);
        assert_eq!(ease_in_out_cubic(1.0), 1.0);
        let mut prev = 0.0;
        for i in 1..=100 {
            let v = ease_in_out_cubic(f64::from(i) / 100.0);
            assert!(v >= prev);
            prev = v;
        }
    }

    #[test]
    fn steps_are_deterministic_and_end_exactly_at_target() {
        let a = placement(100, 100, 500, 400);
        let b = placement(-300, 0, 100, 300);
        let s1 = plan_steps(&a, &b, 6);
        let s2 = plan_steps(&a, &b, 6);
        assert_eq!(s1, s2);
        assert_eq!(s1.len(), 6);
        assert_eq!(*s1.last().unwrap(), b);
        // Moves monotonically leftwards.
        let mut prev = a.normal_rect.left;
        for s in &s1 {
            assert!(s.normal_rect.left <= prev);
            prev = s.normal_rect.left;
        }
    }

    fn r(left: i32, top: i32, right: i32, bottom: i32) -> Rect {
        Rect {
            left,
            top,
            right,
            bottom,
        }
    }

    #[test]
    fn edge_slots_alternate_sides() {
        let work = r(0, 0, 1920, 1040);
        let win = r(400, 300, 1000, 700);
        let l = edge_slot(work, win, 0, 3, 240);
        let rt = edge_slot(work, win, 1, 3, 240);
        assert_eq!((l.left, l.right), (0, 240));
        assert_eq!((rt.left, rt.right), (1920 - 240, 1920));
        assert_eq!(l.height(), win.height());
        let l2 = edge_slot(work, win, 2, 3, 240);
        assert!(l2.top >= l.bottom, "stacked without overlap");
        // A window narrower than the strip keeps its width.
        let small = edge_slot(work, r(0, 0, 150, 100), 1, 1, 240);
        assert_eq!(small.width(), 150);
    }

    /// H1 regression: no slot may leave the stage monitor's work area, for
    /// any window size, slot count or monitor origin (including a stage
    /// monitor to the right of, or above, another monitor).
    #[test]
    fn edge_slots_never_leave_the_stage_work_area() {
        let works = [
            r(0, 0, 1920, 1040),
            r(1920, 0, 3840, 1040),
            r(-1920, 0, 0, 1040),
            r(0, -1080, 1920, -40),
            r(0, 0, 800, 560),
        ];
        let windows = [
            r(10, 10, 110, 60),
            r(400, 200, 1000, 700),
            r(1500, 200, 1900, 700),
            r(-50, -50, 3000, 2000),
        ];
        for work in works {
            for win in windows {
                for count in 1..=6 {
                    for index in 0..count {
                        for strip in [1, 96, 240, 5000] {
                            let s = edge_slot(work, win, index, count, strip);
                            assert!(
                                contains(work, s),
                                "{work:?} {win:?} {index}/{count} strip {strip} -> {s:?}"
                            );
                            assert!(s.width() > 0 && s.height() > 0);
                        }
                    }
                }
            }
        }
    }
}
