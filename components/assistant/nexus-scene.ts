/**
 * The Nexus orb, ported from the owner's reference design (orin-nexus.html): two geodesic shells, a crystal
 * core, an inner particle core, three segmented gyroscope rings, three latitude scan bands and outer dust.
 * Plain WebGL with the reference's own canvas-2D fallback. No React here, so it is tested with a fake canvas.
 */
import { NEXUS_PALETTES, NEXUS_WIDE_PX, type NexusState, type PaletteId } from "@/lib/voice/agent/nexus-model"

const TAU = Math.PI * 2
type Vec3 = [number, number, number]

export type NexusSettings = { state: NexusState; palette: PaletteId; paused: boolean; highContrast: boolean; center: number }
export type NexusRenderer = {
  readonly kind: "webgl" | "canvas"
  set(next: Partial<NexusSettings>): void
  resetView(): void
  destroy(): void
}
export type NexusRendererOptions = {
  initial: NexusSettings
  /** 0..1 from the conversation's input or output volume. */
  levelRef: { current: number | null }
  /** Frequency bins (0..255) for the VOICE RHYTHM waveform. */
  binsRef?: { current: Uint8Array | null }
  wave?: HTMLCanvasElement | null
  raf?: (cb: FrameRequestCallback) => number
  caf?: (id: number) => void
}

const TARGET: Record<NexusState, Vec3> = { idle: [0, 0, 0], listening: [1, 0, 0], thinking: [0, 1, 0], speaking: [0, 0, 1] }
const PAUSED_LEVEL: Record<NexusState, number> = { idle: 0.08, listening: 0.35, thinking: 0.35, speaking: 0.42 }
/** High contrast draws the orb in bone white instead of the palette. */
const HIGH_CONTRAST = { hex: "#f1e9e5", a: [0.95, 0.95, 0.95] as Vec3, b: [0.78, 0.78, 0.78] as Vec3 }
const HOME = { x: 0.32, y: -0.32 }
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export type NexusGeometry = {
  params: number[]
  glows: number[]
  /** [first vertex, count, drawn as separate segments (true) or a strip (false)] */
  lineRanges: [number, number, boolean][]
  solidRanges: [number, number][]
  shellVertices: Vec3[]
  coreFirst: number
  coreCount: number
  total: number
}

function geodesic(subdivisions: number) {
  const g = (1 + Math.sqrt(5)) / 2
  const norm = (p: number[]): Vec3 => {
    const l = Math.hypot(...p)
    return [p[0] / l, p[1] / l, p[2] / l]
  }
  const vertices: Vec3[] = [
    [-1, g, 0], [1, g, 0], [-1, -g, 0], [1, -g, 0], [0, -1, g], [0, 1, g],
    [0, -1, -g], [0, 1, -g], [g, 0, -1], [g, 0, 1], [-g, 0, -1], [-g, 0, 1],
  ].map(norm)
  let faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ]
  for (let s = 0; s < subdivisions; s++) {
    const cache = new Map<string, number>()
    const next: number[][] = []
    const midpoint = (a: number, b: number) => {
      const key = `${Math.min(a, b)}:${Math.max(a, b)}`
      const hit = cache.get(key)
      if (hit !== undefined) return hit
      vertices.push(norm(vertices[a].map((v, i) => (v + vertices[b][i]) / 2)))
      cache.set(key, vertices.length - 1)
      return vertices.length - 1
    }
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a)
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca])
    }
    faces = next
  }
  const edges = new Map<string, [number, number]>()
  for (const f of faces) for (let i = 0; i < 3; i++) {
    const a = f[i], b = f[(i + 1) % 3]
    edges.set(`${Math.min(a, b)}:${Math.max(a, b)}`, [a, b])
  }
  return { vertices, faces, edges: [...edges.values()] }
}

