import * as THREE from "three"
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js"
import { AISLE_W, CORRIDOR_D, FRONT_W, INNER_D, ROOM_D, type OfficePlan } from "@/lib/os/office/plan"
import type { ModelLibrary, ModelName } from "./office-assets"
import type { Mood } from "./office-moods"

/** A desk monitor: lit while someone works at it. */
export type Screen = { material: THREE.MeshBasicMaterial; texture: THREE.CanvasTexture; level: number }
/** A room's colour wash at night, on while someone works in it. */
export type RoomGlow = { light: THREE.PointLight; level: number }

export type World = {
  screens: Map<string, Screen>
  roomGlow: Map<string, RoomGlow>
  anchors: {
    kitchen: THREE.Vector3
    lounge: THREE.Vector3
    hot: THREE.Vector3
    you: THREE.Vector3
    schedule: THREE.Vector3
    more: THREE.Vector3
    rooms: Map<string, THREE.Vector3>
  }
}

type PlaceOptions = { scale?: number; sx?: number; sy?: number; sz?: number; y?: number; colors?: Record<string, string>; shadow?: boolean }

function canvasTexture(width: number, height: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const g = canvas.getContext("2d")
  if (g) draw(g, width, height)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

function floorTexture(mood: Mood): THREE.CanvasTexture {
  const { base, alt, seam } = mood.floor
  return canvasTexture(1024, 1024, (g, w, h) => {
    g.fillStyle = base
    g.fillRect(0, 0, w, h)
    const rows = 14
    const rowHeight = h / rows
    for (let r = 0; r < rows; r++) {
      let x = -((r * 173) % 260)
      while (x < w) {
        const length = 240 + ((r * 97 + Math.abs(x)) % 200)
        g.fillStyle = (r + Math.floor(Math.abs(x) / 37)) % 3 === 0 ? alt : base
        g.fillRect(x, r * rowHeight, length, rowHeight)
        g.fillStyle = seam
        g.fillRect(x, r * rowHeight, 2, rowHeight)
        g.globalAlpha = 0.07
        for (let k = 0; k < 4; k++) g.fillRect(x + 12, r * rowHeight + 9 + k * 15, length - 24, 1)
        g.globalAlpha = 1
        x += length
      }
      g.fillStyle = seam
      g.fillRect(0, r * rowHeight, w, 2)
    }
  })
}

function signTexture(text: string, color: string, glyph: string): THREE.CanvasTexture {
  return canvasTexture(720, 200, (g, w, h) => {
    const radius = 54
    g.fillStyle = color
    g.beginPath()
    g.roundRect(8, 8, w - 16, h - 16, radius)
    g.fill()
    g.fillStyle = "rgba(255,255,255,0.16)"
    g.beginPath()
    g.roundRect(8, 8, w - 16, (h - 16) / 2, [radius, radius, 0, 0])
    g.fill()
    g.fillStyle = "rgba(255,255,255,0.22)"
    g.beginPath()
    g.arc(100, h / 2, 56, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = "#ffffff"
    g.textBaseline = "middle"
    g.textAlign = "center"
    g.font = "800 50px Inter, system-ui, sans-serif"
    g.fillText(glyph, 100, h / 2 + 2)
    g.textAlign = "left"
    let size = 54
    g.font = `800 ${size}px Inter, system-ui, sans-serif`
    while (g.measureText(text).width > w - 214 && size > 24) {
      size -= 2
      g.font = `800 ${size}px Inter, system-ui, sans-serif`
    }
    g.fillText(text, 186, h / 2 + 3)
  })
}

function screenTexture(accent: string): THREE.CanvasTexture {
  const texture = canvasTexture(256, 320, (g, w, h) => {
    g.fillStyle = "#0f1422"
    g.fillRect(0, 0, w, h)
    const palette = [accent, "#7dd3fc", "#a7f3d0", "#fcd34d", "#c4b5fd", "#94a3b8"]
    for (let y = 10; y < h; y += 15) {
      let x = 14 + ((y * 7) % 4) * 12
      const parts = 1 + ((y * 13) % 3)
      for (let p = 0; p < parts; p++) {
        const length = 20 + ((y * 31 + p * 17) % 70)
        g.fillStyle = palette[(y + p * 3) % palette.length]
        g.globalAlpha = 0.9
        g.beginPath()
        g.roundRect(x, y, length, 6, 3)
        g.fill()
        x += length + 8
      }
    }
    g.globalAlpha = 1
  })
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(1, 0.5)
  return texture
}

function boardTexture(colors: string[]): THREE.CanvasTexture {
  return canvasTexture(512, 320, (g, w, h) => {
    g.fillStyle = "#fbfaf6"
    g.fillRect(0, 0, w, h)
    g.fillStyle = "#4b5563"
    g.fillRect(0, 0, w, 54)
    g.fillStyle = "#ffffff"
    g.font = "800 30px Inter, system-ui, sans-serif"
    g.textBaseline = "middle"
    g.fillText("SCHEDULE", 24, 28)
    const cols = 7
    const rows = 4
    const cw = (w - 40) / cols
    const ch = (h - 80) / rows
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        g.strokeStyle = "#d9d6cf"
        g.lineWidth = 2
        g.strokeRect(20 + c * cw, 66 + r * ch, cw - 6, ch - 6)
        if ((r * 7 + c) % 5 === 2) {
          g.fillStyle = colors[(r + c) % colors.length]
          g.globalAlpha = 0.85
          g.fillRect(26 + c * cw, 72 + r * ch, cw - 18, 14)
          g.globalAlpha = 1
        }
      }
    }
  })
}

