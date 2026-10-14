import * as THREE from "three"
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js"
import type { Person } from "@/lib/os/office/director"

/**
 * The office's people: jointed figures built from rounded boxes (hips, knees,
 * shoulders, head), in the spirit of Claw3D's characters but written here.
 * Drawn 1.3× a 0.77-tile box person so they read at card size beside Kenney furniture.
 */
export const PERSON_SCALE = 1.3

export type PersonLook = { shirt: string; pants: string; hair: string; skin: string }

export type PersonMesh = {
  root: THREE.Group
  body: THREE.Group
  torso: THREE.Group
  head: THREE.Group
  legs: { thigh: THREE.Group; knee: THREE.Group }[]
  arms: THREE.Group[]
  eyes: THREE.Mesh[]
  paper: THREE.Mesh
  cup: THREE.Mesh
  materials: THREE.Material[]
}

const POSE_KEYS = ["bodyY", "torsoX", "headX", "headY", "thighL", "thighR", "kneeL", "kneeR", "armLX", "armRX", "armLZ", "armRZ"] as const
export type Pose = Record<(typeof POSE_KEYS)[number], number>

const PANTS = ["#2f3442", "#30304a", "#3b4250", "#2b3a33", "#3a2f2f"]
const HAIR = ["#3a2a22", "#151515", "#8a5a3b", "#c58b4f", "#5b3a29"]
const SKIN = ["#f1c9a5", "#e8b48e", "#c98c65", "#a8704c", "#f5d5b8"]

/** Seated hips rest on the cushion: a desk chair's seat is ~0.23 tiles up, the sofa's ~0.27. */
const SIT_Y = 0.23 / PERSON_SCALE - 0.3
const SOFA_Y = 0.27 / PERSON_SCALE - 0.3

/** A stable number per person, for looks and animation offsets. */
export function seedOf(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function lookFor(id: string, shirt: string): PersonLook {
  const h = seedOf(id)
  return { shirt, pants: PANTS[h % PANTS.length], hair: HAIR[(h >>> 3) % HAIR.length], skin: SKIN[(h >>> 6) % SKIN.length] }
}

export function buildPerson(look: PersonLook): PersonMesh {
  const materials: THREE.Material[] = []
  const standard = (color: string, roughness = 0.8) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness })
    materials.push(material)
    return material
  }
  const block = (w: number, h: number, d: number, material: THREE.Material, y = 0, x = 0, z = 0, r = 0.018) => {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2)), material)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    return mesh
  }
  const shirt = standard(look.shirt)
  const pants = standard(look.pants)
  const skin = standard(look.skin, 0.72)
  const hair = standard(look.hair, 0.9)
  const shoes = standard("#22252d")

  const root = new THREE.Group()
  const figure = new THREE.Group()
  figure.scale.setScalar(PERSON_SCALE)
  root.add(figure)
  const body = new THREE.Group()
  figure.add(body)
  const hips = new THREE.Group()
  hips.position.y = 0.3
  body.add(hips)

  const legs = [-1, 1].map((side) => {
    const thigh = new THREE.Group()
    thigh.position.x = side * 0.056
    thigh.add(block(0.088, 0.155, 0.098, pants, -0.075))
    const knee = new THREE.Group()
    knee.position.y = -0.15
    knee.add(block(0.082, 0.12, 0.092, pants, -0.06))
    knee.add(block(0.09, 0.045, 0.13, shoes, -0.135, 0, 0.02, 0.015))
    thigh.add(knee)
    hips.add(thigh)
    return { thigh, knee }
  })

  const torso = new THREE.Group()
  hips.add(torso)
  torso.add(block(0.235, 0.255, 0.14, shirt, 0.127, 0, 0, 0.03))
  torso.add(block(0.24, 0.035, 0.145, pants, 0.012, 0, 0, 0.01))

  const arms = [-1, 1].map((side) => {
    const arm = new THREE.Group()
    arm.position.set(side * 0.155, 0.235, 0)
    arm.add(block(0.072, 0.145, 0.085, shirt, -0.07, 0, 0, 0.022))
    arm.add(block(0.064, 0.1, 0.074, skin, -0.18, 0, 0, 0.02))
    torso.add(arm)
    return arm
  })

  const head = new THREE.Group()
  head.position.y = 0.255
  torso.add(head)
  head.add(block(0.215, 0.215, 0.205, skin, 0.115, 0, 0, 0.035))
  head.add(block(0.23, 0.08, 0.22, hair, 0.218, 0, -0.005, 0.028))
  head.add(block(0.23, 0.16, 0.065, hair, 0.15, 0, -0.08, 0.025))
  const fringe = block(0.2, 0.04, 0.034, hair, 0.19, 0.014, 0.096, 0.012)
  fringe.rotation.z = -0.09
  head.add(fringe)
  const ink = new THREE.MeshBasicMaterial({ color: "#1d1a17" })
  materials.push(ink)
  const eyes = [-1, 1].map((side) => {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.027, 0.038, 0.01), ink)
    eye.position.set(side * 0.048, 0.12, 0.104)
    head.add(eye)
    return eye
  })
  const blush = new THREE.MeshBasicMaterial({ color: "#f29a8a", transparent: true, opacity: 0.55 })
  blush.userData.baseOpacity = 0.55
  materials.push(blush)
  for (const side of [-1, 1]) {
    const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.015, 0.006), blush)
    cheek.position.set(side * 0.076, 0.085, 0.103)
    head.add(cheek)
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.011, 0.01), ink)
  mouth.position.set(0, 0.066, 0.104)
  head.add(mouth)

  const paper = block(0.11, 0.008, 0.14, standard("#ffffff", 0.6), -0.24, 0, 0.05, 0.003)
  paper.rotation.x = -0.5
  arms[0].add(paper)
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.06, 16), standard("#ffffff", 0.4))
  cup.position.set(0, -0.25, 0.03)
  arms[0].add(cup)

  const shadowMaterial = new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.16, depthWrite: false })
  shadowMaterial.userData.baseOpacity = 0.16
  materials.push(shadowMaterial)
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.2, 28), shadowMaterial)
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.012
  root.add(shadow)

  return { root, body, torso, head, legs, arms, eyes, paper, cup, materials }
}

