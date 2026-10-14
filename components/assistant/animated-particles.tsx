"use client"

import React, { useEffect, useRef } from "react"

// ---------------------------------------------------------------------------
// Particle Core AI Avatar
//
// A slowly-turning sphere of fine ember-and-bone particles around a white-hot
// centre — the assistant as a living core, not a face. The particle skin
// shimmers and breathes; a few gold data-currents ride the surface; a loose
// veil of energy hangs around it and expands with the voice; sparks lift off
// the top and drift up. It reacts by mode: on `listening` it draws tight, on
// `thinking` a scan sweeps it and it turns faster, on `speaking` its surface
// pushes outward in time with the reply. Rendered against near-black — the
// additive glow only exists there.
//
// Drawn in the app's own "venom-night" palette: one red accent, warm gold
// currents, a bone-white core. app/globals.css owns the source of truth.
// ---------------------------------------------------------------------------

export type CursorMode = "disperse" | "attract" | "swirl"

export interface AnimatedParticlesProps {
  className?: string
  children?: React.ReactNode
  /** Rendered particle point size */
  particleSize?: number
  /** Particle maximum alpha opacity */
  particleOpacity?: number
  /** Simulation speed multiplier */
  speed?: number
  /** Curl noise frequency scale */
  noiseScale?: number
  /** Curl noise force strength */
  noiseStrength?: number
  /** Damping friction factor */
  damping?: number
  /** Whether the particle field responds to cursor motion */
  interactive?: boolean
  /** Physics mode when cursor interacts with particles */
  cursorMode?: CursorMode
  /** Cursor interaction force strength */
  cursorStrength?: number
  /** Cursor interaction influence radius in pixels */
  cursorRadius?: number
  /** External audio level ref (0–1) for reactive speech articulation */
  audioLevelRef?: React.RefObject<number | null>
  /** External frequency bins ref for spectral reactivity */
  frequencyBinsRef?: React.RefObject<Uint8Array | null>
  /** Current assistant mode for visual state changes */
  mode?: "idle" | "listening" | "thinking" | "speaking"
}

// ---------------------------------------------------------------------------
// Palette — venom-night ember
//
// One red accent carries the whole core; warm amber/gold thread the surface
// currents; a bone-white centre is the only near-white. Read from the app's
// --asst-avatar-* tokens at mount. A theme swap doesn't re-run the effect,
// but the stage is one dark room in both themes so the tokens never change.
//
// The two structural keys were `cyan`/`blue` — fossils from the humanoid bust
// this replaced. They are renamed because that fossil turned out to be
// load-bearing rather than cosmetic: it named a CSS TOKEN too, and it misled
// a regression test into asserting on the TypeScript fallback while claiming
// to guard the token. `primary`/`shadow` describe the role, so the next
// palette pass needs no rename at all.
// ---------------------------------------------------------------------------

type RGB = [number, number, number]

export interface HumanoidPalette {
  /** the one red accent — skin, belt, rim */
  primary: RGB
  /** the skin's shadow tone, a dark flame */
  shadow: RGB
  /** mid-core warmth, currents */
  amber: RGB
  /** surface data-currents */
  gold: RGB
  /** the white-hot centre — the only near-white on the stage */
  nexus: RGB
}

/** Used before a canvas exists (SSR, tests) and when a token won't parse. */
export const FALLBACK_PALETTE: HumanoidPalette = {
  primary: [1.0, 0.18, 0.26], // --asst-avatar-primary #ff2e43 ember (== --primary)
  shadow: [0.56, 0.08, 0.13], // --asst-avatar-shadow  #8f1420 dark flame
  amber: [1.0, 0.54, 0.17], // --asst-avatar-amber #ff8a2b
  gold: [1.0, 0.75, 0.3], // --asst-avatar-gold  #ffbf4d
  nexus: [1.0, 0.95, 0.92], // --asst-avatar-nexus #fff2ea  hot bone-white
}