/** The reference's procedural scene, built once. Seeded, so it is identical on every mount. */
export function buildNexusGeometry(): NexusGeometry {
  let seed = 9026
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  const params: number[] = []
  const glows: number[] = []
  const lineRanges: NexusGeometry["lineRanges"] = []
  const solidRanges: NexusGeometry["solidRanges"] = []
  const add = (x: number, y: number, z: number, type: number) => { params.push(x, y, z, type) }
  const count = () => params.length / 4
  const shell = geodesic(2), crystal = geodesic(0)

  let first = count()
  for (const edge of shell.edges) for (const i of edge) add(...shell.vertices[i], 0)
  lineRanges.push([first, count() - first, true])
  shell.vertices.forEach((p, i) => { if (i % 4 === 0) glows.push(...p, 0) })
  first = count()
  shell.faces.forEach((face, i) => { if (i % 8 === 0) for (const v of face) add(...shell.vertices[v], 0) })
  solidRanges.push([first, count() - first])

  first = count()
  for (const edge of crystal.edges) for (const i of edge) add(...crystal.vertices[i], 4)
  lineRanges.push([first, count() - first, true])
  for (const p of crystal.vertices) glows.push(...p, 4)
  first = count()
  for (const face of crystal.faces) for (const v of face) add(...crystal.vertices[v], 4)
  solidRanges.push([first, count() - first])

  const coreFirst = count()
  for (let j = 0; j < 1800; j++) {
    const p: [number, number, number, number] = [random() * TAU, random() * 2 - 1, random(), 1]
    add(...p)
    if (j % 19 === 0) glows.push(...p)
  }
  const coreCount = count() - coreFirst

  // Each arc is a real strip in 3D. Separate gaps give the rings their signature.
  for (let ring = 0; ring < 3; ring++) {
    const segments = ring === 0 ? 10 : ring === 1 ? 7 : 12
    const span = TAU / segments
    const coverage = ring === 0 ? 0.72 : ring === 1 ? 0.82 : 0.58
    for (let segment = 0; segment < segments; segment++) {
      const start = segment * span + 0.12
      for (const lane of [-1, 1]) {
        first = count()
        for (let k = 0; k <= 38; k++) add(start + (k / 38) * span * coverage, ring, lane, 2)
        lineRanges.push([first, 39, false])
      }
      first = count()
      for (let k = 0; k < 20; k++) {
        const a = start + (k / 20) * span * coverage, b = start + ((k + 1) / 20) * span * coverage
        for (const [u, lane] of [[a, -1], [b, -1], [b, 1], [a, -1], [b, 1], [a, 1]]) add(u, ring, lane, 2)
      }
      solidRanges.push([first, 120])
      glows.push(start, ring, -1, 2, start + span * coverage, ring, 1, 2)
      for (let k = 1; k < 9; k++) glows.push(start + (k / 9) * span * coverage, ring, 0, 2)
    }
  }

  // Three latitude scan bands travel across the spherical hologram.
  for (let band = 0; band < 3; band++) {
    first = count()
    for (let k = 0; k <= 340; k++) {
      const p: [number, number, number, number] = [(k / 340) * TAU, band, 0, 6]
      add(...p)
      if (k % 85 === 0) glows.push(...p)
    }
    lineRanges.push([first, 341, false])
  }

  for (let j = 0; j < 180; j++) {
    const p: [number, number, number, number] = [random() * TAU, random() * 2 - 1, random(), 3]
    add(...p)
    if (j % 5 === 0) glows.push(...p)
  }
  for (let j = 0; j < 4; j++) glows.push(0, 0, 0, 5)

  return { params, glows, lineRanges, solidRanges, shellVertices: shell.vertices, coreFirst, coreCount, total: count() }
}

