"use client"

import * as React from "react"
import { XIcon } from "lucide-react"
import { AlertDialog as AlertDialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

function AlertDialog({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
}

function AlertDialogTrigger({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  )
}

function AlertDialogPortal({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
  )
}

function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={cn(
        "fixed inset-0 z-70 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

/**
 * **Every modal in this app closes from an X in the top-right corner, and this
 * one used to be the exception.** Nine confirmations route through here — add a
 * starter pack, install daily-team-log, back up to GitHub, remove a company,
 * delete a file, three commit confirmations — and none of them rendered a close
 * control at all. Radix's AlertDialog also declines to dismiss on an outside
 * click, by design, so the only ways out were Escape and a footer button that a
 * 600px-tall dialog puts below the fold. Aiming at the corner where every other
 * modal's X lives and having nothing happen is exactly what "the X doesn't
 * work" describes.
 *
 * The X is an `AlertDialogPrimitive.Cancel` — semantically the same as the
 * footer's Cancel, never the destructive action — and it is FIRST in the DOM on
 * purpose. Radix hands initial focus to whichever Cancel registers the shared
 * `cancelRef` last, so putting the icon first leaves that to the footer's real
 * Cancel button, where it belongs. Painting order is unaffected: an absolutely
 * positioned box always paints over in-flow siblings regardless of source order.
 *
 * The scroll container is the other half of the fix. `overflow-y-auto` used to
 * sit on the content box itself, which meant an absolutely positioned X would
 * scroll away with the text — pointless on precisely the long dialogs that need
 * it most. Same shape as SheetContent: the body scrolls, the X stays pinned.
 */
function AlertDialogContent({
  className,
  children,
  size = "default",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content> & {
  size?: "default" | "sm"
  showCloseButton?: boolean
}) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        data-size={size}
        className={cn(
          "group/alert-dialog-content fixed top-[50%] left-[50%] z-70 grid max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] grid-rows-[minmax(0,1fr)] overflow-hidden rounded-lg border bg-background p-6 shadow-lg duration-200 data-[size=sm]:max-w-xs data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[size=default]:sm:max-w-lg",
          className
        )}
        {...props}
      >
        {showCloseButton && (
          <AlertDialogPrimitive.Cancel
            aria-label="Close"
            className="absolute top-3 right-3 grid size-9 place-items-center rounded-md text-muted-foreground opacity-80 transition-[background-color,opacity,color] hover:bg-muted hover:text-foreground hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden disabled:pointer-events-none"
          >
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </AlertDialogPrimitive.Cancel>
        )}
        {/* `gap-4` moved here with the children it was spacing. `min-h-0` is what
            lets this row actually shrink inside the capped grid — without it a
            grid item's auto minimum keeps it at full content height and the
            dialog overflows the viewport instead of scrolling. */}
        <div className="grid min-h-0 auto-rows-min content-start gap-4 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </AlertDialogPrimitive.Content>
    </AlertDialogPortal>
  )
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn(
        "grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-6 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn(
        "text-lg font-semibold sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function AlertDialogMedia({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-media"
      className={cn(
        "mb-2 inline-flex size-16 items-center justify-center rounded-md bg-muted sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-8",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogAction({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size">) {
  return (
    <Button variant={variant} size={size} asChild>
      <AlertDialogPrimitive.Action
        data-slot="alert-dialog-action"
        className={cn(className)}
        {...props}
      />
    </Button>
  )
}

function AlertDialogCancel({
  className,
  variant = "outline",
  size = "default",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel> &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size">) {
  return (
    <Button variant={variant} size={size} asChild>
      <AlertDialogPrimitive.Cancel
        data-slot="alert-dialog-cancel"
        className={cn(className)}
        {...props}
      />
    </Button>
  )
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
}
