"use client"

import * as React from "react"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useExitGhost } from "@/components/ui/exit-ghost"
import { useReturnFocus } from "@/components/ui/return-focus"
import { useKeyboardInset, useSheetDrag } from "@/components/ui/dialog-sheet"
import { useUiLabel } from "@/components/ui/ui-label"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

/** The dialog width scale (DLG-025): `sm` questions and short forms 420px, `md` forms 560px, `lg` several editors or
 * details 760px, `xl` tables and side-by-side editors 960px; `full` covers the screen (steppers, phone pickers) and
 * `palette` is the command menu. On a phone every size but `full` and `palette` is a bottom sheet. */
type DialogSize = "sm" | "md" | "lg" | "xl" | "full" | "palette"

/** The grab handle at the top of a phone sheet; pulling it down closes the dialog. Hidden on wider screens. */
function SheetHandle() {
  const drag = useSheetDrag()
  return <div data-slot="dialog-handle" aria-hidden="true" {...drag}><span /></div>
}

/** One shell for every dialog: the surface with its size, a body that scrolls on its own between a fixed Close and a
 * footer that stays in reach (`FormFooter`, `DialogFooter`), and on a phone a bottom sheet with a grab handle that rises
 * above the keyboard. Styles: app/styles/dialogs.css. */
function DialogContent({
  className,
  children,
  showCloseButton = true,
  size = "md",
  onCloseAutoFocus,
  onOpenAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  size?: DialogSize
}) {
  const returnFocus = useReturnFocus(onCloseAutoFocus, onOpenAutoFocus)
  const exit = useExitGhost<HTMLDivElement>()
  const label = useUiLabel()
  useKeyboardInset()
  const sheet = size !== "full" && size !== "palette"
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={exit}
        data-slot="dialog-content"
        data-size={size}
        className={cn(
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className
        )}
        {...props}
        onOpenAutoFocus={returnFocus.onOpenAutoFocus}
        onCloseAutoFocus={returnFocus.onCloseAutoFocus}
      >
        {sheet && <SheetHandle />}
        <div data-slot="dialog-body">{children}</div>
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close">
            <XIcon aria-hidden="true" />
            <span className="sr-only">{label("Close")}</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={className} {...props} />
}

/** A dialog's closing row of buttons. Like `FormFooter`, it stays at the bottom of the dialog while the body scrolls. */
function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  const label = useUiLabel()
  return (
    <div data-slot="dialog-footer" className={className} {...props}>
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">{label("Close")}</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={className}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={className}
      {...props}
    />
  )
}

export type { DialogSize }

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
