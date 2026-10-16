import * as THREE from 'three'
import { formlessEyeSamples, constructionSchedule } from './samples'
import { clampTime, idlePhase } from './timeline'

function inject(source: string, before: string, after: string) {
  if (!source.includes(before)) throw new Error('Construction shader integration marker missing')
  return source.replace(before, after)
}

export function createConstruction(data: Float32Array) {
  const samples = formlessEyeSamples()
  const { phases, targets } = constructionSchedule(data, samples.length)
  const build = { value: 0 }, life = { value: 0 }, pixelScale = { value: 1 }
  const position = new Float32Array(samples.length * 3)
  const destination = new Float32Array(samples.length * 3)
  const color = new Float32Array(samples.length * 3)
  const departure = new Float32Array(samples.length)
  const alpha = new Float32Array(samples.length)
  samples.forEach((point, i) => {
    const target = targets[i]!
    position.set([point.x, point.y, 0], i * 3)
    destination.set(data.subarray(target * 10, target * 10 + 3), i * 3)
    color.set([point.r, point.g, point.b], i * 3)
    departure[i] = phases[target * 2]! - 1.35
    alpha[i] = point.alpha
  })
  const eyeGeometry = new THREE.BufferGeometry()
  eyeGeometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  eyeGeometry.setAttribute('destination', new THREE.BufferAttribute(destination, 3))
  eyeGeometry.setAttribute('color', new THREE.BufferAttribute(color, 3))
  eyeGeometry.setAttribute('departure', new THREE.BufferAttribute(departure, 1))
  eyeGeometry.setAttribute('coverage', new THREE.BufferAttribute(alpha, 1))
  const eyeMaterial = new THREE.ShaderMaterial({
    vertexColors: true, transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending, uniforms: { build, pixelScale },
    vertexShader: `
      attribute vec3 destination;
      attribute float departure;
      attribute float coverage;
      uniform float build;
      uniform float pixelScale;
      varying vec3 ink;
      varying float opacity;
      void main() {
        float raw = clamp((build - departure) / 1.35, 0.0, 1.0);
        float t = raw * raw * (3.0 - 2.0 * raw);
        vec3 p = mix(position, destination, t);
        vec2 delta = destination.xy - position.xy;
        vec2 side = normalize(vec2(-delta.y, delta.x) + vec2(.00001));
        p.xy += side * sin(t * 3.14159265) * .065 * sin(departure * 13.0);
        if (build < 2.0) p.xy *= 1.0 - .035 * sin(build * 1.5707963);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
        gl_PointSize = max(1.0, (2.1 + sin(raw * 3.14159265) * .7) * pixelScale);
        ink = mix(color, vec3(.7), t * .8);
        opacity = raw < 1.0 ? coverage : 0.0;
      }`,
    fragmentShader: `
      varying vec3 ink;
      varying float opacity;
      void main() {
        if (opacity < .01) discard;
        gl_FragColor = vec4(ink,opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
  const eye = new THREE.Points(eyeGeometry, eyeMaterial)
  eye.frustumCulled = false

  // Authored object bounds share the exact source-to-world projection.
  const bounds = [[.14,.23,.20,.56], [.10,.71,.27,.97], [.43,.59,.63,.995], [.56,.37,.615,.49]]
  const corners: number[] = []
  const xy = (x: number, y: number) => [(x - .5) * 2, (.5 - y) * 2 * 1720 / 3392, .4]
  for (const [x1, y1, x2, y2] of bounds) {
    const w = Math.min(.018, (x2! - x1!) * .25), h = Math.min(.028, (y2! - y1!) * .25)
    for (const [x, y, dx, dy] of [[x1!, y1!, w, h], [x2!, y1!, -w, h], [x1!, y2!, w, -h], [x2!, y2!, -w, -h]]) {
      corners.push(...xy(x!, y!), ...xy(x! + dx!, y!), ...xy(x!, y!), ...xy(x!, y! + dy!))
    }
  }
  const boundsGeometry = new THREE.BufferGeometry()
  boundsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(corners, 3))
  const boundsMaterial = new THREE.LineBasicMaterial({ color: 0xb5afa0, transparent: true, opacity: .5, depthTest: false })
  const brackets = new THREE.LineSegments(boundsGeometry, boundsMaterial)

  return {
    eye, brackets, build, life, eyeCount: samples.length,
    bytes: phases.byteLength + position.byteLength + destination.byteLength + color.byteLength + departure.byteLength + alpha.byteLength + corners.length * 4,
    attach(geometry: THREE.BufferGeometry) { geometry.setAttribute('assembly', new THREE.BufferAttribute(phases, 2)) },
    vertex(source: string) {
      let result = 'attribute vec2 assembly;\nuniform float build;\nuniform float life;\nvarying float ambientAlpha;\nvarying float exists;\nvarying float flightTrail;\nvarying float trailSize;\n' + source
      result = inject(result, '  gl_Position = projectionMatrix', `
        exists = 1.0;
        ambientAlpha = 1.0;
        float travel = 1.0;
        if (build < 30.0) {
          exists = step(assembly.x, build);
          if (assembly.y > .5) {
            travel = smoothstep(assembly.x, assembly.x + 1.2, build);
            float displacement = assembly.y < 1.5 ? .022 : .035;
            p.xy += vec2(cos(seed * 73.0), sin(seed * 73.0)) * (1.0 - travel) * displacement;
          }
        } else if (life > 0.0) {
          float phase = life * .05235987756;
          float edge = step(2.5, kind);
          float participation = mix(step(.4, seed), step(.97, seed), edge);
          vec2 uv = vec2(position.x * .5 + .5, .5 - position.y * 3392.0 / 3440.0);
          bool foregroundPeople = uv.x > .42 && uv.x < .64 && uv.y > .56;
          bool cafePeople = uv.x > .23 && uv.x < .38 && uv.y > .59 && uv.y < .87;
          if (foregroundPeople || cafePeople) participation = 0.0;
          float heading = mix(seed * 6.2831853, angle, edge);
          vec2 tangent = vec2(cos(heading), sin(heading));
          vec2 side = vec2(-tangent.y, tangent.x);
          float amplitude = mix(.006, .0016, edge) * participation;
          p.xy += amplitude * (tangent * sin(phase * 13.0 + seed * 4.0) * sin(phase * 3.0)
            + side * .4 * sin(phase * 17.0 + seed * 6.0) * sin(phase * 2.0));
          ambientAlpha = 1.0 - .18 * participation * pow(sin(phase * 5.0), 2.0)
            * (.5 + .5 * sin(phase * 11.0 + seed * 6.2831853));
        }
        gl_Position = projectionMatrix`)
      result = inject(result, '  direction = angle;', `  direction = angle;
        flightTrail = 0.0;
        trailSize = 1.0;
        if (build < 30.0) {
          float coloring = smoothstep(21.0 + seed * 2.0, 30.0, build);
          ink = mix(vec3(.62), color, coloring);
          if (travel < .98 && assembly.y > 1.5) {
            family = 3.0;
            direction = seed * 73.0;
            gl_PointSize = max(gl_PointSize, (8.0 + seed * 10.0) * pixelScale * (1.0 - travel));
            flightTrail = 1.0;
            trailSize = gl_PointSize;
          }
        }`)
      return result
    },
    fragment(source: string) {
      let result = inject('varying float ambientAlpha;\nvarying float exists;\nvarying float flightTrail;\nvarying float trailSize;\n' + source, 'void main() {', 'void main() {\n  if (exists < .5) discard;')
      result = inject(result, '  if (a < .025) discard;', `
        if (flightTrail > .5) {
          vec2 q = mat2(cos(direction), -sin(direction), sin(direction), cos(direction)) * p;
          float width = 1.0 / max(trailSize, 1.0);
          a = (1.0 - smoothstep(width, width * 2.0, abs(q.y))) * (1.0 - smoothstep(.65, 1.0, abs(q.x))) * .22;
        }
        a *= ambientAlpha;
        if (a < .025) discard;`)
      return result
    },
    resize(scale: number) { pixelScale.value = scale },
    set(seconds: number, idleSeconds = 0) {
      build.value = clampTime(seconds)
      life.value = build.value === 30 ? idlePhase(idleSeconds) : 0
      eye.visible = build.value < 7
      brackets.visible = build.value >= 2.8 && build.value < 14
      boundsMaterial.opacity = Math.min(.5, (build.value - 2.8) * .35, (14 - build.value) * .2)
    },
    stats() {
      let arrived = 0
      for (let i = 0; i < phases.length; i += 2) if (phases[i]! <= build.value) arrived++
      return { eyePoints: samples.length, bornSamples: arrived, constructionTime: build.value }
    },
    dispose() { eyeGeometry.dispose(); eyeMaterial.dispose(); boundsGeometry.dispose(); boundsMaterial.dispose() },
  }
}