function whiteboardTexture(colors: string[]): THREE.CanvasTexture {
  return canvasTexture(512, 300, (g) => {
    g.fillStyle = "#fbfbf8"
    g.fillRect(0, 0, 512, 300)
    g.strokeStyle = "#5b6575"
    g.lineWidth = 5
    g.lineCap = "round"
    g.beginPath()
    g.moveTo(40, 220)
    g.bezierCurveTo(120, 120, 200, 240, 280, 120)
    g.stroke()
    for (let i = 0; i < 6; i++) {
      g.fillStyle = colors[i % colors.length]
      g.globalAlpha = 0.9
      g.fillRect(320 + (i % 3) * 56, 40 + Math.floor(i / 3) * 70, 46, 46)
    }
    g.globalAlpha = 1
    g.fillStyle = "#5b6575"
    for (let i = 0; i < 3; i++) g.fillRect(40, 40 + i * 26, 160 - i * 30, 8)
  })
}

function artTexture(colors: string[], seed: number): THREE.CanvasTexture {
  return canvasTexture(256, 320, (g, w, h) => {
    g.fillStyle = "#fffaf2"
    g.fillRect(0, 0, w, h)
    g.globalAlpha = 0.92
    g.fillStyle = colors[seed % colors.length]
    g.beginPath()
    g.arc(w * 0.45, h * 0.42, 70, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = colors[(seed + 1) % colors.length]
    g.fillRect(w * 0.2, h * 0.6, w * 0.6, 60)
    g.fillStyle = colors[(seed + 2) % colors.length]
    g.beginPath()
    g.moveTo(w * 0.62, h * 0.2)
    g.lineTo(w * 0.85, h * 0.55)
    g.lineTo(w * 0.4, h * 0.55)
    g.fill()
    g.globalAlpha = 1
  })
}

function shadowTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 256, (g, w, h) => {
    const gradient = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
    gradient.addColorStop(0, "rgba(0,0,0,0.55)")
    gradient.addColorStop(1, "rgba(0,0,0,0)")
    g.fillStyle = gradient
    g.fillRect(0, 0, w, h)
  })
}

