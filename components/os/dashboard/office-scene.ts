import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js"
import { RenderPass } from "three/addons/postprocessing/RenderPass.js"
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js"
import { OutputPass } from "three/addons/postprocessing/OutputPass.js"
import { elapsed } from "@/lib/agent-runs/run-view"
import { HOT_DESKS, STATE_WORDS, YOUR_DESK, wasDrag, type DeskId, type Office } from "@/lib/os/office/types"
import type { OfficePlan } from "@/lib/os/office/plan"
import type { Director, Person } from "@/lib/os/office/director"
import { liftLabels } from "@/lib/os/office/labels"
import { loadModels, type ModelLibrary } from "./office-assets"
import type { Mood } from "./office-moods"
import { applyPose, blendPose, buildPerson, disposePerson, lookFor, seedOf, setOpacity, targetPose, type PersonMesh, type Pose } from "./office-people"
import { buildWorld } from "./office-world"

/**
 * The office picture. Only ever loaded by a dynamic import from the Home card, so
 * Home's first paint never waits on three. It draws what the director says; it owns
 * no state that must survive it, so a theme switch can rebuild it freely.
 */
export type SceneMode = "card" | "full"

export type OfficeSceneOptions = {
  mode: SceneMode
  mood: Mood
  director: Director
  reducedMotion: boolean
  onSelect: (person: Person) => void
  onContextLost: () => void
}

export type OfficeScene = {
  setOffice(office: Office): void
  setVisible(visible: boolean): void
  follow(personId: string | null): void
  dispose(): void
}

type Actor = {
  mesh: PersonMesh
  pose: Pose
  yaw: number
  seed: number
  opacity: number
  tag: HTMLDivElement
  bubble: HTMLDivElement
  bubbleText: string | null
  /** How far its labels are lifted to clear someone else's, in px; eased toward its target. */
  lift: number
  /** Its label stack's size, measured again whenever the bubble's words change. */
  size: { width: number; height: number; tag: { width: number; height: number } } | null
}

export function hasWebGL(): boolean {
  try {
    const gl = document.createElement("canvas").getContext("webgl2")
    // Release the probe's context at once: browsers cap live contexts and warn past it.
    gl?.getExtension("WEBGL_lose_context")?.loseContext()
    return !!gl
  } catch {
    return false
  }
}

const ON = new THREE.Color("#ffffff")

