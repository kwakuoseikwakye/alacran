import { describe, it, expect } from "vitest"
import {
  isValidImageType,
  scaleImageToDataUrl,
  processAvatarImage,
} from "./process-avatar-image"

describe("process-avatar-image", () => {
  describe("isValidImageType", () => {
    it("recognizes standard image MIME types", () => {
      expect(isValidImageType({ type: "image/png" })).toBe(true)
      expect(isValidImageType({ type: "image/jpeg" })).toBe(true)
      expect(isValidImageType({ type: "image/webp" })).toBe(true)
      expect(isValidImageType({ type: "image/svg+xml" })).toBe(true)
      expect(isValidImageType({ type: "image/gif" })).toBe(true)
      expect(isValidImageType({ type: "image/avif" })).toBe(true)
    })

    it("recognizes image files by filename extension when MIME type is missing", () => {
      expect(isValidImageType({ name: "logo.PNG" })).toBe(true)
      expect(isValidImageType({ name: "avatar.jpeg" })).toBe(true)
      expect(isValidImageType({ name: "badge.svg" })).toBe(true)
      expect(isValidImageType({ name: "photo.webp" })).toBe(true)
      expect(isValidImageType({ name: "anim.gif" })).toBe(true)
      expect(isValidImageType({ name: "icon.ico" })).toBe(true)
    })

    it("rejects non-image MIME types and extensions", () => {
      expect(isValidImageType({ type: "application/pdf", name: "doc.pdf" })).toBe(false)
      expect(isValidImageType({ type: "text/plain", name: "notes.txt" })).toBe(false)
      expect(isValidImageType({ name: "script.sh" })).toBe(false)
      expect(isValidImageType({})).toBe(false)
    })
  })

  describe("scaleImageToDataUrl", () => {
    it("preserves SVG data URLs without rasterizing", async () => {
      const svgData = "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="
      const result = await scaleImageToDataUrl(svgData, 384)
      expect(result).toBe(svgData)
    })

    it("returns dataUrl as is in non-browser environment", async () => {
      const data = "data:image/png;base64,iVBORw0KGgo="
      const result = await scaleImageToDataUrl(data, 384)
      expect(result).toBe(data)
    })
  })

  describe("processAvatarImage", () => {
    it("rejects non-image files with a descriptive error", async () => {
      const file = new File(["not an image"], "notes.txt", { type: "text/plain" })
      const result = await processAvatarImage(file)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain("Please select an image file")
      }
    })

    it("rejects files exceeding the maximum size limit", async () => {
      const bigFile = {
        name: "huge.png",
        type: "image/png",
        size: 15 * 1024 * 1024,
      } as unknown as File
      const result = await processAvatarImage(bigFile)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain("too large")
      }
    })

    it("successfully processes an image file and produces a data URL", async () => {
      const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
      const file = new File([pngBytes], "logo.png", { type: "image/png" })
      const result = await processAvatarImage(file)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.dataUrl.startsWith("data:image/")).toBe(true)
      }
    })

    it("successfully processes an SVG file and preserves svg mime type", async () => {
      const svgContent = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>'
      const file = new File([svgContent], "logo.svg", { type: "image/svg+xml" })
      const result = await processAvatarImage(file)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.dataUrl.startsWith("data:image/svg+xml;base64,")).toBe(true)
      }
    })
  })
})