function hexToRgb01(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export function resolveHumanoidPalette(el: Element | null): HumanoidPalette {
  if (!el || typeof window === "undefined") return FALLBACK_PALETTE
  const cs = getComputedStyle(el)
  const read = (name: string, fb: RGB) => hexToRgb01(cs.getPropertyValue(name)) ?? fb
  return {
    primary: read("--asst-avatar-primary", FALLBACK_PALETTE.primary),
    shadow: read("--asst-avatar-shadow", FALLBACK_PALETTE.shadow),
    amber: read("--asst-avatar-amber", FALLBACK_PALETTE.amber),
    gold: read("--asst-avatar-gold", FALLBACK_PALETTE.gold),
    nexus: read("--asst-avatar-nexus", FALLBACK_PALETTE.nexus),
  }
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export type PointKind = "shell" | "face" | "pathway" | "nexus" | "wave" | "dust"

/** Shader `a_kind` values — order matters, the vertex shader branches on it. */
const KIND_INDEX: Record<PointKind, number> = { shell: 0, face: 1, pathway: 2, nexus: 3, wave: 4, dust: 5 }

export interface HumanoidPoint {
  bx: number
  by: number
  bz: number
  kind: PointKind
  r: number
  g: number
  b: number
  glyph: number // 0 = soft neon dot, 1 = 4-point spark
  size: number
  ringPhase?: number // shell: breathing-ripple phase, from the polar angle
  pathT?: number // pathway: 0 .. 1 along the arc
  waveK?: number // wave: swell-phase bucket, so the veil doesn't pulse as one ball
  waveU?: number // wave: 0 (nearest the skin) .. 1 (outermost)
  drift?: number // dust: personal drift seed
  dissipate?: boolean
  rise?: boolean // dust: a spark that lifts off the core rather than an ambient mote
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const mix3 = (a: RGB, c: RGB, t: number): RGB => [lerp(a[0], c[0], t), lerp(a[1], c[1], t), lerp(a[2], c[2], t)]

/** Sphere radius. The shader's camera is framed around this. */
export const CORE_R = 96

/**
 * Builds the particle core — a sphere centred on the origin. Coordinates:
 * +y is down, +z is away from the camera. The six PointKind slots (the
 * shaders branch on them) are re-tasked for a sphere:
 *
 *   shell   — the particle skin, on radius CORE_R
 *   face    — the white-hot centre (the heartbeat)
 *   pathway — gold data-currents riding just above the surface
 *   nexus   — a dim ember haze in the interior, so it isn't a hollow hoop
 *   wave    — a loose veil around the sphere that expands with the voice
 *   dust    — sparks lifting off the top, plus far ambient motes
 */
export function buildHumanoidModel(pal: HumanoidPalette = FALLBACK_PALETTE): HumanoidPoint[] {
  const pts: HumanoidPoint[] = []
  const jit = (n: number) => (Math.random() - 0.5) * n
  const R = CORE_R

  const push = (
    bx: number,
    by: number,
    bz: number,
    kind: PointKind,
    r: number,
    g: number,
    b: number,
    glyph: number,
    size: number,
    extra: Partial<HumanoidPoint> = {}
  ) => {
    pts.push({ bx, by, bz, kind, r, g, b, glyph, size, ...extra })
  }

  // ---- shell: the core's particle skin ----------------------------------
  // A Fibonacci sphere so points spread evenly with no pole clumping. A
  // spinning sphere has no fixed silhouette, so warmth is baked by LATITUDE
  // — hottest around the belt, cooling to the poles — and the shader's depth
  // term does near/far. ringPhase (from the polar angle) drives the breathing
  // ripple; a few motes fully dissipate and reform.
  //
  // SIZES HERE ARE A COVERAGE BUDGET, not a taste call, and they are the one
  // thing to re-derive if the radius or the count changes. A sphere spreads
  // its points over ~pi*(R*pScale)^2 screen pixels, where the bust packed the
  // same order of points into thin dense bands — about 15x the local density.
  // On top of that the fragment mask is strongly size-dependent: a 2px point
  // only ever samples dist ~0.35, so its mask peaks near 0.12 and the particle
  // is effectively invisible however bright its colour. At ~0.9-1.2 here the
  // points render 4-6px, the mask lands near 0.45, and SHELL of them accumulate
  // to a legible skin that is brightest at the silhouette (where projection
  // bunches them) without going solid.
  const SHELL = 10500
  const GOLDEN = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < SHELL; i++) {
    const t = i / (SHELL - 1)
    const yy = 1 - t * 2 // +1 (top) .. -1 (bottom), sphere-space up
    const ring = Math.sqrt(Math.max(0, 1 - yy * yy))
    const th = i * GOLDEN
    const nx = Math.cos(th) * ring
    const nz = Math.sin(th) * ring
    const rr = R * (1 + jit(0.03))
    // Gently hotter at the belt. The exponent and the spread are both low
    // on purpose: at 0.8/0.72 the poles went nearly black and the sphere read
    // as a glowing hoop with a dark cap, which is the failure this shape is
    // most prone to.
    const belt = Math.pow(1 - Math.abs(yy), 0.45) * (0.82 + Math.random() * 0.18)
    const col = mix3(pal.shadow, pal.primary, 0.5 + belt * 0.5)
    let bright = 0.6 + 0.28 * belt + Math.random() * 0.1
    const spark = Math.random() < 0.05
    if (spark) bright *= 1.15
    const diss = Math.random() < 0.06
    push(
      nx * rr + jit(0.6),
      -yy * rr + jit(0.6), // model +y is down
      nz * rr + jit(0.6),
      "shell",
      col[0] * bright,
      col[1] * bright,
      col[2] * bright,
      spark ? 1 : 0,
      spark ? 1.5 + Math.random() * 0.6 : 0.88 + Math.random() * 0.3,
      { ringPhase: Math.acos(Math.max(-1, Math.min(1, yy))) * 2.2, dissipate: diss }
    )
  }

  // Interior fill, and it is load-bearing rather than decorative: a shell
  // alone projects to a bright rim around an empty middle — a soap bubble.
  // These points are what make it read as a lit volume. Biased outward
  // (cube-rooted radius) so the density falls off toward the centre and the
  // hot core still wins the middle.
  for (let i = 0; i < 2600; i++) {
    const a = Math.random() * Math.PI * 2
    const b = Math.acos(2 * Math.random() - 1)
    const rr = R * (0.14 + Math.pow(Math.random(), 0.34) * 0.76)
    const col = mix3(pal.shadow, pal.primary, 0.2 + Math.random() * 0.3)
    const bright = 0.1 + Math.random() * 0.13
    push(
      Math.sin(b) * Math.cos(a) * rr,
      Math.cos(b) * rr,
      Math.sin(b) * Math.sin(a) * rr,
      "shell",
      col[0] * bright,
      col[1] * bright,
      col[2] * bright,
      0,
      0.9 + Math.random() * 0.4,
      { ringPhase: b * 2 }
    )
  }

  // ---- face: the white-hot centre --------------------------------------
  // A tight radial cluster — bone-white at the core, falling fast through
  // amber to ember. Bright enough to bloom through the skin, never a flat
  // white disc. This cluster is what beats.
  for (let i = 0; i < 1400; i++) {
    const a = Math.random() * Math.PI * 2
    const b = Math.acos(2 * Math.random() - 1)
    // Wider and softer than a dot: at radius 15 this was a hard white speck
    // sitting in the middle of the sphere rather than a glow inside it.
    const rr = Math.pow(Math.random(), 0.5) * 30
    const cl = 1 - rr / 30
    let col: RGB
    if (cl > 0.82) col = pal.nexus
    else if (cl > 0.4) col = mix3(pal.amber, pal.nexus, (cl - 0.4) / 0.42)
    else col = pal.primary
    // Deliberately dimmer than the bust's facial core: this many points in a
    // ball this small is a very high local density, so a peak near 0.7 here
    // additively saturates to a flat white disc — which is exactly what the
    // first render of this shape did. The pow() shapes the falloff so the
    // centre still reads hot without blowing out.
    const bright = 0.05 + Math.pow(cl, 1.6) * 0.62
    push(
      Math.sin(b) * Math.cos(a) * rr,
      Math.cos(b) * rr,
      Math.sin(b) * Math.sin(a) * rr - 2,
      "face",
      col[0] * bright,
      col[1] * bright,
      col[2] * bright,
      0,
      0.75 + cl * 1.15
    )
  }

  // ---- pathway: gold currents riding the surface ----------------------
  // A handful of great circles just above the skin, each on its own random
  // tilt — data crossing the core. pathT runs 0..1 along the arc for the
  // travelling glimmer; the sim flexes them in and out of the surface.
  const ARCS = 6
  for (let k = 0; k < ARCS; k++) {
    const ax = Math.random() * Math.PI * 2
    const ay = Math.acos(2 * Math.random() - 1)
    const ux = Math.sin(ay) * Math.cos(ax)
    const uy = Math.cos(ay)
    const uz = Math.sin(ay) * Math.sin(ax)
    // any axis not parallel to u, then v = normalize(u × h)
    const hx = Math.abs(uy) > 0.9 ? 1 : 0
    const hy = Math.abs(uy) > 0.9 ? 0 : 1
    let vx = uy * 0 - uz * hy
    let vy = uz * hx - ux * 0
    let vz = ux * hy - uy * hx
    const vl = Math.hypot(vx, vy, vz) || 1
    vx /= vl
    vy /= vl
    vz /= vl
    const n = 150
    const rr = R * 1.03
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1)
      const ph = u * Math.PI * 2
      const c = Math.cos(ph)
      const s = Math.sin(ph)
      const col = mix3(pal.gold, pal.amber, 0.2 + 0.5 * Math.abs(s))
      const bright = 0.3 + 0.18 * Math.sin(u * Math.PI) + Math.random() * 0.06
      push(
        (ux * c + vx * s) * rr + jit(0.7),
        (uy * c + vy * s) * rr + jit(0.7),
        (uz * c + vz * s) * rr + jit(0.7),
        "pathway",
        col[0] * bright,
        col[1] * bright,
        col[2] * bright,
        i % 40 === 0 ? 1 : 0,
        1.0 + Math.random() * 0.4,
        { pathT: u }
      )
    }
  }

  // ---- nexus: the dim interior ember haze -----------------------------
  for (let i = 0; i < 420; i++) {
    const a = Math.random() * Math.PI * 2
    const b = Math.acos(2 * Math.random() - 1)
    const rr = R * (0.3 + Math.random() * 0.2)
    const col = mix3(pal.primary, pal.amber, Math.random() * 0.4)
    const bright = 0.05 + Math.random() * 0.09
    push(
      Math.sin(b) * Math.cos(a) * rr,
      Math.cos(b) * rr,
      Math.sin(b) * Math.sin(a) * rr,
      "nexus",
      col[0] * bright,
      col[1] * bright,
      col[2] * bright,
      0,
      1.0 + Math.random() * 0.6
    )
  }

  // ---- wave: the breathing energy veil -------------------------------
  // A loose spherical shell at ~1.2–1.7R. waveU carries the radial fraction
  // so the sim can push it outward with the voice; waveK spreads the swell
  // phase so it doesn't pulse as one rigid ball.
  const VEIL = 2600
  for (let i = 0; i < VEIL; i++) {
    const a = Math.random() * Math.PI * 2
    const b = Math.acos(2 * Math.random() - 1)
    const spread = 1.2 + Math.random() * 0.5
    const rr = R * spread
    const col = mix3(pal.shadow, pal.primary, 0.4 + Math.random() * 0.3)
    const bright = 0.1 + (1.7 - spread) * 0.14
    push(
      Math.sin(b) * Math.cos(a) * rr,
      Math.cos(b) * rr,
      Math.sin(b) * Math.sin(a) * rr,
      "wave",
      col[0] * bright,
      col[1] * bright,
      col[2] * bright,
      Math.random() < 0.15 ? 1 : 0,
      0.85 + Math.random() * 0.5,
      { waveU: (spread - 1.2) / 0.5, waveK: i % 5 }
    )
  }

  // ---- dust: sparks lifting off the top, plus far ambient motes -------
  for (let i = 0; i < 1500; i++) {
    const riser = Math.random() < 0.4
    const a = Math.random() * Math.PI * 2
    let x: number
    let y: number
    let z: number
    if (riser) {
      x = Math.cos(a) * R * (0.3 + Math.random() * 0.9)
      y = R * (0.2 - Math.random() * 1.4) // near the top and above (model -y is up)
      z = Math.sin(a) * R * (0.3 + Math.random() * 0.9) * 0.6
    } else {
      const d = R * (1.4 + Math.pow(Math.random(), 0.6) * 2.4)
      x = Math.cos(a) * d
      y = jit(R * 2.2)
      z = Math.sin(a) * d * 0.7 + jit(40)
    }
    const roll = Math.random()
    const col: RGB = roll < 0.15 ? pal.gold : roll < 0.24 ? pal.nexus : pal.primary
    const bright = riser ? 0.14 + Math.random() * 0.3 : 0.09 + Math.random() * 0.2
    push(
      x,
      y,
      z,
      "dust",
      col[0] * bright,
      col[1] * bright,
      col[2] * bright,
      Math.random() < 0.3 ? 1 : 0,
      0.9 + Math.random() * 0.7,
      { drift: Math.random() * Math.PI * 2, rise: riser }
    )
  }

  return pts
}