const VERTEX_SHADER = `
      precision highp float;
      attribute vec4 aParam;
      uniform mat4 uProjection;
      uniform vec2 uRotation;
      uniform vec3 uColorA,uColorB,uState;
      uniform float uTime,uEnergy,uSpin,uDistance,uPointScale,uCenter;
      uniform mediump float uPass;
      varying mediump vec3 vColor;
      varying mediump float vAlpha;
      vec3 turnX(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x,c*p.y-s*p.z,s*p.y+c*p.z);}
      vec3 turnY(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);}
      vec3 turnZ(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(c*p.x-s*p.y,s*p.x+c*p.y,p.z);}
      void main(){
        float u=aParam.x,v=aParam.y,s=aParam.z,type=aParam.w;
        float t=uTime,listen=uState.x,think=uState.y,speak=uState.z;
        // Voice cues, stronger than the reference so listening and speaking read at a glance: the shell
        // breathes with the voice, the core swells and glows, the rings pulse outward while speaking.
        float voice=uEnergy*(listen+speak);
        float scale=1.0+.008*sin(t*.8)+uEnergy*(listen*.18+speak*.16);
        vec3 p;float alpha=.3,cool=0.0,size=1.3,glowSize=12.0;
        if(type<.5){
          p=vec3(u,v,s)*scale;
          float scan=pow(.5+.5*sin(p.y*3.0-t*.8),14.0);
          alpha=.24+scan*.32;cool=.12;size=2.0;glowSize=13.0;
        }else if(type<1.5){
          float angle=u+t*.04,f=sqrt(max(0.0,1.0-v*v));
          float r=(.64+.39*pow(s,.15))*scale;
          p=vec3(cos(angle)*f,v,sin(angle)*f)*r;
          alpha=.23+s*.24;cool=s*.58;size=.9+s*1.55;glowSize=10.0;
        }else if(type<2.5){
          float speed=v<.5?.17:(v<1.5?-.12:.07);
          float angle=u+t*speed*(1.0+think*1.8);
          float radius=(v<.5?1.28:(v<1.5?1.47:1.63))+s*(v<1.5?.028:.012)+speak*uEnergy*.14;
          p=vec3(cos(angle)*radius,sin(angle)*radius,0.0);
          if(v<.5){p=turnX(p,1.08);p=turnY(p,-.12);p=turnZ(p,.18);}
          else if(v<1.5){p=turnX(p,.42);p=turnY(p,1.0);p=turnZ(p,.55);}
          else{p=turnX(p,-.78);p=turnY(p,.35);p=turnZ(p,-.58);}
          alpha=v<.5?.90:(v<1.5?.68:.43);cool=v<.5?0.0:(v<1.5?.40:.90);size=1.4;glowSize=15.0;
        }else if(type<3.5){
          float angle=u+t*.013,r=1.8+s*.85,f=sqrt(max(0.0,1.0-v*v));
          p=vec3(cos(angle)*f,v,sin(angle)*f)*r;
          alpha=.10+s*.23;cool=s;size=.8+s*1.4;glowSize=8.0;
        }else if(type<4.5){
          p=turnX(turnY(vec3(u,v,s)*(.36+uEnergy*.018+voice*.14),t*.30),t*.14);
          alpha=.80;cool=.12;size=2.6;glowSize=19.0;
        }else if(type<5.5){
          p=vec3(0.0);alpha=.75;cool=.0;size=2.0;glowSize=102.0*(1.0+voice*1.8);
        }else{
          float y=sin(t*.58+v*1.55)*.92,r=sqrt(1.0-y*y)*1.045*scale;
          p=vec3(cos(u)*r,y*scale,sin(u)*r);
          alpha=.46+listen*.35;cool=.1+v*.14;size=1.25;glowSize=11.0;
        }
        p=turnY(p,uSpin);
        p=turnX(p,uRotation.x);
        p=turnY(p,uRotation.y);
        float depth=clamp((p.z+1.8)/3.6,0.0,1.0);
        alpha*=(.30+depth*.88)*(1.0+voice*.9);
        vColor=mix(uColorA,uColorB,cool);
        if(type<.5)vColor=mix(vColor,vec3(.78,.98,1.0),pow(.5+.5*sin(p.y*3.0-t*.8),14.0)*.55);
        if(type>3.5&&type<5.5)vColor=mix(uColorA,vec3(.82,.98,1.0),type<4.5?.50:.80);
        if(type>5.5)vColor=mix(vColor,vec3(.82,.98,1.0),.28);
        vAlpha=alpha;
        vec4 projected=uProjection*vec4(p.x,p.y,p.z-uDistance,1.0);
        projected.x+=uCenter*projected.w;
        gl_Position=projected;
        gl_PointSize=(uPass>1.5?glowSize:size)*uPointScale;
      }`