export async function mountOfficeScene(host: HTMLElement, plan: OfficePlan, options: OfficeSceneOptions): Promise<OfficeScene | null> {
  if (!hasWebGL()) return null
  let models: ModelLibrary
  try {
    models = await loadModels()
  } catch {
    return null
  }
  const { mode, mood, director, reducedMotion } = options
  const card = mode === "card"

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, card ? 1.5 : 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = mood.exposure
  renderer.domElement.setAttribute("aria-hidden", "true")
  host.appendChild(renderer.domElement)

  const overlay = document.createElement("div")
  overlay.className = "office-labels"
  // The card's summary and list already say all of this to screen readers.
  overlay.setAttribute("aria-hidden", "true")
  overlay.dataset.mood = mood.name
  host.appendChild(overlay)

  const scene = new THREE.Scene()
  const world = buildWorld(scene, plan, mood, models)
  const center = new THREE.Vector3(plan.width / 2, 0.4, plan.depth / 2)

  scene.add(new THREE.HemisphereLight(mood.hemi[0], mood.hemi[1], mood.hemi[2]))
  const sun = new THREE.DirectionalLight(mood.sun.color, mood.sun.intensity)
  sun.position.set(center.x + mood.sun.at[0], mood.sun.at[1], center.z + mood.sun.at[2])
  sun.target.position.copy(center)
  sun.castShadow = true
  const mapSize = card ? 1024 : 2048
  sun.shadow.mapSize.set(mapSize, mapSize)
  const reach = Math.max(plan.width, plan.depth) * 0.75
  sun.shadow.camera.left = -reach
  sun.shadow.camera.right = reach
  sun.shadow.camera.top = reach
  sun.shadow.camera.bottom = -reach
  sun.shadow.camera.far = 80
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.025
  sun.shadow.intensity = mood.sun.shadow
  sun.shadow.radius = 3
  scene.add(sun, sun.target)

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400)
  const azimuth = THREE.MathUtils.degToRad(32)
  const elevation = THREE.MathUtils.degToRad(38)
  const distance = 60
  camera.position.set(
    center.x + Math.sin(azimuth) * Math.cos(elevation) * distance,
    center.y + Math.sin(elevation) * distance,
    center.z + Math.cos(azimuth) * Math.cos(elevation) * distance
  )
  camera.lookAt(center)
  let controls: OrbitControls | null = null
  if (!card) {
    controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(center)
    controls.enableDamping = true
    controls.minZoom = 0.7
    controls.maxZoom = 4
    controls.minPolarAngle = 0.3
    controls.maxPolarAngle = 1.25
    controls.screenSpacePanning = true
  }

  let composer: EffectComposer | null = null
  if (mood.bloom) {
    composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), mood.bloom.strength, mood.bloom.radius, mood.bloom.threshold))
    composer.addPass(new OutputPass())
  }

  // Labels drawn over the 3D: one tag and one bubble per person, zone names, the schedule note, overflow chips.
  const label = (className: string, text = ""): HTMLDivElement => {
    const element = document.createElement("div")
    element.className = className
    element.textContent = text
    overlay.appendChild(element)
    return element
  }
  const zones = {
    kitchen: label("office-zone", "Kitchen"),
    lounge: label("office-zone", "Lounge"),
    hot: label("office-zone", "Hot desks"),
    you: label("office-zone", "Your desk"),
  }
  const board = label("office-board-note")
  const more = label("office-more")
  const roomChips = new Map<string, HTMLDivElement>()
  for (const rp of plan.rooms) roomChips.set(rp.room.id, label("office-room-chip"))

  const actors = new Map<string, Actor>()
  const actorFor = (p: Person, t: number): Actor => {
    let actor = actors.get(p.id)
    if (!actor) {
      const mesh = buildPerson(lookFor(p.id, p.color))
      mesh.root.userData.personId = p.id
      scene.add(mesh.root)
      const tag = document.createElement("div")
      tag.className = "office-tag"
      const swatch = document.createElement("span")
      swatch.className = "av"
      swatch.style.background = p.color
      const name = document.createElement("b")
      name.textContent = p.name
      const status = document.createElement("i")
      status.className = "st"
      tag.append(swatch, name, status)
      const bubble = document.createElement("div")
      bubble.className = "office-bubble"
      overlay.append(bubble, tag)
      const seed = seedOf(p.id)
      // Start in the pose they already hold, so a rebuild does not make seated people sit down again.
      actor = { mesh, pose: targetPose(p, t, seed, reducedMotion), yaw: p.yaw, seed, opacity: -1, tag, bubble, bubbleText: null, lift: 0, size: null }
      actors.set(p.id, actor)
    }
    return actor
  }
  /** A label stack: the tag, plus the bubble above it when one shows; and the tag alone. */
  const sizeOf = (actor: Actor): NonNullable<Actor["size"]> => {
    if (!actor.size?.width) {
      const bubble = actor.bubbleText ? actor.bubble.offsetHeight : 0
      const tag = { width: actor.tag.offsetWidth, height: actor.tag.offsetHeight }
      actor.size = {
        width: Math.max(tag.width, actor.bubbleText ? actor.bubble.offsetWidth : 0),
        height: bubble ? 27 + bubble : tag.height,
        tag,
      }
    }
    return actor.size
  }
  const removeActor = (id: string) => {
    const actor = actors.get(id)
    if (!actor) return
    scene.remove(actor.mesh.root)
    disposePerson(actor.mesh)
    actor.tag.remove()
    actor.bubble.remove()
    actors.delete(id)
  }

  // Fit the whole office into the host, leaving headroom above for name tags.
  const corner = new THREE.Vector3()
  const fit = () => {
    const w = host.clientWidth || 1
    const h = host.clientHeight || 1
    renderer.setSize(w, h)
    composer?.setSize(w, h)
    camera.updateMatrixWorld()
    const t = mood.slab.thickness
    const W = plan.width
    const D = plan.depth
    const points: [number, number, number][] = [
      [-0.2, 0, -0.2], [W + 0.2, 0, -0.2], [-0.2, 0, D + 0.2], [W + 0.2, 0, D + 0.2],
      [W + 0.2, -t, D + 0.2], [-0.2, -t, D + 0.2], [W + 0.2, -t, -0.2],
      [-0.2, 1.32, -0.2], [W, 1.32, -0.2], [-0.2, 1.32, D],
    ]
    // Measure the office as if the camera looked at its centre, wherever it is now: a fit that runs
    // while following (or after a pan) must keep the view on the camera's axis, not pull it back.
    corner.copy(center).applyMatrix4(camera.matrixWorldInverse)
    const ox = corner.x
    const oy = corner.y
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const [x, y, z] of points) {
      corner.set(x, y, z).applyMatrix4(camera.matrixWorldInverse)
      minX = Math.min(minX, corner.x - ox)
      maxX = Math.max(maxX, corner.x - ox)
      minY = Math.min(minY, corner.y - oy)
      maxY = Math.max(maxY, corner.y - oy)
    }
    const spanX = maxX - minX
    const spanY = maxY - minY
    let left = minX - 0.01 * spanX
    let right = maxX + 0.01 * spanX
    let bottom = minY - 0.02 * spanY
    let top = maxY + 0.08 * spanY
    const aspect = w / h
    if ((right - left) / (top - bottom) > aspect) {
      const grow = ((right - left) / aspect - (top - bottom)) / 2
      bottom -= grow
      top += grow
    } else {
      const grow = ((top - bottom) * aspect - (right - left)) / 2
      left -= grow
      right += grow
    }
    camera.left = left
    camera.right = right
    camera.top = top
    camera.bottom = bottom
    camera.updateProjectionMatrix()
  }
  const resizer = new ResizeObserver(fit)
  resizer.observe(host)
  fit()

  // Picking: hover names a person, a click (not a drag) selects them.
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const personAt = (event: MouseEvent): Person | null => {
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(pointer, camera)
    const roots = [...actors.values()].map((a) => a.mesh.root)
    for (const hit of raycaster.intersectObjects(roots, true)) {
      let node: THREE.Object3D | null = hit.object
      while (node && !node.userData.personId) node = node.parent
      const id = node?.userData.personId as string | undefined
      if (id) return director.people.find((p) => p.id === id) ?? null
    }
    return null
  }
  const describe = (p: Person): string =>
    [p.name, p.state === "idle" || p.state === "leaving" ? "Idle" : STATE_WORDS[p.state], p.label, p.startedAt ? elapsed(p.startedAt, null, Date.now()) : null]
      .filter(Boolean)
      .join(" · ")
  let pressedAt: { x: number; y: number } | null = null
  const onDown = (event: PointerEvent) => {
    pressedAt = { x: event.clientX, y: event.clientY }
  }
  const onMove = (event: PointerEvent) => {
    const p = personAt(event)
    host.title = p ? describe(p) : ""
    renderer.domElement.style.cursor = p && (!card || p.href) ? "pointer" : ""
  }
  const onClick = (event: MouseEvent) => {
    if (wasDrag(pressedAt, { x: event.clientX, y: event.clientY })) return
    const p = personAt(event)
    if (p) options.onSelect(p)
  }
  const onLost = (event: Event) => {
    event.preventDefault()
    options.onContextLost()
  }
  renderer.domElement.addEventListener("pointerdown", onDown)
  renderer.domElement.addEventListener("pointermove", onMove)
  renderer.domElement.addEventListener("click", onClick)
  renderer.domElement.addEventListener("webglcontextlost", onLost)

  const v = new THREE.Vector3()
  const goal = new THREE.Vector3()
  const project = (point: THREE.Vector3): { x: number; y: number } => {
    v.copy(point).project(camera)
    return { x: ((v.x + 1) / 2) * host.clientWidth, y: ((1 - v.y) / 2) * host.clientHeight }
  }
  const pin = (element: HTMLElement, point: THREE.Vector3, dy = 0) => {
    const { x, y } = project(point)
    element.style.transform = `translate(-50%, -50%) translate(${x}px, ${y + dy}px)`
  }

  let visible = true
  let followId: string | null = null
  let frame = 0
  let last = performance.now()
  let lastDraw = 0
  let frameMs = 0
  let lastReport = 0
  // Card 30 fps, full-screen 60 fps: a 120 Hz display would otherwise draw bloom twice as often.
  const minFrameMs = card ? 1000 / 30 - 1 : 1000 / 60 - 1

  const tick = (now: number) => {
    frame = requestAnimationFrame(tick)
    if (!visible || document.hidden) {
      last = now
      return
    }
    if (now - lastDraw < minFrameMs) return
    const started = performance.now()
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    lastDraw = now
    const t = now / 1000
    director.step(dt, Date.now())

    const present = new Set<string>()
    const stacks: { actor: Actor; id: string; x: number; y: number; opacity: number; text: string | null }[] = []
    for (const p of director.people) {
      present.add(p.id)
      const actor = actorFor(p, t)
      actor.mesh.root.position.set(p.x, 0, p.z)
      let turn = p.yaw - actor.yaw
      while (turn > Math.PI) turn -= Math.PI * 2
      while (turn < -Math.PI) turn += Math.PI * 2
      actor.yaw += turn * (1 - Math.exp(-dt * 10))
      actor.mesh.root.rotation.y = actor.yaw
      blendPose(actor.pose, targetPose(p, t, actor.seed, reducedMotion), dt)
      applyPose(actor.mesh, actor.pose, p, t, actor.seed, reducedMotion)
      if (actor.opacity !== p.opacity) {
        setOpacity(actor.mesh, p.opacity)
        actor.opacity = p.opacity
      }

      const seated = !p.walking && (p.posture === "sit" || p.posture === "sofa" || p.posture === "slump")
      goal.set(p.x, seated ? 1.02 : 1.2, p.z)
      const { x, y } = project(goal)
      actor.tag.style.opacity = String(p.opacity)
      actor.tag.dataset.status = p.state === "leaving" ? "idle" : p.state
      const text = p.walking
        ? null
        : p.state === "waiting"
          ? "Needs your OK"
          : p.state === "failed"
            ? "Stopped"
            : p.state === "working"
              ? p.label
              : null
      if (text !== actor.bubbleText) {
        actor.bubbleText = text
        actor.size = null
        actor.bubble.replaceChildren()
        if (text) {
          const words = document.createElement("span")
          words.className = "words"
          words.textContent = text
          actor.bubble.append(words)
          if (p.state === "working") {
            const dots = document.createElement("span")
            dots.className = "dots"
            dots.append(document.createElement("i"), document.createElement("i"), document.createElement("i"))
            actor.bubble.append(dots)
          }
        }
      }
      actor.bubble.dataset.status = p.state
      stacks.push({ actor, id: p.id, x, y, opacity: p.opacity, text })
    }
    for (const id of [...actors.keys()]) if (!present.has(id)) removeActor(id)

    // People standing together (a queue at your desk) would cover each other's names: lift the ones
    // behind. In the card a crowd would climb off the top, so a stack that cannot fit keeps only its name.
    const places = liftLabels(
      stacks.filter((s) => s.opacity > 0).map((s) => ({ id: s.id, x: s.x, y: s.y, ...sizeOf(s.actor) })),
      card ? 4 : -Infinity
    )
    const ease = reducedMotion ? 1 : 1 - Math.exp(-dt * 12)
    for (const { actor, id, x, y, opacity, text } of stacks) {
      const place = places.get(id)
      actor.bubble.style.opacity = text && place?.bubble !== false ? String(opacity) : "0"
      actor.lift += ((place?.lift ?? 0) - actor.lift) * ease
      const top = y - actor.lift
      actor.tag.style.transform = `translate(-50%, -100%) translate(${x}px, ${top}px)`
      actor.bubble.style.transform = `translate(-50%, -100%) translate(${x}px, ${top - 27}px)`
    }

    for (const [seat, screen] of world.screens) {
      const working = director.people.some((p) => p.spot === seat && !p.walking && p.posture === "sit" && p.state === "working")
      screen.level += ((working ? 1 : 0) - screen.level) * (1 - Math.exp(-dt * 4))
      screen.material.color.set(mood.screenOff).lerp(ON, screen.level).multiplyScalar(1 + screen.level * (mood.screenBoost - 1))
      if (working && !reducedMotion) screen.texture.offset.y = (screen.texture.offset.y + dt * 0.12) % 1
    }
    for (const [roomId, glow] of world.roomGlow) {
      const busy = director.people.some((p) => p.state === "working" && !p.walking && plan.spots[p.spot]?.roomId === roomId)
      glow.level += ((busy ? 1 : 0) - glow.level) * (1 - Math.exp(-dt * 3))
      glow.light.intensity = glow.level * 2.4
    }

    pin(zones.kitchen, world.anchors.kitchen)
    pin(zones.lounge, world.anchors.lounge)
    pin(zones.hot, world.anchors.hot)
    pin(zones.you, world.anchors.you)
    pin(board, world.anchors.schedule)
    pin(more, world.anchors.more)
    for (const [roomId, chip] of roomChips) {
      const anchor = world.anchors.rooms.get(roomId)
      if (anchor) pin(chip, anchor)
    }

    if (controls) {
      const target = followId ? director.people.find((p) => p.id === followId) : undefined
      if (target) {
        // Reduced motion: cut to the person instead of gliding the camera.
        goal.set(target.x, 0.5, target.z).sub(controls.target).multiplyScalar(reducedMotion ? 1 : 1 - Math.exp(-dt * 4))
        controls.target.add(goal)
        camera.position.add(goal)
      }
      controls.update()
    }
    if (composer) composer.render()
    else renderer.render(scene, camera)

    frameMs = frameMs * 0.9 + (performance.now() - started) * 0.1
    if (now - lastReport > 1000) {
      host.dataset.frameMs = frameMs.toFixed(2)
      lastReport = now
    }
  }
  frame = requestAnimationFrame(tick)

  const unreadableOf = (office: Office, id: DeskId) => office.desks.find((d) => d.id === id)?.unreadable
  const overflow = (n: number) => (n > 0 ? `+${n}` : null)

  return {
    setOffice(office) {
      const workers = office.desks.flatMap((d) => d.workers)
      const count = (roomId: string) => workers.filter((w) => w.roomId === roomId).length
      zones.hot.textContent = ["Hot desks", unreadableOf(office, "terminal"), unreadableOf(office, "runs"), overflow(count(HOT_DESKS) - plan.hotSeats.length)]
        .filter(Boolean)
        .join(" · ")
      zones.you.textContent = ["Your desk", overflow(count(YOUR_DESK) - plan.queue.length)].filter(Boolean).join(" · ")
      const schedule = office.desks.find((d) => d.id === "schedule")
      board.textContent = schedule?.unreadable ?? schedule?.note ?? ""
      for (const rp of plan.rooms) {
        const chip = roomChips.get(rp.room.id)
        const extra = overflow(count(rp.room.id) - rp.seats.length)
        if (chip) {
          chip.textContent = extra ?? ""
          chip.hidden = !extra
        }
      }
      more.textContent = office.moreRooms > 0 ? `+${office.moreRooms} more` : ""
      more.hidden = office.moreRooms <= 0
    },
    setVisible(next) {
      visible = next
    },
    follow(personId) {
      followId = personId
    },
    dispose() {
      cancelAnimationFrame(frame)
      resizer.disconnect()
      renderer.domElement.removeEventListener("pointerdown", onDown)
      renderer.domElement.removeEventListener("pointermove", onMove)
      renderer.domElement.removeEventListener("click", onClick)
      renderer.domElement.removeEventListener("webglcontextlost", onLost)
      controls?.dispose()
      composer?.dispose()
      for (const id of [...actors.keys()]) removeActor(id)
      scene.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry.dispose()
          const materials = Array.isArray(node.material) ? node.material : [node.material]
          for (const material of materials) {
            ;(material as THREE.MeshStandardMaterial).map?.dispose()
            material.dispose()
          }
        }
      })
      renderer.dispose()
      // dispose() frees three's resources, not the WebGL context itself.
      renderer.forceContextLoss()
      renderer.domElement.remove()
      overlay.remove()
      host.title = ""
      delete host.dataset.frameMs
    },
  }
}
