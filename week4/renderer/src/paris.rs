//! R8: authored relief geometry, never sampled reference pixels.
use crate::geometry::{Frame, Object, STRIDE};
use crate::math::{anchor, noise, smooth, V3};
use std::f32::consts::TAU;

pub const ID: &str = "scene:paris-r8-four-layer";
pub const BUILD_MS: f64 = 30_000.0;
pub const BOUNDARIES: [f64; 5] = [0.0, 7_000.0, 14_000.0, 21_000.0, BUILD_MS];
pub fn phase(ms: f64) -> f32 {
    for i in 0..4 {
        if ms < BOUNDARIES[i + 1] {
            return i as f32
                + ((ms - BOUNDARIES[i]) / (BOUNDARIES[i + 1] - BOUNDARIES[i])).clamp(0.0, 1.0)
                    as f32;
        }
    }
    4.0
}
fn p(x: f32, y: f32, z: f32) -> V3 {
    anchor(x / 1672.0, y / 941.0, z)
}
fn quad(id: &str, xy: [[f32; 2]; 4], z: f32, mat: f32) -> Object {
    let mut o = Object::new(id, mat, 1.0, 0.0);
    let w = ((xy[1][0] - xy[0][0]).abs() + (xy[2][0] - xy[3][0]).abs()) * 0.5;
    let h = ((xy[3][1] - xy[0][1]).abs() + (xy[2][1] - xy[1][1]).abs()) * 0.5;
    o.quad(
        p(xy[0][0], xy[0][1], z),
        p(xy[1][0], xy[1][1], z),
        p(xy[2][0], xy[2][1], z),
        p(xy[3][0], xy[3][1], z),
        [w / 3.0, h / 3.0],
        1,
    );
    o
}
fn rect(id: &str, x: f32, y: f32, w: f32, h: f32, z: f32, mat: f32) -> Object {
    quad(id, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], z, mat)
}
fn stroke(id: &str, points: &[[f32; 2]], width: f32, z: f32, mat: f32) -> Object {
    let mut o = Object::new(id, mat, 1.0, 0.0);
    let points: Vec<_> = points.iter().map(|a| p(a[0], a[1], z)).collect();
    o.tube(
        &points,
        width * z / 1672.0,
        8,
        [width.max(3.0), 30.0],
        false,
    );
    o
}
fn oval(id: &str, x: f32, y: f32, rx: f32, ry: f32, z: f32, mat: f32) -> Object {
    let mut o = Object::new(id, mat, 1.0, 0.0);
    o.ellipsoid(
        p(x, y, z),
        V3(rx * z / 1672.0, ry * z / 1672.0, rx * z / 1672.0 * 0.35),
        if rx < 6. { 6 } else { 16 },
        if rx < 6. { 3 } else { 10 },
        [rx.max(8.0), ry.max(8.0)],
    );
    o
}
// Small authored bitmap lettering is geometry too; no font/image atlas.
fn letter(c: char) -> [u8; 7] {
    match c {
        'A' => [14, 17, 17, 31, 17, 17, 17],
        'B' => [30, 17, 17, 30, 17, 17, 30],
        'C' => [14, 17, 16, 16, 16, 17, 14],
        'D' => [30, 17, 17, 17, 17, 17, 30],
        'E' => [31, 16, 16, 30, 16, 16, 31],
        'F' => [31, 16, 16, 30, 16, 16, 16],
        'G' => [14, 17, 16, 23, 17, 17, 15],
        'H' => [17, 17, 17, 31, 17, 17, 17],
        'I' => [31, 4, 4, 4, 4, 4, 31],
        'J' => [7, 2, 2, 2, 2, 18, 12],
        'K' => [17, 18, 20, 24, 20, 18, 17],
        'L' => [16, 16, 16, 16, 16, 16, 31],
        'M' => [17, 27, 21, 21, 17, 17, 17],
        'N' => [17, 25, 25, 21, 19, 19, 17],
        'O' => [14, 17, 17, 17, 17, 17, 14],
        'P' => [30, 17, 17, 30, 16, 16, 16],
        'Q' => [14, 17, 17, 17, 21, 18, 13],
        'R' => [30, 17, 17, 30, 20, 18, 17],
        'S' => [15, 16, 16, 14, 1, 1, 30],
        'T' => [31, 4, 4, 4, 4, 4, 4],
        'U' => [17, 17, 17, 17, 17, 17, 14],
        'V' => [17, 17, 17, 17, 17, 10, 4],
        'W' => [17, 17, 17, 21, 21, 21, 10],
        'X' => [17, 17, 10, 4, 10, 17, 17],
        'Y' => [17, 17, 10, 4, 4, 4, 4],
        'Z' => [31, 1, 2, 4, 8, 16, 31],
        '2' => [14, 17, 1, 2, 4, 8, 31],
        '8' => [14, 17, 17, 14, 17, 17, 14],
        _ => [0; 7],
    }
}
fn text(id: &str, s: &str, x: f32, y: f32, size: f32, slope: f32, z: f32, mat: f32) -> Object {
    let mut o = Object::new(id, mat, 1.0, 0.0);
    for (i, c) in s.chars().enumerate() {
        for (row, bits) in letter(c).iter().enumerate() {
            for col in 0..5 {
                if bits & (1 << (4 - col)) == 0 {
                    continue;
                }
                let xx = x + (i as f32 * 6.5 + col as f32) * size;
                let yy = y + row as f32 * size + (xx - x) * slope;
                o.vertices
                    .extend(rect("letter", xx, yy, size * 0.88, size * 0.88, z, mat).vertices);
            }
        }
    }
    o
}