const FRAGMENT_SHADER = `
      precision mediump float;
      uniform mediump float uPass;
      varying mediump vec3 vColor;
      varying mediump float vAlpha;
      void main(){
        float alpha=vAlpha;
        vec3 color=vColor;
        if(uPass>.5){
          float r=length(gl_PointCoord-vec2(.5))*2.0;
          if(r>1.0)discard;
          if(uPass>1.5){alpha*=exp(-r*r*5.0)*.26;}
          else{alpha*=1.0-smoothstep(.2,1.0,r);color=mix(color,vec3(1.0),pow(1.0-r,4.0)*.14);}
        }else alpha*=uPass<-.5?.19:.85;
        gl_FragColor=vec4(color,alpha);
      }`

export function createNexusRenderer(canvas: HTMLCanvasElement, opts: NexusRendererOptions): NexusRenderer | null {
  const raf = opts.raf ?? ((cb: FrameRequestCallback) => requestAnimationFrame(cb))
  const caf = opts.caf ?? ((id: number) => cancelAnimationFrame(id))
  const doc = canvas.ownerDocument
  const geo = buildNexusGeometry()
  let s: NexusSettings = { ...opts.initial }
  let rafId = 0
  let destroyed = false

  let gl: WebGLRenderingContext | null = null
  let program: WebGLProgram | null = null
  let ctx: CanvasRenderingContext2D | null = null
  let fallbackCanvas: HTMLCanvasElement | null = null
  const uniforms: Record<string, WebGLUniformLocation | null> = {}
  let geometryBuffer: WebGLBuffer | null = null
  let glowBuffer: WebGLBuffer | null = null
  let attrib = 0
  let recovering = false

  let time = 0, lastFrame = 0, energy = 0, spin = 0, zoom = 1, zoomTarget = 1
  let rotation = { ...HOME }, targetRotation = { ...HOME }
  let stateMix: Vec3 = [...TARGET[s.state]]
  let viewCenter = s.center
  const start = s.highContrast ? HIGH_CONTRAST : NEXUS_PALETTES[s.palette]
  let colorA: Vec3 = [...start.a], colorB: Vec3 = [...start.b]
  let width = 1, height = 1, dpr = 1

  // Ported from the reference's compileShader and initGL.
  function compile(type: number, source: string): WebGLShader {
    const g = gl as WebGLRenderingContext
    const shader = g.createShader(type)
    if (!shader) throw new Error("Could not create a shader.")
    g.shaderSource(shader, source); g.compileShader(shader)
    if (!g.getShaderParameter(shader, g.COMPILE_STATUS)) { const message = g.getShaderInfoLog(shader); g.deleteShader(shader); throw new Error(message ?? "Shader failed to compile.") }
    return shader
  }
  function initGL(): boolean {
    gl = canvas.getContext("webgl", { alpha: true, antialias: true, depth: false, premultipliedAlpha: false, powerPreference: "low-power" })
    if (!gl) return false
    const vertex = compile(gl.VERTEX_SHADER, VERTEX_SHADER), fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
    program = gl.createProgram()
    if (!program) throw new Error("Could not create a program.")
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program)
    gl.deleteShader(vertex); gl.deleteShader(fragment)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "Program failed to link.")
    gl.useProgram(program)
    attrib = gl.getAttribLocation(program, "aParam")
    for (const name of ["uProjection", "uRotation", "uColorA", "uColorB", "uState", "uTime", "uEnergy", "uSpin", "uDistance", "uPointScale", "uPass", "uCenter"]) uniforms[name] = gl.getUniformLocation(program, name)
    geometryBuffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, geometryBuffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.params), gl.STATIC_DRAW)
    glowBuffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, glowBuffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.glows), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(attrib); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.disable(gl.DEPTH_TEST)
    gl.clearColor(0, 0, 0, 0)
    return true
  }

  function startFallback(bound: boolean) {
    // A failed shader leaves the canvas bound to WebGL, so the 2D renderer needs its own canvas; input stays on the original.
    if (!bound) { ctx = canvas.getContext("2d"); return }
    fallbackCanvas = doc.createElement("canvas")
    fallbackCanvas.className = canvas.className
    fallbackCanvas.style.pointerEvents = "none"
    fallbackCanvas.setAttribute("aria-hidden", "true")
    canvas.after(fallbackCanvas)
    ctx = fallbackCanvas.getContext("2d")
  }
  try {
    if (!initGL()) startFallback(false)
  } catch {
    gl = null
    startFallback(true)
  }
  if (!gl && !ctx) return null

  // Ported from the reference's camera, drawGL and drawFallback.
  const projection = new Float32Array(16)
  function camera(): number {
    const focal = height / (2 * Math.tan(38 * Math.PI / 360))
    const small = width < NEXUS_WIDE_PX
    const radius = Math.min(height * (small ? 0.265 : 0.345), width * (small ? 0.325 : 0.31))
    const distance = focal * 1.23 / radius / zoom
    const f = 1 / Math.tan(38 * Math.PI / 360), near = 0.1, far = 100
    projection.fill(0); projection[0] = f / (width / height); projection[5] = f; projection[10] = (far + near) / (near - far); projection[11] = -1; projection[14] = 2 * far * near / (near - far)
    return distance
  }

  function drawGL(distance: number) {
    if (!gl || !program || recovering || gl.isContextLost()) return
    gl.clear(gl.COLOR_BUFFER_BIT); gl.useProgram(program)
    gl.uniformMatrix4fv(uniforms.uProjection, false, projection); gl.uniform2f(uniforms.uRotation, rotation.x, rotation.y)
    gl.uniform3fv(uniforms.uColorA, colorA); gl.uniform3fv(uniforms.uColorB, colorB); gl.uniform3fv(uniforms.uState, stateMix)
    gl.uniform1f(uniforms.uTime, time); gl.uniform1f(uniforms.uEnergy, energy); gl.uniform1f(uniforms.uSpin, spin)
    gl.uniform1f(uniforms.uDistance, distance); gl.uniform1f(uniforms.uPointScale, dpr); gl.uniform1f(uniforms.uCenter, viewCenter)
    gl.bindBuffer(gl.ARRAY_BUFFER, geometryBuffer); gl.vertexAttribPointer(attrib, 4, gl.FLOAT, false, 0, 0)
    gl.uniform1f(uniforms.uPass, -1)
    for (const [first, count] of geo.solidRanges) gl.drawArrays(gl.TRIANGLES, first, count)
    gl.uniform1f(uniforms.uPass, 0)
    for (const [first, count, segments] of geo.lineRanges) gl.drawArrays(segments ? gl.LINES : gl.LINE_STRIP, first, count)
    gl.uniform1f(uniforms.uPass, 1)
    gl.drawArrays(gl.POINTS, 0, geo.total)
    gl.bindBuffer(gl.ARRAY_BUFFER, glowBuffer); gl.vertexAttribPointer(attrib, 4, gl.FLOAT, false, 0, 0)
    gl.uniform1f(uniforms.uPass, 2); gl.drawArrays(gl.POINTS, 0, geo.glows.length / 4)
  }

  // The compatibility renderer uses the same 3D geometry and perspective.
  function drawFallback(distance: number) {
    if (!ctx) return
    const c2 = ctx
    c2.clearRect(0, 0, width, height); c2.globalCompositeOperation = "lighter"
    const cX = width * (0.5 + viewCenter * 0.5), cY = height * 0.5, focal = height / (2 * Math.tan(38 * Math.PI / 360))
    const rx = (p: number[], a: number): Vec3 => { const c = Math.cos(a), s = Math.sin(a); return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c] }
    const ry = (p: number[], a: number): Vec3 => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c] }
    const rz = (p: number[], a: number): Vec3 => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]] }
    const scale = 1 + 0.008 * Math.sin(time * 0.8) + energy * (stateMix[0] * 0.18 + stateMix[2] * 0.16)
    const project = (index: number): Vec3 => {
      const [u, v, s, type] = geo.params.slice(index * 4, index * 4 + 4)
      let p: Vec3
      if (type === 0) p = [u * scale, v * scale, s * scale]
      else if (type === 1) { const angle = u + time * 0.04, f = Math.sqrt(Math.max(0, 1 - v * v)), r = (0.64 + 0.39 * Math.pow(s, 0.15)) * scale; p = [Math.cos(angle) * f * r, v * r, Math.sin(angle) * f * r] }
      else if (type === 2) {
        const speed = v < 0.5 ? 0.17 : v < 1.5 ? -0.12 : 0.07, angle = u + time * speed * (1 + stateMix[1] * 1.8), r = (v < 0.5 ? 1.28 : v < 1.5 ? 1.47 : 1.63) + s * (v < 1.5 ? 0.028 : 0.012) + stateMix[2] * energy * 0.14
        p = [Math.cos(angle) * r, Math.sin(angle) * r, 0]
        if (v < 0.5) p = rz(ry(rx(p, 1.08), -0.12), 0.18); else if (v < 1.5) p = rz(ry(rx(p, 0.42), 1), 0.55); else p = rz(ry(rx(p, -0.78), 0.35), -0.58)
      } else if (type === 3) { const angle = u + time * 0.013, r = 1.8 + s * 0.85, f = Math.sqrt(Math.max(0, 1 - v * v)); p = [Math.cos(angle) * f * r, v * r, Math.sin(angle) * f * r] }
      else if (type === 4) { const r = 0.36 + energy * 0.018 + energy * (stateMix[0] + stateMix[2]) * 0.14; p = rx(ry([u * r, v * r, s * r], time * 0.30), time * 0.14) }
      else if (type === 6) { const y = Math.sin(time * 0.58 + v * 1.55) * 0.92, r = Math.sqrt(1 - y * y) * 1.045 * scale; p = [Math.cos(u) * r, y * scale, Math.sin(u) * r] }
      else p = [0, 0, 0]
      p = ry(rx(ry(p, spin), rotation.x), rotation.y)
      const z = focal / (distance - p[2]); return [cX + p[0] * z, cY - p[1] * z, p[2]]
    }
    const rgb = colorA.map((c) => Math.round(c * 255))
    for (const [first, count] of geo.solidRanges) {
      c2.fillStyle = "rgba(" + rgb.join(",") + ",.09)"
      for (let j = first; j < first + count; j += 3) { const a = project(j), b = project(j + 1), c = project(j + 2); c2.beginPath(); c2.moveTo(a[0], a[1]); c2.lineTo(b[0], b[1]); c2.lineTo(c[0], c[1]); c2.closePath(); c2.fill() }
    }
    for (const [first, count, segments] of geo.lineRanges) {
      c2.beginPath()
      for (let j = 0; j < count; j++) { const p = project(first + j); if (j === 0 || (segments && j % 2 === 0)) c2.moveTo(p[0], p[1]); else c2.lineTo(p[0], p[1]) }
      const type = geo.params[first * 4 + 3], alpha = type === 2 ? 0.67 : type === 4 ? 0.82 : type === 6 ? 0.4 : 0.30
      c2.strokeStyle = "rgba(" + rgb.join(",") + "," + alpha + ")"; c2.lineWidth = type === 2 ? 1.0 : 0.65; c2.stroke()
    }
    for (let j = geo.coreFirst; j < geo.coreFirst + geo.coreCount; j++) { const p = project(j); c2.fillStyle = "rgba(" + rgb.join(",") + ",.40)"; c2.fillRect(p[0], p[1], 1.2, 1.2) }
    for (const vertex of geo.shellVertices) { const p = ry(rx(ry(vertex.map((v) => v * scale), spin), rotation.x), rotation.y), z = focal / (distance - p[2]); c2.fillStyle = "rgba(" + rgb.join(",") + ",.65)"; c2.fillRect(cX + p[0] * z - 1, cY - p[1] * z - 1, 2, 2) }
    const glow = c2.createRadialGradient(cX, cY, 1, cX, cY, 43); glow.addColorStop(0, "rgba(223,255,255,.82)"); glow.addColorStop(0.18, "rgba(" + rgb.join(",") + ",.36)"); glow.addColorStop(1, "rgba(" + rgb.join(",") + ",0)"); c2.fillStyle = glow; c2.beginPath(); c2.arc(cX, cY, 43, 0, TAU); c2.fill()
    c2.globalCompositeOperation = "source-over"
  }

  function drawWave() {
    const w = opts.wave
    const wctx = w?.getContext("2d")
    if (!w || !wctx) return
    const W = w.width, H = w.height
    wctx.clearRect(0, 0, W, H)
    wctx.beginPath(); wctx.moveTo(0, H * 0.5); wctx.lineTo(W, H * 0.5)
    wctx.strokeStyle = "rgba(120,160,150,.12)"; wctx.lineWidth = 1; wctx.stroke()
    const live = s.state === "listening" || s.state === "speaking"
    const amplitude = live ? Math.max(0.22, energy) * (s.state === "speaking" ? 0.7 : 1) : 0.035
    const bins = opts.binsRef?.current
    wctx.beginPath()
    for (let i = 0; i <= W; i += 2) {
      const n = i / W, envelope = Math.pow(Math.sin(n * Math.PI), 1.6)
      const carrier = Math.sin(n * 54 - time * 2.9)
      const value = live && bins?.length ? (bins[Math.floor(n * (bins.length - 1))] / 255) * carrier : carrier * Math.sin(n * 17 + time * 1.3)
      const y = H * 0.5 + value * amplitude * H * 0.48 * envelope
      if (i === 0) wctx.moveTo(i, y); else wctx.lineTo(i, y)
    }
    wctx.strokeStyle = s.highContrast ? HIGH_CONTRAST.hex : NEXUS_PALETTES[s.palette].hex
    wctx.globalAlpha = 0.7; wctx.lineWidth = 1.5; wctx.stroke(); wctx.globalAlpha = 1
  }

  function schedule() {
    if (!rafId && !destroyed) rafId = raf(frame)
  }

  function frame(ts: number) {
    rafId = 0
    if (destroyed || doc?.hidden) { lastFrame = 0; return }
    const dt = lastFrame ? Math.min((ts - lastFrame) / 1000, 0.05) : 0.016
    lastFrame = ts
    // Paused draws one still frame at the target state and stops: nothing eases, nothing loops.
    const ease = s.paused ? 1 : 1 - Math.exp(-dt * 4)
    const cameraEase = s.paused ? 1 : 1 - Math.exp(-dt * 7)
    if (!s.paused) { time += dt; spin += dt * (0.045 + stateMix[1] * 0.19 + stateMix[2] * 0.015) }
    const target = TARGET[s.state]
    stateMix = stateMix.map((v, i) => v + (target[i] - v) * ease) as Vec3
    let level = 0.08
    if (s.state === "listening") level = 0.25 + 0.25 * Math.pow(0.5 + 0.5 * Math.sin(time * 2.6), 3)
    if (s.state === "thinking") level = 0.35 + 0.08 * Math.sin(time * 3.5)
    if (s.state === "speaking") level = 0.2 + 0.55 * Math.abs(Math.sin(time * 4.2) * Math.sin(time * 1.6 + 0.5))
    level = s.paused ? PAUSED_LEVEL[s.state] : Math.max(level, clamp(opts.levelRef.current ?? 0, 0, 1))
    energy += (level - energy) * (s.paused ? 1 : 1 - Math.exp(-dt * 10))
    // The aura behind the orb swells with the voice too (app/globals.css reads --nx-voice).
    canvas.parentElement?.style.setProperty("--nx-voice", (energy * (stateMix[0] + stateMix[2])).toFixed(3))
    rotation = { x: rotation.x + (targetRotation.x - rotation.x) * cameraEase, y: rotation.y + (targetRotation.y - rotation.y) * cameraEase }
    zoom += (zoomTarget - zoom) * cameraEase
    viewCenter += ((width < NEXUS_WIDE_PX ? 0 : s.center) - viewCenter) * cameraEase
    const colors = s.highContrast ? HIGH_CONTRAST : NEXUS_PALETTES[s.palette]
    colorA = colorA.map((c, i) => c + (colors.a[i] - c) * ease) as Vec3
    colorB = colorB.map((c, i) => c + (colors.b[i] - c) * ease) as Vec3
    const distance = camera()
    if (gl) drawGL(distance)
    else if (ctx) drawFallback(distance)
    drawWave()
    if (!s.paused) schedule()
  }

  function resize() {
    const rect = (canvas.parentElement ?? canvas).getBoundingClientRect()
    width = Math.max(1, rect.width)
    height = Math.max(1, rect.height)
    dpr = Math.min(globalThis.devicePixelRatio || 1, 1.75)
    for (const c of [canvas, fallbackCanvas]) if (c) { c.width = Math.round(width * dpr); c.height = Math.round(height * dpr) }
    if (gl) gl.viewport(0, 0, canvas.width, canvas.height)
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    schedule()
  }

  let dragging = false
  let dragPoint = { x: 0, y: 0 }
  const onPointerDown = (e: PointerEvent) => { dragging = true; dragPoint = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture?.(e.pointerId) }
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return
    targetRotation = { x: clamp(targetRotation.x + (e.clientY - dragPoint.y) * 0.005, -1.25, 1.25), y: targetRotation.y + (e.clientX - dragPoint.x) * 0.005 }
    dragPoint = { x: e.clientX, y: e.clientY }
    schedule()
  }
  const onRelease = () => { dragging = false }
  const onWheel = (e: WheelEvent) => { e.preventDefault(); zoomTarget = clamp(zoomTarget - e.deltaY * 0.0008, 0.72, 1.35); schedule() }
  const onKey = (e: KeyboardEvent) => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault()
      targetRotation = {
        x: targetRotation.x + (e.key === "ArrowUp" ? -0.15 : e.key === "ArrowDown" ? 0.15 : 0),
        y: targetRotation.y + (e.key === "ArrowLeft" ? -0.15 : e.key === "ArrowRight" ? 0.15 : 0),
      }
    }
    if (e.key === "+" || e.key === "=") zoomTarget = Math.min(1.35, zoomTarget + 0.08)
    if (e.key === "-") zoomTarget = Math.max(0.72, zoomTarget - 0.08)
    schedule()
  }
  const onLost = (e: Event) => { e.preventDefault(); recovering = true }
  const onRestored = () => {
    try { initGL(); recovering = false; resize() } catch { gl = null; recovering = false; startFallback(true); resize() }
  }
  const onVisibility = () => { lastFrame = 0; if (!doc.hidden) schedule() }

  const listeners: [EventTarget, string, EventListener, AddEventListenerOptions?][] = [
    [canvas, "pointerdown", onPointerDown as EventListener],
    [canvas, "pointermove", onPointerMove as EventListener],
    [canvas, "pointerup", onRelease],
    [canvas, "pointercancel", onRelease],
    [canvas, "lostpointercapture", onRelease],
    [canvas, "wheel", onWheel as EventListener, { passive: false }],
    [canvas, "keydown", onKey as EventListener],
    [canvas, "webglcontextlost", onLost],
    [canvas, "webglcontextrestored", onRestored],
    [doc, "visibilitychange", onVisibility],
  ]
  for (const [t, type, fn, o] of listeners) t.addEventListener(type, fn, o)
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize)
  observer?.observe(canvas.parentElement ?? canvas)
  resize()

  return {
    get kind() { return gl ? "webgl" : "canvas" },
    set(next) {
      if (destroyed) return
      s = { ...s, ...next }
      schedule()
    },
    resetView() {
      targetRotation = { ...HOME }
      zoomTarget = 1
      schedule()
    },
    destroy() {
      destroyed = true
      if (rafId) caf(rafId)
      rafId = 0
      observer?.disconnect()
      for (const [t, type, fn] of listeners) t.removeEventListener(type, fn)
      fallbackCanvas?.remove()
    },
  }
}
