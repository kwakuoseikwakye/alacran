"use client"

import * as React from "react"
import { XIcon } from "lucide-react"
import { Dialog as SheetPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        // Same duration and easing as the content below. They were 0.15s and
        // 0.2s on different curves, so the dim and the box finished at
        // different moments and the whole thing read as a stutter.
        "fixed inset-0 z-70 bg-black/50 duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

/**
 * **This renders a CENTRED MODAL, not a side drawer, and that is the default.**
 *
 * All nine consumers are forms and explainers — Add a company, the setup
 * wizard, the company guide, ownership, MCP servers, Get Started, refresh,
 * verify, connect help — and every one of them asked for exactly
 * `className="w-full sm:max-w-xl"` and no `side`. A 36rem form pinned to the
 * right edge of a desktop window reads as a panel that slid in from
 * somewhere else; centred, it reads as the thing you just asked for. Both
 * shells (the mac Electron window and Linux's WebKitGTK one) are plain app
 * windows with no browser chrome, which makes an edge-anchored drawer even
 * less legible there than in a tab.
 *
 * The four edge positions are kept and still work — nothing uses them today,
 * and a drawer is the right answer for something that annotates what is
 * behind it rather than replacing it.
 *
 * **Why this lives in the primitive and not in nine classNames.** The standing
 * rule is to fix styling in the token or the consumer, never in
 * `components/ui/*`. This is v63's exception, for v63's reason: *where an
 * element is positioned* is structurally the primitive's job, every caller
 * routes through it, and faking a centred box from a consumer means
 * overriding `inset-y-0 right-0 h-full` from the outside, nine times, with
 * nine chances to drift. It is not a licence for colour, spacing or width
 * fixes, which still belong in the consumer.
 *
 * The name stays `Sheet`. Renaming it — and `company-ownership-sheet.tsx`,
 * `mcp-servers-sheet.tsx`, and every tag in nine files — is churn with no
 * behaviour in it; this comment is cheaper and says the same thing.
 */
function SheetContent({
  className,
  children,
  side = "center",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left" | "center"
  showCloseButton?: boolean
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "fixed z-70 flex flex-col gap-4 bg-background shadow-lg data-[state=closed]:animate-out data-[state=open]:animate-in",
          // Centred: a box, not an edge. `max-h` plus the inner scroll
          // container below is what keeps a tall form (the setup wizard is the
          // tallest) reachable instead of clipped off the bottom of the
          // viewport — the same pair v63 added to AlertDialogContent.
          side === "center" &&
            // `ease-[…]` is --ease's curve written out: this file is imported
            // by the server build, and a CSS custom property is not readable
            // from a Tailwind arbitrary value at build time.
            "top-1/2 left-1/2 max-h-[calc(100dvh-4rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          side !== "center" && "transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
          side === "right" &&
            "inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
          side === "left" &&
            "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
          side === "top" &&
            "inset-x-0 top-0 h-auto border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
          side === "bottom" &&
            "inset-x-0 bottom-0 h-auto border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
          className
        )}
        {...props}
      >
        {/* Own scroll container: SheetContent is a fixed, full-height flex column,
            so without this any content taller than the viewport is unreachable.
            Kept outside the close button so the X stays pinned while content scrolls. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          {children}
        </div>
        {/* The button used to BE the icon: 16x16 with no padding, so a click 8px
            off-centre missed entirely and the X read as broken. The icon is still
            16px; the TARGET is 36px, which is what a pointer is aimed at. The
            hover background makes the hit area visible instead of guessable. */}
        {showCloseButton && (
          <SheetPrimitive.Close
            aria-label="Close"
            className="absolute top-3 right-3 grid size-9 place-items-center rounded-md text-muted-foreground opacity-80 transition-[background-color,opacity,color] hover:bg-muted hover:text-foreground hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden disabled:pointer-events-none"
          >
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-semibold text-foreground", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