export function restPose(): Pose {
  return Object.fromEntries(POSE_KEYS.map((key) => [key, 0])) as Pose
}

/** Where each joint should be right now. Reduced motion keeps every pose and drops the movement. */
export function targetPose(p: Person, t: number, seed: number, reducedMotion: boolean): Pose {
  const m = reducedMotion ? 0 : 1
  const s = (seed % 1000) / 160
  const o = restPose()
  if (p.walking) {
    const phase = p.walkPhase
    o.thighL = Math.sin(phase) * 0.55
    o.thighR = -Math.sin(phase) * 0.55
    o.kneeL = Math.max(0, -Math.sin(phase + 0.9)) * 0.75
    o.kneeR = Math.max(0, Math.sin(phase + 0.9)) * 0.75
    o.armLX = p.carry === "paper" ? -0.9 : -Math.sin(phase) * 0.5
    o.armRX = Math.sin(phase) * 0.5
    o.bodyY = Math.abs(Math.sin(phase)) * 0.022
    o.torsoX = 0.06
    return o
  }
  switch (p.posture) {
    case "sit":
    case "slump": {
      o.bodyY = SIT_Y
      o.thighL = o.thighR = -Math.PI / 2
      o.kneeL = o.kneeR = Math.PI / 2
      if (p.posture === "slump") {
        o.torsoX = 0.5
        o.headX = 0.35
        o.armLX = -0.35
        o.armRX = -0.3
        return o
      }
      const k = t * 17 + s
      o.armLX = -1.2 + Math.sin(k) * 0.07 * m
      o.armRX = -1.2 + Math.sin(k + Math.PI) * 0.07 * m
      o.torsoX = 0.1
      o.headX = 0.14 + Math.sin(t * 1.4 + s) * 0.03 * m
      return o
    }
    case "sofa":
      o.bodyY = SOFA_Y
      o.thighL = o.thighR = -Math.PI / 2
      o.kneeL = o.kneeR = Math.PI / 2
      o.torsoX = -0.16
      o.armLX = o.armRX = -0.35
      o.armLZ = 0.15
      o.armRZ = -0.15
      o.headY = Math.sin(t * 0.4 + s) * 0.35 * m
      return o
    case "wave":
      o.armRZ = -2.65 + Math.sin(t * 9) * 0.28 * m
      o.armLX = p.carry === "paper" ? -0.9 : 0
      o.headY = Math.sin(t * 0.8) * 0.12 * m
      o.bodyY = Math.abs(Math.sin(t * 4.5)) * 0.015 * m
      return o
    case "coffee":
      o.armLX = -1.35 - Math.max(0, Math.sin(t * 0.9 + s) - 0.6) * 0.9 * m
      o.headY = Math.sin(t * 0.5 + s) * 0.3 * m
      return o
    default:
      o.headY = Math.sin(t * 0.6 + s) * 0.45 * m
      o.bodyY = Math.sin(t * 2.2 + s) * 0.004 * m
      o.armLZ = 0.06
      o.armRZ = -0.06
      return o
  }
}

/** Ease every joint toward the target so sitting, standing and waving flow into each other. */
export function blendPose(current: Pose, target: Pose, dt: number): void {
  const k = 1 - Math.exp(-dt * 11)
  for (const key of POSE_KEYS) current[key] += (target[key] - current[key]) * k
}

export function applyPose(mesh: PersonMesh, pose: Pose, p: Person, t: number, seed: number, reducedMotion: boolean): void {
  mesh.body.position.y = pose.bodyY
  mesh.torso.rotation.x = pose.torsoX
  mesh.head.rotation.x = pose.headX
  mesh.head.rotation.y = pose.headY
  mesh.legs[0].thigh.rotation.x = pose.thighL
  mesh.legs[1].thigh.rotation.x = pose.thighR
  mesh.legs[0].knee.rotation.x = pose.kneeL
  mesh.legs[1].knee.rotation.x = pose.kneeR
  mesh.arms[0].rotation.x = pose.armLX
  mesh.arms[1].rotation.x = pose.armRX
  mesh.arms[0].rotation.z = pose.armLZ
  mesh.arms[1].rotation.z = pose.armRZ
  const blinking = !reducedMotion && (t + (seed % 997) * 0.013) % 4.2 < 0.12
  for (const eye of mesh.eyes) eye.scale.y = blinking ? 0.15 : 1
  mesh.paper.visible = p.carry === "paper"
  mesh.cup.visible = !p.walking && p.posture === "coffee"
}

/** Fade a person in or out; materials that start translucent (blush, shadow) keep their ratio. */
export function setOpacity(mesh: PersonMesh, opacity: number): void {
  for (const material of mesh.materials) {
    const base = (material.userData.baseOpacity as number | undefined) ?? 1
    const transparent = base < 1 || opacity < 1
    if (material.transparent !== transparent) material.needsUpdate = true
    material.transparent = transparent
    material.opacity = base * opacity
    material.depthWrite = !transparent
  }
  mesh.root.visible = opacity > 0.01
}

export function disposePerson(mesh: PersonMesh): void {
  mesh.root.traverse((node) => {
    if (node instanceof THREE.Mesh) node.geometry.dispose()
  })
  for (const material of mesh.materials) material.dispose()
}
