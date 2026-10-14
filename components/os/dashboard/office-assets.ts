import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"

export const MODEL_NAMES = [
  "wall", "wallWindow", "desk", "chairDesk", "computerScreen", "computerKeyboard", "laptop", "loungeDesignSofa",
  "loungeChair", "tableCoffee", "pottedPlant", "plantSmall1", "plantSmall2", "plantSmall3", "lampRoundFloor",
  "bookcaseOpen", "bookcaseClosedWide", "kitchenCabinet", "kitchenCabinetUpper", "kitchenCoffeeMachine",
  "kitchenFridgeSmall", "kitchenSink", "rugRectangle", "rugRounded", "rugDoormat", "trashcan", "coatRackStanding",
  "speaker", "sideTable", "lampSquareTable", "books", "radio",
] as const

export type ModelName = (typeof MODEL_NAMES)[number]
export type ModelLibrary = Map<ModelName, { scene: THREE.Group; box: THREE.Box3 }>

/**
 * Kenney Furniture Kit (CC0, www.kenney.nl; see office-models/License.txt).
 * Each is written as new URL("literal", import.meta.url) so the bundler copies the
 * file into .next/static/media with a content hash: installed copies always have it.
 */
const MODEL_URLS: Record<ModelName, URL> = {
  wall: new URL("./office-models/wall.glb", import.meta.url),
  wallWindow: new URL("./office-models/wallWindow.glb", import.meta.url),
  desk: new URL("./office-models/desk.glb", import.meta.url),
  chairDesk: new URL("./office-models/chairDesk.glb", import.meta.url),
  computerScreen: new URL("./office-models/computerScreen.glb", import.meta.url),
  computerKeyboard: new URL("./office-models/computerKeyboard.glb", import.meta.url),
  laptop: new URL("./office-models/laptop.glb", import.meta.url),
  loungeDesignSofa: new URL("./office-models/loungeDesignSofa.glb", import.meta.url),
  loungeChair: new URL("./office-models/loungeChair.glb", import.meta.url),
  tableCoffee: new URL("./office-models/tableCoffee.glb", import.meta.url),
  pottedPlant: new URL("./office-models/pottedPlant.glb", import.meta.url),
  plantSmall1: new URL("./office-models/plantSmall1.glb", import.meta.url),
  plantSmall2: new URL("./office-models/plantSmall2.glb", import.meta.url),
  plantSmall3: new URL("./office-models/plantSmall3.glb", import.meta.url),
  lampRoundFloor: new URL("./office-models/lampRoundFloor.glb", import.meta.url),
  bookcaseOpen: new URL("./office-models/bookcaseOpen.glb", import.meta.url),
  bookcaseClosedWide: new URL("./office-models/bookcaseClosedWide.glb", import.meta.url),
  kitchenCabinet: new URL("./office-models/kitchenCabinet.glb", import.meta.url),
  kitchenCabinetUpper: new URL("./office-models/kitchenCabinetUpper.glb", import.meta.url),
  kitchenCoffeeMachine: new URL("./office-models/kitchenCoffeeMachine.glb", import.meta.url),
  kitchenFridgeSmall: new URL("./office-models/kitchenFridgeSmall.glb", import.meta.url),
  kitchenSink: new URL("./office-models/kitchenSink.glb", import.meta.url),
  rugRectangle: new URL("./office-models/rugRectangle.glb", import.meta.url),
  rugRounded: new URL("./office-models/rugRounded.glb", import.meta.url),
  rugDoormat: new URL("./office-models/rugDoormat.glb", import.meta.url),
  trashcan: new URL("./office-models/trashcan.glb", import.meta.url),
  coatRackStanding: new URL("./office-models/coatRackStanding.glb", import.meta.url),
  speaker: new URL("./office-models/speaker.glb", import.meta.url),
  sideTable: new URL("./office-models/sideTable.glb", import.meta.url),
  lampSquareTable: new URL("./office-models/lampSquareTable.glb", import.meta.url),
  books: new URL("./office-models/books.glb", import.meta.url),
  radio: new URL("./office-models/radio.glb", import.meta.url),
}

let library: Promise<ModelLibrary> | null = null

/** Every model, loaded once per page and shared by every scene. A failed load is retried next time. */
export function loadModels(): Promise<ModelLibrary> {
  if (!library) {
    const loading = (async () => {
      const loader = new GLTFLoader()
      const entries = await Promise.all(
        MODEL_NAMES.map(async (name) => {
          const gltf = await loader.loadAsync(MODEL_URLS[name].href)
          return [name, { scene: gltf.scene, box: new THREE.Box3().setFromObject(gltf.scene) }] as const
        })
      )
      return new Map(entries) as ModelLibrary
    })()
    loading.catch(() => {
      library = null
    })
    library = loading
  }
  return library
}
