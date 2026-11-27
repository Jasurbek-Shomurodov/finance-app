"use client"

import * as React from "react"
import { AlertDialog as AlertDialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useExitGhost } from "@/components/ui/exit-ghost"
import { useReturnFocus } from "@/components/ui/return-focus"
import { useKeyboardInset } from "@/components/ui/dialog-sheet"

function AlertDialog({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
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
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

/** A question before an action, in the same shell as every dialog (app/styles/dialogs.css): 420px wide (`md` gives a
 * longer question 560px), a body that scrolls, and on a phone a bottom sheet with its buttons full width, the action on
 * top. It has no grab handle: it closes only by its buttons or Escape. */
function AlertDialogContent({
  className,
  children,
  size = "sm",
  onCloseAutoFocus,
  onOpenAutoFocus,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content> & {
  size?: "sm" | "md"
}) {
  const returnFocus = useReturnFocus(onCloseAutoFocus, onOpenAutoFocus)
  const exit = useExitGhost<HTMLDivElement>()
  useKeyboardInset()
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        ref={exit}
        data-slot="alert-dialog-content"
        data-size={size}
        className={cn(
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className
        )}
        {...props}
        onOpenAutoFocus={returnFocus.onOpenAutoFocus}
        onCloseAutoFocus={returnFocus.onCloseAutoFocus}
      >
        <div data-slot="dialog-body">{children}</div>
      </AlertDialogPrimitive.Content>
    </AlertDialogPortal>
  )
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div data-slot="alert-dialog-footer" className={className} {...props} />
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return <AlertDialogPrimitive.Title data-slot="alert-dialog-title" className={className} {...props} />
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return <AlertDialogPrimitive.Description data-slot="alert-dialog-description" className={className} {...props} />
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
  AlertDialogTitle,
}