/** Build every fixed thing in the office into `scene`. People are the scene's, not the world's. */
export function buildWorld(scene: THREE.Scene, plan: OfficePlan, mood: Mood, models: ModelLibrary): World {
  const W = plan.width
  const D = plan.depth
  const zF = plan.front.z0
  const xs = (v: number) => (v * W) / FRONT_W
  const night = mood.night
  const materialCache = new Map<string, THREE.Material>()

  const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra })
  const tint = (hex: string, extra = 0) => "#" + new THREE.Color(mood.floor.base).lerp(new THREE.Color(hex), mood.rugMix + extra).getHexString()
  const neon = (hex: string) => "#" + new THREE.Color(hex).lerp(new THREE.Color("#ffffff"), night ? 0.18 : 0).getHexString()

  const place = (name: ModelName, x: number, z: number, yaw = 0, opts: PlaceOptions = {}): THREE.Group => {
    const group = new THREE.Group()
    const model = models.get(name)
    if (!model) return group
    const inner = model.scene.clone(true)
    const center = model.box.getCenter(new THREE.Vector3())
    inner.position.set(-center.x, -model.box.min.y, -center.z)
    const colors = { ...mood.materials, ...(opts.colors ?? {}) }
    inner.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return
      node.castShadow = opts.shadow !== false
      node.receiveShadow = true
      const source = node.material as THREE.MeshStandardMaterial
      const color = colors[source.name] ?? ""
      const key = `${source.uuid}|${color}`
      let material = materialCache.get(key) as THREE.MeshStandardMaterial | undefined
      if (!material) {
        material = source.clone()
        if (color) material.color.set(color)
        if (material.name === "glass") {
          material.transparent = true
          material.opacity = mood.glassOpacity
          if (mood.glassGlow) {
            material.emissive = new THREE.Color(mood.glassGlow)
            material.emissiveIntensity = 0.9
          }
        }
        if (material.name === "lamp" && night) {
          material.emissive = new THREE.Color(mood.materials.lamp)
          material.emissiveIntensity = 2
        }
        materialCache.set(key, material)
      }
      node.material = material
    })
    group.add(inner)
    const s = opts.scale ?? 1
    group.scale.set(opts.sx ?? s, opts.sy ?? s, opts.sz ?? s)
    group.position.set(x, opts.y ?? 0, z)
    group.rotation.y = yaw
    scene.add(group)
    return group
  }

  const solid = (w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, shadow = true): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
    mesh.position.set(x, y, z)
    mesh.castShadow = shadow
    mesh.receiveShadow = true
    scene.add(mesh)
    return mesh
  }

  const plane = (w: number, h: number, material: THREE.Material, x: number, y: number, z: number, yaw = 0): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material)
    mesh.position.set(x, y, z)
    mesh.rotation.y = yaw
    scene.add(mesh)
    return mesh
  }

  const rug = (x: number, z: number, width: number, depth: number, color: string, border: string, yaw = 0) =>
    place("rugRectangle", x, z, yaw, { sx: width / 1.57, sz: depth / 0.92, colors: { carpet: color, carpetDarker: border }, shadow: false })

  // Ground: the slab, the plank floor, a soft drop shadow under the diorama.
  const floorMap = floorTexture(mood)
  floorMap.wrapS = floorMap.wrapT = THREE.RepeatWrapping
  floorMap.repeat.set(W / 4, D / 4)
  const slab = new THREE.Mesh(new RoundedBoxGeometry(W + 0.36, mood.slab.thickness, D + 0.36, 4, 0.14), std(mood.slab.side, { roughness: 0.9 }))
  slab.position.set(W / 2, -mood.slab.thickness / 2, D / 2)
  slab.receiveShadow = true
  scene.add(slab)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorMap, roughness: 0.78 }))
  floor.rotation.x = -Math.PI / 2
  floor.position.set(W / 2, 0.002, D / 2)
  floor.receiveShadow = true
  scene.add(floor)
  const drop = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 1.6, D * 1.6),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, opacity: mood.slab.shadow, depthWrite: false })
  )
  drop.rotation.x = -Math.PI / 2
  drop.position.set(W / 2 + 0.6, -mood.slab.thickness - 0.35, D / 2 + 0.6)
  scene.add(drop)

  // Corridor runners.
  rug(W / 2, plan.corridorZ, W - 0.6, CORRIDOR_D * 0.8, mood.corridor, mood.corridor)
  for (const z of plan.innerCorridorZ) rug((W - AISLE_W) / 2, z, W - AISLE_W - 0.8, INNER_D * 0.75, mood.corridor, mood.corridor)
  if (plan.aisleX !== null) rug(plan.aisleX, plan.roomsDepth / 2, plan.roomsDepth - 0.4, AISLE_W * 0.7, mood.corridor, mood.corridor, Math.PI / 2)

  // Outer walls: back and left full height, with windows; near sides a low rim with an entrance gap.
  const backSigns = plan.rooms.filter((r) => r.row === plan.rows - 1).map((r) => (r.x0 + r.x1) / 2)
  const backTiles = Math.max(1, Math.ceil(W - 1e-6))
  const backTile = W / backTiles
  for (let i = 0; i < backTiles; i++) {
    const cx = (i + 0.5) * backTile
    const nearSign = backSigns.some((c) => Math.abs(c - cx) < 0.95)
    const windowed = i % 3 === 1 && !nearSign
    place(windowed ? "wallWindow" : "wall", cx, 0, 0, { sx: backTile })
    if (!windowed && !nearSign && i % 4 === 3) {
      plane(0.4, 0.5, new THREE.MeshStandardMaterial({ map: artTexture(mood.art, i), roughness: 0.6 }), cx, 0.92, 0.07)
      solid(0.47, 0.57, 0.03, std(mood.materials.woodDark), cx, 0.92, 0.045)
    }
  }
  const leftTiles = Math.max(1, Math.ceil(D - 1e-6))
  const leftTile = D / leftTiles
  for (let j = 0; j < leftTiles; j++) {
    const cz = (j + 0.5) * leftTile
    const kitchenWindow = Math.abs(cz - (zF + 2.75)) < leftTile / 2
    const roomWindow = cz < plan.roomsDepth && j % 3 === 1
    const nearBoard = Math.abs(cz - plan.corridorZ) < 0.8
    place((kitchenWindow || roomWindow) && !nearBoard ? "wallWindow" : "wall", 0, cz, Math.PI / 2, { sx: leftTile })
  }
  const rim = std(mood.wall)
  const rimTop = std(mood.trim)
  solid(0.08, 0.16, D, rim, W + 0.02, 0.08, D / 2)
  solid(0.1, 0.025, D, rimTop, W + 0.02, 0.17, D / 2)
  const gap = 1.3
  solid(W - gap, 0.16, 0.08, rim, (W - gap) / 2, 0.08, D + 0.02)
  solid(W - gap, 0.025, 0.1, rimTop, (W - gap) / 2, 0.17, D + 0.02)

  // Glass partitions on a low base, with white (or muted, at night) frames.
  const partitionBase = std(mood.partition.base)
  const partitionFrame = std(mood.partition.frame, { roughness: 0.5 })
  const partitionGlass = new THREE.MeshStandardMaterial({
    color: mood.partition.glass,
    transparent: true,
    opacity: mood.partition.glassOpacity,
    roughness: 0.08,
    depthWrite: false,
  })
  const partition = (axis: "x" | "z", fixed: number, from: number, to: number, gaps: [number, number][] = []) => {
    const spans: [number, number][] = []
    let cursor = from
    for (const [g0, g1] of gaps) {
      if (g0 > cursor) spans.push([cursor, g0])
      cursor = g1
    }
    if (cursor < to) spans.push([cursor, to])
    for (const [a, b] of spans) {
      const length = b - a
      const mid = (a + b) / 2
      const piece = (y: number, h: number, thickness: number, material: THREE.Material, shadow: boolean) =>
        axis === "x" ? solid(length, h, thickness, material, mid, y, fixed, shadow) : solid(thickness, h, length, material, fixed, y, mid, shadow)
      piece(0.12, 0.24, 0.07, partitionBase, true)
      piece(0.46, 0.44, 0.02, partitionGlass, false)
      piece(0.69, 0.035, 0.06, partitionFrame, true)
      const step = Math.max(0.5, length / Math.max(1, Math.ceil(length)))
      for (let p = a; p <= b + 1e-6; p += step) {
        if (axis === "x") solid(0.04, 0.46, 0.05, partitionFrame, p, 0.47, fixed)
        else solid(0.05, 0.46, 0.04, partitionFrame, fixed, 0.47, p)
      }
    }
  }

  // Desks: monitor, keyboard and chair, with a live screen that the scene lights.
  const screens = new Map<string, Screen>()
  const deskSet = (seat: string, chairColor: string, screenAccent: string) => {
    const s = plan.spots[seat]
    place("desk", s.x, s.z - 0.56, Math.PI, { scale: 1.05 })
    place("chairDesk", s.x, s.z, Math.PI, { colors: { carpet: chairColor } })
    place("computerScreen", s.x, s.z - 0.66, Math.PI, { y: 0.4 })
    place("computerKeyboard", s.x, s.z - 0.34, Math.PI, { y: 0.4 })
    const texture = screenTexture(screenAccent)
    const material = new THREE.MeshBasicMaterial({ map: texture, color: mood.screenOff, toneMapped: !night })
    plane(0.33, 0.2, material, s.x, 0.576, s.z - 0.604)
    screens.set(seat, { material, texture, level: 0 })
  }

  // Rooms.
  const roomGlow = new Map<string, RoomGlow>()
  const roomAnchors = new Map<string, THREE.Vector3>()
  for (const rp of plan.rooms) {
    const { room } = rp
    const cx = (rp.x0 + rp.x1) / 2
    const roomW = rp.x1 - rp.x0
    const color = neon(room.color)
    rug(cx, rp.z0 + 1.55, roomW - 0.7, ROOM_D - 0.55, tint(room.color), tint(room.color, 0.12))
    for (const seat of rp.seats) deskSet(seat, room.color, color)
    partition("x", rp.z1, rp.x0 + 0.05, rp.x1 - 0.05, [[cx - 0.55, cx + 0.55]])
    if (rp.row < plan.rows - 1) partition("x", rp.z0, rp.x0 + 0.05, rp.x1 - 0.05)
    if (rp.col > 0) partition("z", rp.x0, rp.z0 + 0.05, rp.z1)
    if (!plan.rooms.some((o) => o.row === rp.row && o.col === rp.col + 1)) partition("z", rp.x1, rp.z0 + 0.05, rp.z1)

    const back = rp.row === plan.rows - 1
    const signW = Math.min(1.62, roomW - 0.6)
    const signZ = back ? 0.05 : rp.z0 + 0.03
    const signMap = signTexture(room.name.toUpperCase(), color, room.glyph)
    const signMaterial = night
      ? new THREE.MeshBasicMaterial({ map: signMap, transparent: true, toneMapped: false, color: new THREE.Color(mood.signGain, mood.signGain, mood.signGain) })
      : new THREE.MeshStandardMaterial({ map: signMap, transparent: true, roughness: 0.6 })
    plane(signW, signW * 0.278, signMaterial, cx, 1.0, signZ)
    if (!back) {
      for (const dx of [-signW * 0.35, signW * 0.35]) solid(0.025, 0.09, 0.025, partitionFrame, cx + dx, 0.74, signZ)
    }
    roomAnchors.set(room.id, new THREE.Vector3(cx + signW / 2 - 0.05, 1.22, signZ))

    place("pottedPlant", rp.x1 - 0.38, rp.z0 + 0.38, 0, { scale: 1.1 })
    place("trashcan", rp.x1 - 0.4, rp.z1 - 0.5, 0, { scale: 0.75 })
    if (rp.col === 0) place("bookcaseOpen", 0.32, rp.z0 + 2.5, Math.PI / 2)
    if (night) {
      const light = new THREE.PointLight(color, 0, 4.4, 1.6)
      light.position.set(cx, 1.15, (rp.z0 + rp.z1) / 2)
      scene.add(light)
      roomGlow.set(room.id, { light, level: 0 })
    }
  }
  for (const slot of plan.emptySlots) {
    const cx = (slot.x0 + slot.x1) / 2
    const cz = (slot.z0 + slot.z1) / 2
    place("pottedPlant", cx, cz, 0, { scale: 1.3 })
    place("plantSmall2", cx - 0.9, cz + 0.6, 0, { scale: 1.3 })
    place("plantSmall3", cx + 0.8, cz - 0.5, 0, { scale: 1.3 })
  }
  if (plan.rooms.length) {
    plane(0.95, 0.6, new THREE.MeshStandardMaterial({ map: whiteboardTexture(mood.art), roughness: 0.4 }), 0.62, 0.82, 0.07)
    solid(1.01, 0.66, 0.03, std(mood.materials.metal), 0.62, 0.82, 0.045)
  }

  // Kitchen, against the left wall.
  rug(1.3, zF + 1.7, 2.3, 2.4, mood.kitchenRug, mood.kitchenRug)
  for (const z of [zF + 0.5, zF + 0.95, zF + 1.4]) {
    place("kitchenCabinet", 0.28, z, Math.PI / 2)
    place("kitchenCabinetUpper", 0.25, z, Math.PI / 2, { y: 0.88 })
  }
  place("kitchenSink", 0.28, zF + 1.85, Math.PI / 2)
  place("kitchenCoffeeMachine", 0.3, zF + 0.95, Math.PI / 2, { y: 0.45, scale: 1.15 })
  place("kitchenFridgeSmall", 0.28, zF + 2.32, Math.PI / 2, { scale: 1.2 })
  place("plantSmall3", 0.3, zF + 0.5, 0, { y: 0.45, scale: 1.2 })

  // Schedule board on the left wall, where the corridor meets it.
  plane(0.95, 0.6, new THREE.MeshStandardMaterial({ map: boardTexture(mood.art), roughness: 0.5 }), 0.07, 0.82, plan.corridorZ, Math.PI / 2)
  solid(0.03, 0.66, 1.01, std(mood.trim), 0.045, 0.82, plan.corridorZ)

  // Lounge.
  const sofaX = xs(4.7)
  place("rugRounded", sofaX, zF + 1.5, 0, { scale: 2.6, colors: { carpet: mood.loungeRug, carpetDarker: tint(mood.sofa, 0.1) }, shadow: false })
  place("loungeDesignSofa", sofaX, zF + 0.55, 0, { scale: 1.45, colors: { carpetBlue: mood.sofa } })
  place("tableCoffee", sofaX, zF + 2.05, 0, { scale: 1.4 })
  place("books", sofaX - 0.22, zF + 2.05, 0.3, { y: 0.32, scale: 0.9 })
  place("loungeChair", xs(6.25), zF + 1.45, -Math.PI / 2, { colors: { carpet: mood.sofa } })
  place("lampRoundFloor", xs(2.95) + 0.12, zF + 0.4, 0, { scale: 1.25 })
  place("pottedPlant", xs(6.55), zF + 0.45, 0, { scale: 1.3 })
  place("sideTable", xs(2.95) + 0.25, zF + 2.95)
  place("radio", xs(2.95) + 0.25, zF + 2.95, 0.4, { y: 0.4, scale: 0.9 })

  // Hot desks.
  const hot = plan.front.hot
  rug((hot.x0 + hot.x1) / 2, zF + 1.4, hot.x1 - hot.x0 - 0.4, 2.3, tint(mood.hotAccent), tint(mood.hotAccent, 0.12))
  for (const seat of plan.hotSeats) deskSet(seat, mood.hotAccent, "#7dd3fc")

  // Your desk: an empty chair, a laptop, a lamp and an in-tray. The queue stands in front.
  const deskX = xs(12.9)
  rug(deskX - 0.2, zF + 1.75, 2.6, 2.6, mood.youRug, tint("#f2a65a", 0.25))
  place("desk", deskX, zF + 0.95, 0, { scale: 1.1 })
  place("chairDesk", deskX, zF + 0.42, 0, { colors: { carpet: "#f2a65a" } })
  place("laptop", deskX - 0.18, zF + 0.95, 0.35, { y: 0.42, scale: 0.75 })
  place("lampSquareTable", deskX + 0.45, zF + 0.9, 0, { y: 0.42, scale: 0.8 })
  solid(0.24, 0.02, 0.18, std("#ffffff"), deskX + 0.2, 0.44, zF + 1.12)
  place("coatRackStanding", W - 0.45, zF + 0.45, 0, { scale: 1.1 })
  place("plantSmall1", xs(11.55), zF + 0.5, 0, { scale: 1.4 })
  place("rugDoormat", W - 0.6, D - 0.34, 0, { scale: 1.2, shadow: false })

  // Night: warm pools of light. The count never changes, so shaders never recompile.
  if (night) {
    const lamp = new THREE.PointLight("#ffb86b", 4.5, 4.8, 1.4)
    lamp.position.set(xs(2.95) + 0.12, 1.05, zF + 0.4)
    const kitchenLight = new THREE.PointLight("#ffcf8a", 2.4, 3.2, 1.5)
    kitchenLight.position.set(0.7, 1.05, zF + 1.0)
    const deskLight = new THREE.PointLight("#ffd27a", 2.8, 3, 1.5)
    deskLight.position.set(deskX + 0.45, 0.95, zF + 0.95)
    scene.add(lamp, kitchenLight, deskLight)
  }

  const lastRoom = plan.rooms[plan.rooms.length - 1]
  return {
    screens,
    roomGlow,
    anchors: {
      kitchen: new THREE.Vector3(1.3, 0.05, D - 0.3),
      lounge: new THREE.Vector3(sofaX, 0.05, D - 0.25),
      hot: new THREE.Vector3((hot.x0 + hot.x1) / 2, 0.05, D - 0.25),
      you: new THREE.Vector3(deskX - 0.2, 0.05, D - 0.25),
      schedule: new THREE.Vector3(0.12, 1.3, plan.corridorZ),
      more: lastRoom ? new THREE.Vector3(lastRoom.x1 - 0.4, 1.45, lastRoom.z0 + 0.05) : new THREE.Vector3(W - 1, 1.45, 0.05),
      rooms: roomAnchors,
    },
  }
}