// ---------------------------------------------------------------------------
// WebGL shaders — 3D perspective point cloud with additive holographic glow
// ---------------------------------------------------------------------------

const VERTEX_SHADER = `
attribute vec3 a_position;
attribute float a_life;
attribute float a_maxLife;
attribute float a_shape;
attribute float a_kind;
attribute vec3 a_color;
attribute float a_size;

uniform vec2 u_resolution;
uniform float u_particleSize;
uniform float u_particleOpacity;
uniform vec2 u_rotation; // (pitch, yaw)
uniform float u_time;
uniform float u_scanY;
uniform float u_scanActive;

varying float v_alpha;
varying float v_shape;
varying vec3 v_color;

void main() {
    float lifeRatio = clamp(a_life / a_maxLife, 0.0, 1.0);
    // Floored so a reconstructing outline holds a steady line rather than
    // shimmering fully in and out.
    float lifeFade = 0.58 + 0.42 * sin(lifeRatio * 3.14159265);

    float cosY = cos(u_rotation.y);
    float sinY = sin(u_rotation.y);
    float cosX = cos(u_rotation.x);
    float sinX = sin(u_rotation.x);

    float x1 = a_position.x * cosY + a_position.z * sinY;
    float z1 = -a_position.x * sinY + a_position.z * cosY;
    float y2 = a_position.y * cosX - z1 * sinX;
    float z2 = a_position.y * sinX + z1 * cosX;

    // Framed for a CORE_R (96) sphere: it takes a bit over half the vertical
    // frame, leaving dark margin all round. No screen offset — unlike the
    // bust this replaced, the model is symmetric about the origin, so any
    // offset just decentres it.
    float fov = 500.0;
    float cameraZ = 335.0;
    float zDist = max(20.0, z2 + cameraZ);
    float pScale = fov / zDist;

    vec2 center = u_resolution * 0.5;
    vec2 screenPos = center + vec2(x1, y2) * pScale;

    // Near side (negative z) is lit, far side fades. Ranged over the sphere's
    // own depth (-R..R plus the veil) rather than the bust's shallow slab.
    float depthNorm = clamp((60.0 - z2) / 130.0, 0.0, 1.0);

    float pointSize = u_particleSize * a_size * pScale * (0.82 + depthNorm * 0.42);
    gl_PointSize = max(1.0, pointSize);

    // Kind-specific brightness, on the GPU: a shimmer crossing the skin, the
    // core's heartbeat (same 2.3 rate the sim scales it at, so light and
    // motion beat together), a glimmer travelling the surface currents, the
    // interior haze breathing, and a slow ripple over the veil.
    float kb = 1.0;
    if (a_kind < 0.5) {
        kb = 0.86 + 0.14 * sin(a_position.y * 0.07 - u_time * 1.3);
    } else if (a_kind < 1.5) {
        kb = 0.62 + 0.4 * pow(0.5 + 0.5 * sin(u_time * 2.3), 1.8);
    } else if (a_kind < 2.5) {
        kb = 0.5 + 0.8 * pow(0.5 + 0.5 * sin(a_position.y * 0.13 - u_time * 3.4), 2.2);
    } else if (a_kind < 3.5) {
        kb = 0.78 + 0.42 * (0.5 + 0.5 * sin(u_time * 2.4));
    } else if (a_kind < 4.5) {
        kb = 0.5 + 0.5 * sin(abs(a_position.x) * 0.05 - u_time * 2.2);
    }

    // The thinking sweep: a band of light crossing the core top to bottom.
    float scanGlow = 0.0;
    if (u_scanActive > 0.5) {
        float dScan = abs(a_position.y - u_scanY);
        if (dScan < 30.0) {
            scanGlow = (1.0 - dScan / 30.0) * 0.9;
        }
    }

    v_alpha = lifeFade * u_particleOpacity * (0.32 + depthNorm * 0.68) * kb + scanGlow;
    v_shape = a_shape;
    // Warm sweep, not the blue-white one the cyan bust used — on this stage a
    // cool highlight is the only thing that would read as a second accent.
    v_color = a_color + vec3(scanGlow * 0.62, scanGlow * 0.2, scanGlow * 0.14);

    vec2 clipSpace = (screenPos / u_resolution) * 2.0 - 1.0;
    gl_Position = vec4(clipSpace.x, -clipSpace.y, 0.0, 1.0);
}
`