fn serif_text(id:&str,s:&str,x:f32,y:f32,size:f32,slope:f32,z:f32,mat:f32)->Object {
    let mut out=Object::new(id,mat,1.,0.);
    let mut advance=0.;
    for c in s.chars() {
        if c==' ' {advance+=size*3.;continue;}
        let mut paths:Vec<Vec<[f32;2]>>=match c {
            'A'=>vec![vec![[0.,1.],[0.45,0.],[0.9,1.]],vec![[0.2,0.62],[0.7,0.62]]],
            'E'=>vec![vec![[0.8,0.],[0.,0.],[0.,1.],[0.8,1.]],vec![[0.,0.48],[0.63,0.48]]],
            'F'=>vec![vec![[0.8,0.],[0.,0.],[0.,1.]],vec![[0.,0.48],[0.63,0.48]]],
            'N'=>vec![vec![[0.,1.],[0.,0.],[0.85,1.],[0.85,0.]]],
            'T'=>vec![vec![[0.,0.],[0.9,0.]],vec![[0.45,0.],[0.45,1.]]],
            'U'=>vec![vec![[0.,0.],[0.,0.75],[0.1,0.94],[0.4,1.],[0.7,0.94],[0.8,0.75],[0.8,0.]]],
            'R'=>vec![vec![[0.,1.],[0.,0.],[0.53,0.],[0.76,0.12],[0.76,0.36],[0.53,0.5],[0.,0.5]],vec![[0.44,0.5],[0.86,1.]]],
            'C'=>vec![(0..=24).map(|i|{let a=0.3+i as f32/24.*(TAU-0.6);[0.43+0.43*a.cos(),0.5-0.5*a.sin()]}).collect()],
            'S'=>vec![(0..=32).map(|i|{let t=i as f32/32.;[0.42+0.38*(t*TAU+0.6).sin(),t]}).collect()],
            _=>vec![],
        };
        if matches!(c,'A'|'E'|'F'|'N'|'R'|'T'|'U') {
            paths.push(vec![[-0.12,1.],[0.17,1.]]);
            if c!='T' {paths.push(vec![[-0.1,0.],[0.17,0.]]);}
            if matches!(c,'A'|'N'|'R') {paths.push(vec![[0.68,1.],[1.,1.]]);}
            if c=='T' {paths.push(vec![[0.27,1.],[0.64,1.]]);}
        }
        for path in paths {
            let pts:Vec<_>=path.iter().map(|q|{let xx=x+advance+q[0]*size*5.8;[xx,y+q[1]*size*8.4+(xx-x)*slope]}).collect();
            out.vertices.extend(stroke("serif",&pts,size*0.20,z,mat).vertices);
        }
        advance+=size*7.0;
    }
    out
}

pub struct Paris {
    pub objects: Vec<Object>,
    seed: u32,
}
impl Paris {
    pub fn new(seed: u32) -> Self {
        let mut s = Self {
            objects: Vec::new(),
            seed,
        };
        s.architecture();
        s.furniture();
        s.ground();
        s.fields();
        s.studies();
        s
    }
    fn add(&mut self, o: Object) {
        self.objects.push(o);
    }
    fn architecture(&mut self) {
        // Two independent facade fragments, never an enclosing room.
        self.add(quad(
            "cafe/wall",
            [[330., 76.], [745., 183.], [778., 694.], [322., 709.]],
            8.2,
            20.,
        ));
        self.add(quad(
            "cafe/left-return",
            [[302., 105.], [330., 76.], [322., 709.], [300., 722.]],
            8.3,
            24.,
        ));
        for i in 0..16 {
            let y = 96. + i as f32 * 35.;
            self.add(stroke(
                &format!("cafe/masonry-{i}"),
                &[[330., y], [746., y + 106.]],
                0.65,
                8.12,
                24.,
            ));
        }
        for (i, (x, y, w, h)) in [(376., 117., 111., 172.), (597., 174., 105., 153.)]
            .into_iter()
            .enumerate()
        {
            self.add(quad(
                &format!("window-{i}/inset"),
                [[x, y], [x + w, y + 27.], [x + w, y + h + 27.], [x, y + h]],
                7.97,
                25.,
            ));
            for dx in [0., w] {
                self.add(stroke(
                    &format!("window-{i}/jamb-{dx}"),
                    &[[x + dx, y + dx * 0.24], [x + dx, y + h + dx * 0.24]],
                    4.4,
                    7.8,
                    22.,
                ));
            }
            for dy in [0., h * 0.48, h] {
                self.add(stroke(
                    &format!("window-{i}/cross-{dy}"),
                    &[[x, y + dy], [x + w, y + dy + 27.]],
                    2.6,
                    7.8,
                    22.,
                ));
            }
            self.add(stroke(
                &format!("window-{i}/mullion"),
                &[[x + w * 0.52, y + 13.], [x + w * 0.52, y + h + 13.]],
                2.,
                7.78,
                22.,
            ));
            for side in [-1., 1.] {
                let sx = if side < 0. { x - 36. } else { x + w + 5. };
                let sy = y + (sx - x) * 0.24;
                self.add(quad(
                    &format!("shutter-{i}-{side}"),
                    [
                        [sx, sy],
                        [sx + 30., sy + 7.],
                        [sx + 30., sy + h + 7.],
                        [sx, sy + h],
                    ],
                    7.7,
                    21.,
                ));
                for j in 0..22 {
                    let yy = sy + 5. + j as f32 * (h - 8.) / 22.;
                    self.add(stroke(
                        &format!("slat-{i}-{side}-{j}"),
                        &[[sx + 2., yy], [sx + 28., yy + 6.]],
                        1.05,
                        7.64,
                        24.,
                    ));
                }
                for xx in [sx, sx + 30.] {
                    self.add(stroke(
                        &format!("shutter-edge-{i}-{side}-{xx}"),
                        &[[xx, sy], [xx, sy + h]],
                        1.4,
                        7.6,
                        22.,
                    ));
                }
            }
            self.add(quad(
                &format!("window-{i}/curtain"),
                [
                    [x + 6., y + 5.],
                    [x + w - 5., y + 29.],
                    [x + w - 8., y + 66.],
                    [x + 24., y + 45.],
                ],
                7.72,
                26.,
            ));
            for j in 0..11 {
                let xx = x + 8. + j as f32 * 9.;
                self.add(stroke(
                    &format!("curtain-fold-{i}-{j}"),
                    &[
                        [xx, y + (xx - x) * 0.24 + 8.],
                        [xx + 6., y + 43. + (xx - x) * 0.24],
                    ],
                    0.75,
                    7.68,
                    24.,
                ));
            }
            // Projecting balcony sill, front and individual iron curls.
            self.add(quad(
                &format!("balcony-{i}/top"),
                [
                    [x - 12., y + h - 20.],
                    [x + w + 13., y + h + 9.],
                    [x + w + 17., y + h + 24.],
                    [x - 16., y + h - 6.],
                ],
                7.48,
                20.,
            ));
            self.add(stroke(
                &format!("balcony-{i}/rail"),
                &[[x - 14., y + h - 39.], [x + w + 15., y + h - 10.]],
                2.3,
                7.4,
                25.,
            ));
            for j in 0..10 {
                let xx = x - 10. + j as f32 * (w + 20.) / 9.;
                let yy = y + h - 38. + (xx - x) * 0.23;
                let pts: Vec<_> = (0..15)
                    .map(|k| {
                        let t = k as f32 / 14.;
                        [xx + (t * TAU).sin() * 4., yy + t * 31.]
                    })
                    .collect();
                self.add(stroke(
                    &format!("balcony-{i}/iron-{j}"),
                    &pts,
                    1.1,
                    7.36,
                    25.,
                ));
            }
        }
        self.add(quad(
            "cafe/fascia",
            [[304., 282.], [758., 384.], [759., 441.], [303., 355.]],
            7.4,
            21.,
        ));
        for (i, dy) in [0., 7., 60., 67.].into_iter().enumerate() {
            self.add(stroke(
                &format!("cafe/fascia-mould-{i}"),
                &[[303., 282. + dy], [758., 384. + dy * 0.83]],
                2.2,
                7.27,
                24.,
            ));
        }
        self.add(serif_text(
            "cafe/lettering",
            "CAFE RESTAURANT",
            349.,
            310.,
            3.65,
            0.21,
            7.2,
            22.,
        ));
        // Three recessed bays with warm interior shelves and independent joinery.
        for (i, x) in [348., 481., 614.].into_iter().enumerate() {
            let y = 387. + i as f32 * 24.;
            let bottom = 704. - i as f32 * 8.;
            self.add(quad(
                &format!("cafe/bay-{i}"),
                [
                    [x, y],
                    [x + 114., y + 21.],
                    [x + 114., bottom - 6.],
                    [x, bottom],
                ],
                7.5,
                25.,
            ));
            for j in 0..5 {
                let yy = y + 35. + j as f32 * 37.;
                self.add(stroke(
                    &format!("cafe/shelf-{i}-{j}"),
                    &[[x + 7., yy], [x + 106., yy + 9.]],
                    2.,
                    7.44,
                    24.,
                ));
                for k in 0..7 {
                    let xx = x + 11. + k as f32 * 13.;
                    self.add(rect(
                        &format!("cafe/bottle-{i}-{j}-{k}"),
                        xx,
                        yy - 15.,
                        4.,
                        14.,
                        7.4,
                        if k % 3 == 0 { 23. } else { 21. },
                    ));
                }
            }
            for dx in [-7., 117.] {
                self.add(quad(
                    &format!("cafe/jamb-{i}-{dx}"),
                    [
                        [x + dx, y - 8.],
                        [x + dx + 8., y - 6.],
                        [x + dx + 8., bottom + 4.],
                        [x + dx, bottom + 4.],
                    ],
                    7.05,
                    21.,
                ));
                self.add(stroke(
                    &format!("cafe/jamb-edge-{i}-{dx}"),
                    &[[x + dx, y], [x + dx, bottom]],
                    1.1,
                    7.,
                    22.,
                ));
            }
            self.add(stroke(
                &format!("cafe/transom-{i}"),
                &[[x, y + 67.], [x + 114., y + 84.]],
                3.,
                7.03,
                21.,
            ));
            self.add(oval(
                &format!("cafe/pendant-{i}"),
                x + 52.,
                y + 70.,
                9.,
                12.,
                6.96,
                23.,
            ));
        }
        // Striped awning has an actual sloping top and scalloped front edge.
        for i in 0..25 {
            let a = i as f32 / 25.;
            let b = (i + 1) as f32 / 25.;
            self.add(quad(
                &format!("awning/stripe-{i}"),
                [
                    [333. + a * 425., 370. + a * 77.],
                    [333. + b * 425., 370. + b * 77.],
                    [370. + b * 413., 420. + b * 60.],
                    [370. + a * 413., 420. + a * 60.],
                ],
                6.8,
                if i % 4 == 0 { 24. } else { 26. },
            ));
            self.add(quad(
                &format!("awning/valance-{i}"),
                [
                    [370. + a * 413., 420. + a * 60.],
                    [370. + b * 413., 420. + b * 60.],
                    [370. + b * 413., 438. + b * 60.],
                    [370. + a * 413., 438. + a * 60.],
                ],
                6.73,
                26.,
            ));
        }
        self.add(text(
            "awning/label",
            "MAISON CAFE",
            490.,
            440.,
            1.7,
            0.14,
            6.65,
            25.,
        ));
        self.add(quad(
            "door/right-stone",
            [[1072., 120.], [1259., 62.], [1322., 798.], [1083., 726.]],
            8.0,
            20.,
        ));
        self.add(quad(
            "door/upper-inset",
            [[1117., 164.], [1226., 132.], [1241., 270.], [1122., 296.]],
            7.82,
            25.,
        ));
        for i in 0..10 {
            let x = 1124. + i as f32 * 11.;
            self.add(stroke(
                &format!("door/balcony-{i}"),
                &[[x, 206. - i as f32 * 3.], [x + 3., 280. - i as f32 * 2.5]],
                1.4,
                7.6,
                24.,
            ));
        }
        self.add(stroke(
            "door/balcony-rail",
            &[[1113., 201.], [1241., 165.]],
            3.,
            7.55,
            25.,
        ));
        self.add(quad(
            "door/fascia",
            [[1084., 315.], [1266., 271.], [1273., 350.], [1090., 393.]],
            7.55,
            28.,
        ));
        self.add(text("door/number", "28", 1160., 329., 2.3, -0.22, 7.4, 26.));
        self.add(quad(
            "door/inset",
            [[1103., 404.], [1257., 366.], [1282., 746.], [1114., 704.]],
            7.63,
            25.,
        ));
        for (i, x) in [1102., 1186., 1260.].into_iter().enumerate() {
            self.add(quad(
                &format!("door/stile-{i}"),
                [
                    [x, 404. - (x - 1102.) * 0.24],
                    [x + 10., 402. - (x - 1102.) * 0.24],
                    [x + 28., 743.],
                    [x + 17., 740.],
                ],
                7.24,
                28.,
            ));
        }
        self.add(quad(
            "door/wood-panel",
            [[1115., 430.], [1175., 416.], [1186., 664.], [1123., 652.]],
            7.4,
            28.,
        ));
        self.add(quad(
            "door/window",
            [[1204., 403.], [1253., 391.], [1265., 638.], [1212., 627.]],
            7.37,
            23.,
        ));
        for i in 0..14 {
            let y = 409. + i as f32 * 16.;
            self.add(stroke(
                &format!("door/shade-{i}"),
                &[[1208., y], [1258., y - 9.]],
                1.2,
                7.30,
                24.,
            ));
        }
        for i in 0..4 {
            let y = 462. + i as f32 * 53.;
            self.add(stroke(
                &format!("door/shelf-{i}"),
                &[[1213., y], [1262., y + 2.]],
                2.,
                7.22,
                25.,
            ));
            for j in 0..4 {
                self.add(rect(
                    &format!("door/book-{i}-{j}"),
                    1215. + j as f32 * 10.,
                    y - 24.,
                    6.,
                    22.,
                    7.18,
                    if j % 2 == 0 { 24. } else { 22. },
                ));
            }
        }
        for y in [665., 712.] {
            self.add(stroke(
                &format!("door/panel-{y}"),
                &[[1128., y], [1187., y + 13.]],
                2.,
                7.12,
                24.,
            ));
        }
        self.add(stroke(
            "door/handle",
            &[[1180., 532.], [1181., 553.]],
            2.3,
            7.05,
            22.,
        ));
        self.add(stroke(
            "door/sill",
            &[[1097., 720.], [1302., 780.]],
            7.,
            7.0,
            24.,
        ));
        // Thin ivy stems and individually authored leaves, limited to facade edges.
        for (i, (x, y, h)) in [
            (535., 122., 208.),
            (736., 304., 248.),
            (1089., 206., 336.),
            (326., 530., 119.),
        ]
        .into_iter()
        .enumerate()
        {
            let pts: Vec<_> = (0..18)
                .map(|j| [x + 9. * (j as f32 * 0.7).sin(), y + j as f32 * h / 17.])
                .collect();
            self.add(stroke(&format!("ivy/{i}"), &pts, 1.3, 6.65, 21.));
            for j in 0..115 {
                let n = noise(self.seed + 5, j + i as u32 * 100);
                let yy = y + noise(self.seed + 9, j + i as u32 * 100) * h;
                self.add(oval(
                    &format!("ivy/{i}/leaf-{j}"),
                    x + (n - 0.5) * 50.,
                    yy,
                    2.7 + n * 2.,
                    1.6 + n * 2.,
                    6.6,
                    if j % 13 == 0 { 30. } else { 21. },
                ));
            }
        }
    }
    fn furniture(&mut self) {
        // Lamp is silhouette, iron body, warm glass and separate roof facets.
        for (id, x, y, k, z) in [
            ("lamp", 290., 233., 1., 5.7),
            ("wall-lamp", 315., 399., 0.56, 6.3),
        ] {
            self.add(stroke(
                &format!("{id}/post"),
                &[[x, y + 80. * k], [x - 5. * k, y + 360. * k]],
                4. * k,
                z,
                25.,
            ));
            self.add(quad(
                &format!("{id}/glass"),
                [
                    [x - 25. * k, y + 9. * k],
                    [x + 26. * k, y + 9. * k],
                    [x + 14. * k, y + 64. * k],
                    [x - 12. * k, y + 64. * k],
                ],
                z - 0.04,
                23.,
            ));
            self.add(quad(
                &format!("{id}/roof"),
                [
                    [x - 31. * k, y + 7. * k],
                    [x, y - 17. * k],
                    [x + 31. * k, y + 7. * k],
                    [x, y + 12. * k],
                ],
                z - 0.1,
                25.,
            ));
            self.add(oval(
                &format!("{id}/finial"),
                x,
                y - 23. * k,
                5. * k,
                7. * k,
                z - 0.12,
                25.,
            ));
            for dx in [-25., 0., 25.] {
                self.add(stroke(
                    &format!("{id}/bar-{dx}"),
                    &[
                        [x + dx * k, y + 8. * k],
                        [x + dx * 0.5 * k, y + 65. * k],
                        [x, y + 80. * k],
                    ],
                    1.9 * k,
                    z - 0.14,
                    25.,
                ));
            }
        }
        self.add(quad(
            "menu/frame",
            [[225., 480.], [304., 487.], [306., 614.], [225., 608.]],
            5.65,
            24.,
        ));
        self.add(quad(
            "menu/board",
            [[231., 487.], [298., 493.], [299., 606.], [231., 600.]],
            5.6,
            25.,
        ));
        for (i, word) in ["VINS", "PLATS", "CAFE"].into_iter().enumerate() {
            self.add(text(
                &format!("menu/{i}"),
                word,
                240.,
                506. + i as f32 * 29.,
                1.55,
                0.05,
                5.5,
                26.,
            ));
        }
        // Bicycle-exception sign, not an inferred traffic instruction.
        self.add(stroke(
            "sign/post",
            &[[982., 393.], [990., 678.]],
            3.2,
            5.95,
            24.,
        ));
        self.add(oval("sign/rim", 982., 360., 37., 43., 5.8, 30.));
        self.add(oval("sign/face", 982., 360., 33., 39., 5.7, 28.));
        self.add(text("sign/sauf", "SAUF", 961., 339., 1.55, 0., 5.5, 26.));
        for x in [970., 992.] {
            let ring: Vec<_> = (0..=24)
                .map(|i| {
                    let t = i as f32 / 24. * TAU;
                    [x + t.cos() * 9., 375. + t.sin() * 9.]
                })
                .collect();
            self.add(stroke(&format!("sign/wheel-{x}"), &ring, 0.7, 5.45, 26.));
        }
        self.add(stroke(
            "sign/bicycle",
            &[
                [970., 375.],
                [978., 360.],
                [992., 375.],
                [980., 375.],
                [974., 365.],
                [990., 365.],
                [995., 357.],
            ],
            0.85,
            5.43,
            26.,
        ));
        for (i, x, y) in [(0, 1094., 746.), (1, 1304., 795.)] {
            self.add(stroke(
                &format!("bollard-{i}/body"),
                &[[x, y], [x, y - 96.]],
                6.5,
                5.5,
                25.,
            ));
            self.add(oval(
                &format!("bollard-{i}/cap"),
                x,
                y - 103.,
                10.,
                12.,
                5.45,
                25.,
            ));
            self.add(stroke(
                &format!("bollard-{i}/rim"),
                &[[x - 8., y - 86.], [x + 8., y - 86.]],
                1.4,
                5.4,
                22.,
            ));
        }
        for (i, x, y, k) in [(0, 236., 689., 0.94), (1, 397., 686., 1.0)] {
            let arc: Vec<_> = (0..=32)
                .map(|j| {
                    let t = std::f32::consts::PI + j as f32 / 32. * std::f32::consts::PI;
                    [x + 43. * k * t.cos(), y + 64. * k * t.sin()]
                })
                .collect();
            self.add(stroke(&format!("chair-{i}/arch"), &arc, 3., 4.8, 24.));
            for side in [-1., 1.] {
                self.add(stroke(
                    &format!("chair-{i}/leg-{side}"),
                    &[[x + side * 42. * k, y - 3.], [x + side * 30. * k, y + 87.]],
                    3.,
                    4.8,
                    24.,
                ));
            }
            self.add(oval(
                &format!("chair-{i}/seat"),
                x,
                y + 12.,
                42. * k,
                10. * k,
                4.75,
                24.,
            ));
            for j in -6..7 {
                let xx = j as f32 * 5.5;
                let top = y - 60. * (1. - (xx / 43.).powi(2)).max(0.).sqrt();
                self.add(stroke(
                    &format!("chair-{i}/weave-{j}"),
                    &[[x + xx, top], [x + xx + 3., y + 7.]],
                    0.9,
                    4.7,
                    22.,
                ));
            }
            for j in 0..10 {
                let yy = y - j as f32 * 5.6;
                let w = 43. * (1. - ((yy - y) / 64.).powi(2)).max(0.).sqrt();
                self.add(stroke(
                    &format!("chair-{i}/cross-{j}"),
                    &[[x - w, yy], [x + w, yy]],
                    0.75,
                    4.68,
                    24.,
                ));
            }
        }
        self.add(stroke(
            "table/stem",
            &[[317., 638.], [313., 764.]],
            4.1,
            4.4,
            25.,
        ));
        self.add(stroke(
            "table/feet",
            &[[274., 777.], [313., 746.], [353., 779.]],
            3.1,
            4.4,
            25.,
        ));
        self.add(oval("table/top", 317., 637., 59., 10., 4.3, 22.));
        self.add(oval("table/cup", 322., 624., 8., 10., 4.2, 26.));
        self.add(oval("table/saucer", 322., 634., 14., 3., 4.1, 26.));
        self.add(oval("table/glass", 293., 626., 4., 9., 4.1, 23.));
        for (i, x, y) in [(0, 188., 697.), (1, 691., 626.)] {
            self.add(quad(
                &format!("planter-{i}"),
                [
                    [x - 33., y],
                    [x + 32., y],
                    [x + 24., y + 69.],
                    [x - 25., y + 69.],
                ],
                5.4,
                25.,
            ));
            for j in 0..60 {
                let n = noise(self.seed, j + i * 100);
                let xx = x + (n - 0.5) * 110.;
                let yy = y - noise(self.seed + 3, j + i * 100) * 82.;
                if j % 5 == 0 {
                    self.add(stroke(
                        &format!("plant-{i}/stem-{j}"),
                        &[[x, y + 10.], [xx, yy]],
                        0.8,
                        5.2,
                        21.,
                    ));
                }
                self.add(oval(
                    &format!("plant-{i}/leaf-{j}"),
                    xx,
                    yy,
                    3.4,
                    2.1,
                    5.1,
                    if j % 19 == 0 { 30. } else { 21. },
                ));
            }
        }
    }
    fn ground(&mut self) {
        // Perspective-set cobbles have uneven rounded shoulders, narrow joints and
        // sparse missing edge groups, rather than a regular checkerboard platform.
        for row in 0..19 {
            let t=row as f32/18.;
            let y=679.+t.powf(1.26)*215.;
            let step=22.+t*17.;
            for col in 0..48 {
                let n=noise(self.seed+29,row*71+col);
                let x=155.+col as f32*step+(row%2) as f32*step*0.48;
                let left=if row>9 {440.+(row-9) as f32*14.}else{145.};
                let right=if row>15 {1280.-(row-15) as f32*43.}else{1360.};
                if x<left || x>right || n<0.045 || (row>16&&n<0.40) {continue;}
                let yy=y+(x-700.)*0.065;
                let h=7.+t*7.; let w=step-1.9;
                let z=6.9-t*1.4;
                let corners=[[x+2.,yy],[x+w-3.,yy-1.],[x+w+4.,yy+h-2.],[x+w+2.,yy+h],
                    [x+4.,yy+h+1.],[x+1.,yy+h-1.],[x-2.,yy+3.],[x,yy+1.]];
                let mut stone=Object::new(&format!("paver-{row}-{col}"),33.,1.,0.);
                let center=p(x+w*0.5,yy+h*0.5,z-0.012);
                for i in 0..8 { let a=corners[i];let b=corners[(i+1)%8];
                    stone.quad(center,p(a[0],a[1],z),p(b[0],b[1],z),center,[w/3.,h/3.],1);
                }
                stone.strands.clear();
                self.add(stone);
                if n>0.95 {
                    self.add(stroke(&format!("paver-accent-{row}-{col}"),&[[x+3.,yy+h],[x+w*0.7,yy+h-1.]],0.6,z-0.03,if n>0.98 {30.} else {29.}));
                }
            }
        }
        for i in 0..14 {
            let x = 1090. + i as f32 * 17.;
            let y = 726. + i as f32 * 5.;
            self.add(quad(
                &format!("curb-{i}/top"),
                [
                    [x, y],
                    [x + 17., y + 5.],
                    [x + 16., y + 17.],
                    [x - 2., y + 11.],
                ],
                5.4,
                20.,
            ));
            self.add(quad(
                &format!("curb-{i}/front"),
                [
                    [x - 2., y + 11.],
                    [x + 16., y + 17.],
                    [x + 16., y + 38.],
                    [x - 2., y + 30.],
                ],
                5.35,
                24.,
            ));
        }
    }
    fn studies(&mut self) {
        let mut copies=Vec::new();
        for (index,src,dest) in [(0,[680.,790.,190.,85.],[1278.,65.,168.,158.]),(1,[340.,110.,180.,175.],[1460.,65.,168.,158.])] {
            for o in &self.objects {
                let relevant=if index==0 {o.id.starts_with("paver-")}else{o.id.starts_with("window-0")||o.id.starts_with("shutter-0")||o.id.starts_with("slat-0")||o.id.starts_with("balcony-0")};
                if !relevant || o.vertices.is_empty(){continue;}
                let a=crate::math::project(o.vertices[0].p);
                let x=a[0]*1672.;let y=a[1]*941.;
                if x<src[0]||x>src[0]+src[2]||y<src[1]||y>src[1]+src[3]{continue;}
                let mut copy=o.clone();copy.id=format!("study-{index}/{}",o.id);copy.strands.clear();
                for v in &mut copy.vertices {
                    let q=crate::math::project(v.p);let xx=dest[0]+((q[0]*1672.-src[0])/src[2]).clamp(0.,1.)*dest[2];
                    let yy=dest[1]+((q[1]*941.-src[1])/src[3]).clamp(0.,1.)*dest[3];
                    v.p=p(xx,yy,2.0+(v.p.2-8.)*0.015);
                }
                copies.push(copy);
            }
            self.add(rect(&format!("study-{index}/border"),dest[0]-3.,35.,dest[2]+6.,191.,2.4,26.));
            self.add(rect(&format!("study-{index}/ground"),dest[0],dest[1],dest[2],dest[3],2.3,25.));
        }
        self.objects.extend(copies);
    }
    fn fields(&mut self) {
        for (i, (x, y, w, h)) in [
            (278., 65., 92., 310.),
            (344., 30., 335., 64.),
            (708., 166., 89., 271.),
            (781., 327., 62., 323.),
            (178., 474., 80., 251.),
            (1072., 81., 70., 260.),
            (1256., 240., 86., 451.),
            (1318., 557., 73., 247.),
            (310., 705., 387., 52.),
            (584., 812., 490., 69.),
        ]
        .into_iter()
        .enumerate()
        {
            self.add(quad(
                &format!("field/{i}"),
                [
                    [x, y],
                    [x + w, y + w * 0.16],
                    [x + w, y + h + w * 0.16],
                    [x, y + h],
                ],
                8.7,
                32.,
            ));
        }
    }
    pub fn frame(
        &self,
        out: &mut Frame,
        time: f64,
        reduced: bool,
        overlays: bool,
    ) -> Result<(), String> {
        out.reset();
        let stage = if reduced { 4. } else { phase(time) };
        let idle = if reduced {
            0.
        } else {
            ((time - BUILD_MS).max(0.) / 1000.) as f32
        };
        for o in &self.objects {
            emit(out, o, stage, idle, self.seed, overlays);
        }
        for o in people(idle) {
            emit(out, &o, stage, idle, self.seed, overlays);
        }
        if stage > 0.05 && stage < 1.8 {
            brackets(out, stage, self.seed);
        }
        if stage > 2. && stage < 3.4 && !reduced {
            let mut trails = Object::new("flow/anchored", 31., 1., 0.);
            for (j, o) in self.objects.iter().enumerate().step_by(3) {
                if o.vertices.is_empty() {
                    continue;
                }
                let n = noise(self.seed, j as u32);
                let q = ((stage - 2.) * 1.5 - n * 0.6).clamp(0., 1.);
                if q <= 0. || q >= 1. {
                    continue;
                }
                let target = o.vertices[(j * 17) % o.vertices.len()].p;
                let offset = V3(-0.025 * target.2, 0.008 * target.2, 0.);
                let at = target + offset * (1. - smooth(q));
                trails.line(at, at + V3(-0.009 * target.2, 0.003 * target.2, 0.), 0.6);
            }
            emit_lines(out, &trails, 0.75, self.seed, 29.);
        }
        if !out.valid() {
            return Err("R8 frame exceeds bounded geometry budget".into());
        }
        Ok(())
    }
}
fn emit(out: &mut Frame, o: &Object, stage: f32, idle: f32, seed: u32, overlays: bool) {
    if stage <= 0. || (o.id.starts_with("study-") && stage < 3.) {
        return;
    }
    let salt =
        o.id.bytes()
            .fold(seed, |n, b| n.wrapping_mul(31).wrapping_add(b as u32));
    out.objects += 1;
    // A per-surface cell threshold creates disconnected islands, never scene alpha.
    for v in &o.vertices {
        out.triangles.extend([
            v.p.0,
            v.p.1,
            v.p.2,
            v.n.0,
            v.n.1,
            v.n.2,
            v.uv[0],
            v.uv[1],
            if o.id.starts_with("person/") || o.id.starts_with("joined/") { o.material + 100. } else { o.material },
            stage,
            if overlays {
                1. + 0.12 * (idle * 0.38 + salt as f32 % 17.).sin()
            } else {
                0.
            },
            (salt % 10000) as f32,
        ]);
    }
    out.surfaces += o.vertices.len() / 3;
    if stage < 1.2 && !o.strands.is_empty() && salt % 9 == 0 {
        emit_lines(out, o, (stage * 0.32).min(0.3), seed, 31.);
    }
}
fn emit_lines(out: &mut Frame, o: &Object, light: f32, seed: u32, material: f32) {
    for s in &o.strands {
        for pair in s.points.windows(2) {
            for p in pair {
                out.lines.extend([
                    p.0 * 0.999,
                    p.1 * 0.999,
                    p.2 * 0.999,
                    0.,
                    0.,
                    -1.,
                    0.,
                    0.,
                    material,
                    5.,
                    light,
                    seed as f32,
                ]);
            }
            out.segments += 1;
        }
    }
}
fn brackets(out: &mut Frame, stage: f32, seed: u32) {
    for (id, name, x, y, w, h) in [
        (0, "LAMP", 256., 207., 70., 115.),
        (1, "SIGN", 937., 311., 90., 98.),
        (2, "TABLE", 253., 612., 128., 173.),
        (3, "FIGURES", 716., 474., 291., 386.),
        (4, "DOOR", 1093., 367., 202., 405.),
    ] {
        if stage < 0.12 + id as f32 * 0.11 {
            continue;
        }
        let mut o = Object::new(name, 31., 1., 0.);
        let len = 14.;
        for (xx, yy, sx, sy) in [
            (x, y, 1., 1.),
            (x + w, y, -1., 1.),
            (x, y + h, 1., -1.),
            (x + w, y + h, -1., -1.),
        ] {
            o.line(p(xx + sx * len, yy, 3.), p(xx, yy, 3.), 0.8);
            o.line(p(xx, yy, 3.), p(xx, yy + sy * len, 3.), 0.8);
        }
        emit_lines(out, &o, (1.8 - stage).min(0.8), seed, 31.);
        let label = text(
            &format!("box/{name}"),
            name,
            x + 18.,
            y - 13.,
            1.2,
            0.,
            2.9,
            31.,
        );
        emit(out, &label, 4., 0., seed, false);
    }
}
fn people(idle: f32) -> Vec<Object> {
    let mut out = Vec::new();
    // Two rear figures remain separate and rear-facing throughout.
    person(
        &mut out,
        "rear-left",
        439.,
        712.,
        0.62,
        0.,
        idle * 0.18,
        26.,
        25.,
        false,
    );
    person(
        &mut out,
        "rear-right",
        579.,
        707.,
        0.61,
        0.,
        idle * 0.16 + 0.7,
        26.,
        25.,
        false,
    );
    // Three restrained forward steps, then stop. No reset/teleport loop.
    let t = idle.min(9.0);
    let travel = t / 9. * 35.;
    person(
        &mut out,
        "front-left",
        777. - travel,
        824. + travel * 0.17,
        1.,
        t,
        idle,
        26.,
        27.,
        true,
    );
    person(
        &mut out,
        "front-right",
        945. - travel,
        849. + travel * 0.17,
        1.12,
        t,
        idle,
        25.,
        26.,
        true,
    );
    let hand = [
        852. - travel,
        650. + travel * 0.17 + 1.2 * (idle * 0.7).sin(),
    ];
    for (name, shoulder, elbow) in [
        (
            "left",
            [801. - travel, 578. + travel * 0.17],
            [826. - travel, 620. + travel * 0.17],
        ),
        (
            "right",
            [910. - travel, 567. + travel * 0.17],
            [884. - travel, 614. + travel * 0.17],
        ),
    ] {
        out.push(stroke(
            &format!("joined/{name}/sleeve"),
            &[shoulder, elbow],
            8.,
            3.9,
            if name == "left" { 26. } else { 25. },
        ));
        out.push(stroke(
            &format!("joined/{name}/forearm"),
            &[elbow, hand],
            5.5,
            3.85,
            27.,
        ));
    }
    out.push(oval("joined/hands", hand[0], hand[1], 6., 7., 3.7, 27.));
    out
}
fn person(
    out: &mut Vec<Object>,
    id: &str,
    x: f32,
    ground: f32,
    k: f32,
    walk: f32,
    life: f32,
    shirt: f32,
    trousers: f32,
    front: bool,
) {
    let hip_y = ground - 141. * k;
    let breath = if walk == 0. && !front {
        1.4 * (life * 0.6).sin()
    } else {
        0.
    };
    let pt = |dx: f32, dy: f32| [x + dx * k, ground + dy * k + breath];
    let z = if front { 4.0 } else { 6.35 };
    // Foot contacts are fixed in world space during each stance; each swing advances
    // once to its next contact. Root travel is separate from the periodic pose.
    for side in 0..2 {
        let offset = if front && shirt == 26. { if side == 0 { 0.08 } else { 0.72 } } else { side as f32 * 0.5 + 0.12 };
        let cycles = walk / 3. + offset;
        let cycle = cycles.floor();
        let f = cycles - cycle;
        let step = 35. / 3.;
        let root_travel = walk / 9. * 35.;
        let foot_x = if front {
            root_travel
                - cycle * step
                - if f > 0.55 {
                    smooth((f - 0.55) / 0.45) * step
                } else {
                    0.
                }
        } else {
            0.
        };
        let lift = if front && f > 0.55 && walk < 9. {
            ((f - 0.55) / 0.45 * std::f32::consts::PI).sin() * 15.
        } else {
            0.
        };
        let dx = if front && shirt == 26. { if side == 0 { -44. } else { 64. } } else if side == 0 { -20. } else { 18. };
        let hip = [x + if side == 0 { -9. } else { 10. } * k, hip_y];
        let ankle = [x + dx * k + foot_x, ground - foot_x * 0.17 - 7. * k - lift];
        let knee = [
            (hip[0] + ankle[0]) * 0.5 + lift * 0.4,
            (hip_y + ankle[1]) * 0.5,
        ];
        let mut leg = Object::new(&format!("person/{id}/leg-{side}"), trousers, 1., 0.);
        leg.tapered_tube(
            &[
                p(hip[0], hip[1], z),
                p(knee[0], knee[1], z - 0.02),
                p(ankle[0], ankle[1], z - 0.04),
            ],
            [12. * k * z / 1672., 7. * k * z / 1672.],
            10,
            [16., 65.],
            false,
        );
        out.push(leg);
        out.push(oval(
            &format!("person/{id}/shoe-{side}"),
            ankle[0] - 5. * k,
            ankle[1] + 4. * k,
            13. * k,
            6. * k,
            z - 0.08,
            if shirt == 26. && front { 26. } else { 25. },
        ));
    }
    let shoulders = pt(0., -251.);
    let mut torso = Object::new(&format!("person/{id}/torso"), shirt, 1., 0.);
    torso.surface(36, 18, [45., 64.], |u, v| {
        let a = u * TAU;
        let woman = front && shirt == 26.;
        let profile = if woman { [18., 30., 29., 24., 28., 36.] } else { [17., 33., 32., 26., 25., 28.] };
        let segment = (v * 5.).floor().min(4.) as usize;
        let width = profile[segment] + (profile[segment + 1] - profile[segment]) * (v * 5. - segment as f32);
        let folds = (a * 11. + v * 4.).sin() * (1.2 + v * 1.1) + (a * 19. - v * 8.).sin() * 0.5;
        let lean = if woman { -12. * (1. - v) } else { 4. * (1. - v) };
        p(shoulders[0] + (lean + (width + folds) * a.cos()) * k,
          shoulders[1] + v * 111. * k + a.cos() * 3. * k + if woman { (a * 3.).sin() * v.powi(6) * 5. } else { 0. },
          z + a.sin() * (0.065 + 0.018 * (v * 3.).sin()) * k)
    });
    out.push(torso);
    out.push(oval(
        &format!("person/{id}/neck"),
        x,
        ground - 260. * k,
        7. * k,
        13. * k,
        z - 0.02,
        27.,
    ));
    out.push(oval(
        &format!("person/{id}/head"),
        x - if front && shirt == 26. { 12. } else { 3. } * k,
        ground - 282. * k,
        14. * k,
        22. * k,
        z - 0.06,
        if front { 25. } else { 27. },
    ));
    out.push(oval(
        &format!("person/{id}/hair"),
        x,
        ground - 294. * k,
        18. * k,
        17. * k,
        z - 0.11,
        25.,
    ));
    if front && shirt == 26. {
        for j in 0..9 {
            let xx = x - 20. * k + j as f32 * 4.5 * k;
            out.push(stroke(
                &format!("person/{id}/hair-{j}"),
                &[
                    [xx, ground - 291. * k],
                    [xx - 7. * k, ground - 263. * k],
                    [xx - 3. * k, ground - 244. * k],
                ],
                3.8 * k,
                z - 0.13,
                25.,
            ));
        }
    }
    let sides: &[f32] = if front {
        if shirt == 26. {
            &[-1.]
        } else {
            &[1.]
        }
    } else {
        &[-1., 1.]
    };
    for &side in sides {
        let swing = if front {
            4. * (walk * TAU / 3.).sin()
        } else {
            1.4 * (life * 0.9).sin()
        };
        let a = pt(side * 25., -243.);
        let b = pt(side * 35. + swing, -188.);
        let c = pt(side * 37. + swing, -149.);
        out.push(stroke(
            &format!("person/{id}/sleeve-{side}"),
            &[a, b],
            9. * k,
            z - 0.08,
            shirt,
        ));
        out.push(stroke(
            &format!("person/{id}/arm-{side}"),
            &[b, c],
            5.3 * k,
            z - 0.1,
            27.,
        ));
        out.push(oval(
            &format!("person/{id}/hand-{side}"),
            c[0],
            c[1] + 3.,
            4.5 * k,
            7. * k,
            z - 0.13,
            27.,
        ));
    }
    let chest = pt(if front && shirt == 26. { -10. } else { 2. }, -244.);
    for side in [-1., 1.] {
        out.push(quad(&format!("person/{id}/collar-{side}"),
            [[chest[0], chest[1]-8.*k],[chest[0]+side*15.*k,chest[1]+2.*k],
             [chest[0]+side*8.*k,chest[1]+19.*k],[chest[0],chest[1]+5.*k]],z-0.13,shirt));
    }
    out.push(stroke(&format!("person/{id}/placket"),
        &[chest, [chest[0]+3.*k,ground-178.*k]],0.45*k,z-0.18,if shirt==26. {22.} else {28.}));
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn phases_and_rewind_are_bounded() {
        assert_eq!(BOUNDARIES.map(phase), [0., 1., 2., 3., 4.]);
        let scene = Paris::new(33);
        let mut a = Frame::default();
        let mut b = Frame::default();
        for t in [
            0., 3500., 7000., 14000., 17500., 21000., 30000., 34000., 60000.,
        ] {
            scene.frame(&mut a, t, false, true).unwrap();
            scene.frame(&mut b, t, false, true).unwrap();
            assert_eq!(a.triangles, b.triangles);
            assert_eq!(a.lines, b.lines);
            assert!(a.triangles.len() / STRIDE < crate::geometry::MAX_VERTICES);
        }
        scene.frame(&mut a, 34000., true, true).unwrap();
        scene.frame(&mut b, 1000., true, true).unwrap();
        assert_eq!(a.triangles, b.triangles);
        let mut ids = std::collections::HashSet::new();
        for o in &scene.objects {
            assert!(ids.insert(&o.id), "{}", o.id);
        }
    }
}