const FRAGMENT_SHADER = `
precision highp float;
varying float v_alpha;
varying float v_shape;
varying vec3 v_color;

void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    int shapeType = int(floor(v_shape + 0.5));

    float mask = 0.0;
    if (shapeType == 0) {
        // Neon dot: tight bright core plus a wide soft halo.
        if (dist > 0.5) discard;
        float core = smoothstep(0.40, 0.0, dist);
        float halo = smoothstep(0.5, 0.0, dist) * 0.5;
        mask = max(core, halo);
    } else {
        // 4-point spark
        float a = atan(coord.y, coord.x);
        float starDist = dist * (0.8 + 0.72 * pow(abs(sin(a * 2.0)), 0.45));
        if (starDist > 0.48) discard;
        mask = smoothstep(0.48, 0.02, starDist);
    }

    gl_FragColor = vec4(v_color, mask * v_alpha);
}
`

// ---------------------------------------------------------------------------
// AnimatedParticles component
// ---------------------------------------------------------------------------

export function AnimatedParticles({
  className,
  children,
  particleSize = 2.4,
  particleOpacity = 0.64,
  speed = 1.0,
  noiseScale = 0.003,
  noiseStrength = 0.05,
  damping = 0.93,
  interactive = true,
  cursorMode = "disperse",
  cursorStrength = 0.12,
  cursorRadius = 150,
  audioLevelRef,
  frequencyBinsRef,
  mode = "idle",
}: AnimatedParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const rotRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 })
  const mouseRef = useRef({ x: -9999, y: -9999, vx: 0, vy: 0, active: false })
  const modeRef = useRef(mode)

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  /**
   * `prefers-reduced-motion`, in a REF and its own effect — not state, and not
   * a prop. The render effect below keys on its props, so anything that
   * re-runs it replays the two-second assembly; and a caller-supplied prop
   * would let one surface forget to pass it. The loop reads this to hold the
   * camera still: the core turns continuously, which is exactly the kind of
   * sustained motion this preference exists to stop. The mode reactions stay —
   * those are feedback about a live microphone, the same line globals.css
   * already draws for the input meter.
   */
  const calmRef = useRef(false)
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const sync = () => {
      calmRef.current = query.matches
    }
    sync()
    query.addEventListener("change", sync)
    return () => query.removeEventListener("change", sync)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl =
      canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: false }) ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null)
    if (!gl) return

    const createShader = (type: number, source: string) => {
      const s = gl.createShader(type)
      if (!s) return null
      gl.shaderSource(s, source)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn("[AnimatedParticles] Shader compile error:", gl.getShaderInfoLog(s))
        gl.deleteShader(s)
        return null
      }
      return s
    }

    // Every failure below leaves a blank stage, so each one says why and
    // releases what it already made. A silent `return` here was the worst of
    // the set: the compile path warned, the LINK path did not, so a linker
    // error rendered nothing with an empty console.
    const vert = createShader(gl.VERTEX_SHADER, VERTEX_SHADER)
    const frag = createShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
    if (!vert || !frag) {
      if (vert) gl.deleteShader(vert)
      if (frag) gl.deleteShader(frag)
      return
    }

    const program = gl.createProgram()
    if (!program) {
      console.warn("[AnimatedParticles] createProgram returned null")
      gl.deleteShader(vert)
      gl.deleteShader(frag)
      return
    }
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn("[AnimatedParticles] Program link error:", gl.getProgramInfoLog(program))
      gl.deleteProgram(program)
      gl.deleteShader(vert)
      gl.deleteShader(frag)
      return
    }

    gl.useProgram(program)

    const aPosition = gl.getAttribLocation(program, "a_position")
    const aLife = gl.getAttribLocation(program, "a_life")
    const aMaxLife = gl.getAttribLocation(program, "a_maxLife")
    const aShape = gl.getAttribLocation(program, "a_shape")
    const aKind = gl.getAttribLocation(program, "a_kind")
    const aColor = gl.getAttribLocation(program, "a_color")
    const aSize = gl.getAttribLocation(program, "a_size")

    const uResolution = gl.getUniformLocation(program, "u_resolution")
    const uParticleSize = gl.getUniformLocation(program, "u_particleSize")
    const uParticleOpacity = gl.getUniformLocation(program, "u_particleOpacity")
    const uRotation = gl.getUniformLocation(program, "u_rotation")
    const uTime = gl.getUniformLocation(program, "u_time")
    const uScanY = gl.getUniformLocation(program, "u_scanY")
    const uScanActive = gl.getUniformLocation(program, "u_scanActive")

    const palette = resolveHumanoidPalette(canvas)
    const model = buildHumanoidModel(palette)
    const count = model.length

    const positions = new Float32Array(count * 3)
    const basePositions = new Float32Array(count * 3)
    const velocities = new Float32Array(count * 3)
    const lives = new Float32Array(count)
    const maxLives = new Float32Array(count)
    const shapes = new Float32Array(count)
    const kinds = new Float32Array(count)
    const colorAttrs = new Float32Array(count * 3)
    const sizeAttrs = new Float32Array(count)
    /** Unit vector from the origin to each point's base position. See below. */
    const outward = new Float32Array(count * 3)

    // Read once, here, rather than per-particle: the preference cannot change
    // between two iterations of this loop, and a mid-loop flip would seed half
    // the cloud scattered and half at rest.
    const seedAtRest = calmRef.current

    for (let i = 0; i < count; i++) {
      const m = model[i]
      basePositions[i * 3 + 0] = m.bx
      basePositions[i * 3 + 1] = m.by
      basePositions[i * 3 + 2] = m.bz

      // Start scattered in a loose orbiting cloud; the springs in the sim pull
      // every particle home over the first ~2.2s — the "assembles from
      // particles" reveal, for free. Under reduced motion there is no reveal:
      // seed every point already at rest, so the first frame is the finished
      // pose rather than a two-second animation nobody asked for.
      if (seedAtRest) {
        positions[i * 3 + 0] = m.bx
        positions[i * 3 + 1] = m.by
        positions[i * 3 + 2] = m.bz
      } else {
        const sa = Math.random() * Math.PI * 2
        const sr = 130 + Math.random() * 180
        positions[i * 3 + 0] = Math.cos(sa) * sr
        positions[i * 3 + 1] = -10 + Math.sin(sa) * sr * 0.62 + (Math.random() - 0.5) * 130
        positions[i * 3 + 2] = (Math.random() - 0.5) * 130
      }

      // The outward unit vector, precomputed. Only shell/pathway/wave read it,
      // it is derived from basePositions which never change, and computing it
      // per-frame cost 0.44ms against 0.04ms hoisted (measured at the real
      // 19.9k count) — ~2.4% of a 60fps budget for arithmetic that cannot
      // vary. Math.sqrt, not Math.hypot: hypot does overflow-safe scaling that
      // nothing here needs and it is markedly slower per call.
      const bl = Math.sqrt(m.bx * m.bx + m.by * m.by + m.bz * m.bz) || 1
      outward[i * 3 + 0] = m.bx / bl
      outward[i * 3 + 1] = m.by / bl
      outward[i * 3 + 2] = m.bz / bl

      velocities[i * 3 + 0] = (Math.random() - 0.5) * 0.2
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.2
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.2

      const mLife = 260 * (0.8 + Math.random() * 0.4)
      maxLives[i] = mLife
      lives[i] = Math.random() * mLife
      shapes[i] = m.glyph
      kinds[i] = KIND_INDEX[m.kind]
      sizeAttrs[i] = m.size
      colorAttrs[i * 3 + 0] = m.r
      colorAttrs[i * 3 + 1] = m.g
      colorAttrs[i * 3 + 2] = m.b
    }

    const posBuffer = gl.createBuffer()
    const lifeBuffer = gl.createBuffer()
    const maxLifeBuffer = gl.createBuffer()
    const shapeBuffer = gl.createBuffer()
    const kindBuffer = gl.createBuffer()
    const colorBuffer = gl.createBuffer()
    const sizeBuffer = gl.createBuffer()

    gl.bindBuffer(gl.ARRAY_BUFFER, maxLifeBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, maxLives, gl.STATIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, shapeBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, shapes, gl.STATIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, kindBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, kinds, gl.STATIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, colorAttrs, gl.STATIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, sizeAttrs, gl.STATIC_DRAW)

    let animId: number
    let time = 0

    const render = () => {
      if (!canvas || !gl) return

      const currentMode = modeRef.current
      const audioLevel = audioLevelRef?.current ?? 0
      const freqBins = frequencyBinsRef?.current

      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const dw = Math.floor(canvas.clientWidth * dpr)
      const dh = Math.floor(canvas.clientHeight * dpr)
      if (canvas.width !== dw || canvas.height !== dh) {
        canvas.width = dw
        canvas.height = dh
        gl.viewport(0, 0, dw, dh)
      }

      // Mode dynamics live here, not in props: the effect rebuilds on a prop
      // change, which would replay the assembly on every mode transition.
      const modeSpeed =
        currentMode === "thinking" ? 1.5 : currentMode === "listening" ? 1.25 : currentMode === "speaking" ? 1.1 : 0.9
      const modeNoise = currentMode === "thinking" ? 2.0 : currentMode === "listening" ? 1.35 : 1.0
      const modeCursor: CursorMode =
        currentMode === "listening" ? "attract" : currentMode === "thinking" ? "swirl" : cursorMode

      // REDUCED MOTION: freeze the clock, don't gate thirty call sites.
      //
      // Every ambient animation on this canvas is a `sin(time * k)` — the skin
      // ripple, the heartbeat, the surface currents, the veil swell, the drift
      // of the sparks, the camera yaw, and the shader's own per-kind shimmer
      // through `u_time`. Holding `time` still makes every one of them a
      // CONSTANT per-particle offset, so the core becomes a fixed lit pose in
      // one place instead of thirty guarded terms that drift apart.
      //
      // What deliberately survives is everything driven by the microphone —
      // `audioLevel`, `freqBins`, `vocalPulse`. Those are feedback about a
      // live device, which is the same line globals.css already draws for the
      // input meter, and they read the frozen clock's constants without
      // needing it to advance.
      //
      // Gated on `calm` ALONE, not on `calm && idle`: the spin and the drift
      // are ambient in every mode, not just at rest. A first pass guarded only
      // the camera yaw and left ~20,000 particles animating — the CSS
      // reduced-motion block cannot reach a canvas, so this is the only place
      // the preference can be honoured at all.
      const calm = calmRef.current
      if (!calm) time += 0.016 * speed * modeSpeed

      // The two-second assembly reveal is ambient motion too, and under calm
      // the particles were seeded at rest (see the setup loop), so there is
      // nothing to form. Leaving `forming` true would also keep `swirl` and
      // the 2.3x spring boost live against already-settled points.
      const forming = !calm && time < 2.2
      const formBoost = forming ? 2.3 : 1
      const swirl = forming ? (1 - time / 2.2) * 0.0006 : 0

      // Free rotation. A sphere has no front, so it turns continuously instead
      // of holding a pose — about one revolution a minute at idle, and faster
      // while thinking, because `time` already advances at `modeSpeed`. Mouse
      // parallax (rot.y / rot.x) rides on top of the spin, and survives
      // reduced motion: it is a direct response to the pointer, not ambient.
      const rot = rotRef.current
      rot.x += (rot.targetX - rot.x) * 0.06
      rot.y += (rot.targetY - rot.y) * 0.06
      const finalRotY = rot.y + time * 0.1
      const finalRotX = rot.x

      // Not merely frozen: a stopped sweep is a static bright stripe across
      // the skin, which reads as a rendering fault rather than as stillness.
      const thinkingScanY = currentMode === "thinking" && !calm ? 110 - ((time * 120) % 250) : -999

      const vocalPulse =
        currentMode === "speaking"
          ? audioLevel * 16.0 * (Math.abs(Math.sin(time * 15)) * 0.5 + 0.5)
          : currentMode === "listening" && freqBins
            ? ((freqBins[3] || 0) / 255) * 8.0
            : 0

      for (let i = 0; i < count; i++) {
        const m = model[i]

        // Frozen under calm with the rest of the clock: `lifeFade` in the
        // vertex shader is a sine over this, so an advancing life is a
        // particle breathing in and out on its own.
        if (!calm) lives[i] += 1
        if (lives[i] >= maxLives[i]) {
          lives[i] = 0
          if (!forming) {
            positions[i * 3 + 0] = basePositions[i * 3 + 0] + (Math.random() - 0.5) * 2.0
            positions[i * 3 + 1] = basePositions[i * 3 + 1] + (Math.random() - 0.5) * 2.0
            positions[i * 3 + 2] = basePositions[i * 3 + 2] + (Math.random() - 0.5) * 2.0
            velocities[i * 3 + 0] = 0
            velocities[i * 3 + 1] = 0
            velocities[i * 3 + 2] = 0
          }
        }

        const px = positions[i * 3 + 0]
        const py = positions[i * 3 + 1]
        const pz = positions[i * 3 + 2]

        let tx = basePositions[i * 3 + 0]
        let ty = basePositions[i * 3 + 1]
        let tz = basePositions[i * 3 + 2]

        // Every kind but `dust` moves along its own RADIUS. On a sphere that
        // is the only displacement that keeps the surface a surface — pushing
        // in x/y/z the way the bust did shears the skin off its own shape.
        // `outward` is precomputed at setup; `face` and `nexus` deliberately
        // scale the RAW base position instead, so they swell about the centre
        // rather than riding a fixed-width shell outward.
        const bx0 = basePositions[i * 3 + 0]
        const by0 = basePositions[i * 3 + 1]
        const bz0 = basePositions[i * 3 + 2]
        const outX = outward[i * 3 + 0]
        const outY = outward[i * 3 + 1]
        const outZ = outward[i * 3 + 2]

        if (m.kind === "shell") {
          // A breathing ripple crossing the skin, plus the voice pushing the
          // whole surface outward.
          const ph = m.ringPhase ?? 0
          const ripple = Math.sin(time * 1.2 - ph) * 0.9 + vocalPulse * 0.9
          tx += outX * ripple
          ty += outY * ripple
          tz += outZ * ripple
          if (m.dissipate) {
            const dr = time * 0.6 + i * 0.05
            tx += Math.cos(dr) * 6 * Math.sin(time * 1.1 + i)
            ty += Math.sin(dr) * 4
            tz += Math.sin(time * 1.6) * 5
          }
        } else if (m.kind === "face") {
          // The heartbeat: the whole hot cluster swells and settles. Squared
          // so it reads as a beat rather than a sine wobble.
          const beat = Math.pow(0.5 + 0.5 * Math.sin(time * 2.3), 2.0)
          const hb = beat * (0.06 + audioLevel * 0.1)
          tx += bx0 * hb
          ty += by0 * hb
          tz += bz0 * hb
        } else if (m.kind === "pathway") {
          // Currents flex in and out of the surface as they travel.
          const u = m.pathT ?? 0
          const flex = Math.sin(u * Math.PI * 5 - time * 3.2) * 1.5
          tx += outX * flex
          ty += outY * flex
          tz += outZ * flex
        } else if (m.kind === "nexus") {
          const br = Math.sin(time * 2.4) + audioLevel * 3.0
          tx += bx0 * br * 0.03
          ty += by0 * br * 0.03
          tz += bz0 * br * 0.03
        } else if (m.kind === "wave") {
          // The veil swells on a slow drift and blooms outward with the voice
          // — the loudest single reaction on the stage, and the only one that
          // reaches past the sphere.
          const u = m.waveU ?? 0
          const k = m.waveK ?? 0
          let lift = Math.sin(time * 0.6 + k) * 2 + Math.sin(time * 0.9 - u * 3) * 1.5
          if (freqBins) {
            const bi = Math.min(15, Math.floor(u * 16))
            lift += ((freqBins[bi] || 0) / 255) * 14
          }
          if (currentMode === "speaking") lift += audioLevel * 20
          tx += outX * lift
          ty += outY * lift
          tz += outZ * lift
        } else if (m.rise) {
          // Sparks off the core. A slow upward bias plus a bob rather than a
          // sawtooth climb: a wrapping target snaps the spring and pops.
          const d = (m.drift ?? 0) + time * 0.2
          ty -= 30 + 28 * Math.sin(time * 0.4 + d) // model -y is up
          tx += Math.sin(time * 0.5 + d) * 6
          tz += Math.cos(time * 0.35 + d) * 5
        } else {
          const d = (m.drift ?? 0) + time * 0.15
          tx += Math.cos(d) * 6
          ty += Math.sin(d * 0.8) * 4
          tz += Math.sin(d * 0.5) * 3
        }

        const spring = (m.kind === "dust" ? 0.014 : m.kind === "wave" ? 0.03 : 0.05) * formBoost
        let fx = (tx - px) * spring
        let fy = (ty - py) * spring
        let fz = (tz - pz) * spring

        if (swirl > 0) {
          fx += -py * swirl
          fy += px * swirl
        }

        const angle = Math.sin(px * noiseScale + time) * Math.cos(py * noiseScale + time) * Math.PI * 2
        const curlMag =
          (m.kind === "dust" || m.dissipate ? noiseStrength * 2.0 : noiseStrength * 0.32) * modeNoise
        fx += Math.cos(angle) * curlMag
        fy += Math.sin(angle) * curlMag
        fz += Math.sin(angle * 1.5) * curlMag * 0.5

        if (interactive && mouseRef.current.active) {
          const cdx = px - (mouseRef.current.x - dw * 0.5) / dpr
          const cdy = py - (mouseRef.current.y - dh * 0.5) / dpr
          const d2 = Math.sqrt(cdx * cdx + cdy * cdy)
          if (d2 < cursorRadius && d2 > 0) {
            const factor = (1 - d2 / cursorRadius) * cursorStrength
            if (modeCursor === "disperse") {
              fx += (cdx / d2) * factor * 14.0
              fy += (cdy / d2) * factor * 14.0
            } else if (modeCursor === "attract") {
              fx -= (cdx / d2) * factor * 11.0
              fy -= (cdy / d2) * factor * 11.0
            } else {
              fx += (-cdy / d2) * factor * 13.0
              fy += (cdx / d2) * factor * 13.0
            }
          }
        }

        velocities[i * 3 + 0] = (velocities[i * 3 + 0] + fx) * damping
        velocities[i * 3 + 1] = (velocities[i * 3 + 1] + fy) * damping
        velocities[i * 3 + 2] = (velocities[i * 3 + 2] + fz) * damping

        positions[i * 3 + 0] += velocities[i * 3 + 0]
        positions[i * 3 + 1] += velocities[i * 3 + 1]
        positions[i * 3 + 2] += velocities[i * 3 + 2]
      }

      gl.clearColor(0.0, 0.0, 0.0, 0.0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE)

      gl.uniform2f(uResolution, dw, dh)
      gl.uniform2f(uRotation, finalRotX, finalRotY)
      gl.uniform1f(uTime, time)

      const dynSize =
        currentMode === "speaking"
          ? particleSize * (1 + audioLevel * 0.4)
          : currentMode === "listening"
            ? particleSize * 1.12
            : particleSize
      gl.uniform1f(uParticleSize, dynSize * dpr)
      gl.uniform1f(uParticleOpacity, currentMode === "idle" ? particleOpacity * 0.92 : particleOpacity)
      gl.uniform1f(uScanY, thinkingScanY)
      gl.uniform1f(uScanActive, currentMode === "thinking" && !calm ? 1.0 : 0.0)

      gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW)
      gl.enableVertexAttribArray(aPosition)
      gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0)

      gl.bindBuffer(gl.ARRAY_BUFFER, lifeBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, lives, gl.DYNAMIC_DRAW)
      gl.enableVertexAttribArray(aLife)
      gl.vertexAttribPointer(aLife, 1, gl.FLOAT, false, 0, 0)

      gl.bindBuffer(gl.ARRAY_BUFFER, maxLifeBuffer)
      gl.enableVertexAttribArray(aMaxLife)
      gl.vertexAttribPointer(aMaxLife, 1, gl.FLOAT, false, 0, 0)

      gl.bindBuffer(gl.ARRAY_BUFFER, shapeBuffer)
      gl.enableVertexAttribArray(aShape)
      gl.vertexAttribPointer(aShape, 1, gl.FLOAT, false, 0, 0)

      gl.bindBuffer(gl.ARRAY_BUFFER, kindBuffer)
      gl.enableVertexAttribArray(aKind)
      gl.vertexAttribPointer(aKind, 1, gl.FLOAT, false, 0, 0)

      gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer)
      gl.enableVertexAttribArray(aColor)
      gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 0, 0)

      gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuffer)
      gl.enableVertexAttribArray(aSize)
      gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, 0, 0)

      gl.drawArrays(gl.POINTS, 0, count)
      animId = requestAnimationFrame(render)
    }

    animId = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(animId)
      gl.deleteProgram(program)
      gl.deleteShader(vert)
      gl.deleteShader(frag)
      gl.deleteBuffer(posBuffer)
      gl.deleteBuffer(lifeBuffer)
      gl.deleteBuffer(maxLifeBuffer)
      gl.deleteBuffer(shapeBuffer)
      gl.deleteBuffer(kindBuffer)
      gl.deleteBuffer(colorBuffer)
      gl.deleteBuffer(sizeBuffer)
    }
  }, [
    particleSize,
    particleOpacity,
    speed,
    noiseScale,
    noiseStrength,
    damping,
    interactive,
    cursorMode,
    cursorStrength,
    cursorRadius,
    audioLevelRef,
    frequencyBinsRef,
  ])

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    mouseRef.current.x = (e.clientX - rect.left) * dpr
    mouseRef.current.y = (e.clientY - rect.top) * dpr
    mouseRef.current.active = true

    // Very small parallax — the camera stays essentially locked and frontal.
    const relX = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2)
    const relY = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2)
    rotRef.current.targetY = Math.max(-0.16, Math.min(0.16, relX * 0.16))
    rotRef.current.targetX = Math.max(-0.1, Math.min(0.1, -relY * 0.1))
  }

  const handleMouseLeave = () => {
    mouseRef.current.active = false
    mouseRef.current.x = -9999
    mouseRef.current.y = -9999
    rotRef.current.targetX = 0
    rotRef.current.targetY = 0
  }

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={className}
      style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
          pointerEvents: "none",
        }}
      />
      {children && (
        <div style={{ position: "relative", zIndex: 10, width: "100%", height: "100%" }}>{children}</div>
      )}
    </div>
  )
}

export default AnimatedParticles
