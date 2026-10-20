"use client"

import * as React from "react"

/** Where focus goes back to: the element focused when the dialog opened, or, when that was a menu item (it unmounts with its
 * menu), the button that opened the menu, which Radix names in the menu's `aria-labelledby`. */
function openerOf(active: Element | null) {
  const menu = active?.closest?.("[role=menu]")
  const trigger = menu && document.getElementById(menu.getAttribute("aria-labelledby") ?? "")
  return trigger ?? active
}

/** A dialog with fields opens on its first editable field (or the one marked `data-autofocus`), not on the ⓘ beside its title; a dialog of choices keeps Radix's first
 * focusable element. A dialog that sets its own focus prevents this. */
function focusFirstField(event: Event) {
  const dialog = event.currentTarget as HTMLElement | null
  // A form can name the field it is really about (`data-autofocus`), ahead of a setting that happens to come first.
  const field = dialog?.querySelector?.<HTMLElement>("[data-autofocus]:not([disabled])") ?? dialog?.querySelector?.<HTMLElement>(":is(input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea):not([disabled]):not([readonly])")
  if (!field) return
  event.preventDefault()
  field.focus()
}

/** Focus goes back where it was when the dialog opened. Most dialogs here open from state, without a Radix trigger to return to,
 * and some stay mounted while closed (ConfirmDialog, the Recurring delete question), so the opener is read each time the dialog
 * opens (`onOpenAutoFocus`, before focus moves in), not once when the component first renders. */
export function useReturnFocus(onCloseAutoFocus?: (event: Event) => void, onOpenAutoFocus?: (event: Event) => void) {
  const [initial] = React.useState(() => typeof document === "undefined" ? null : openerOf(document.activeElement))
  const opener = React.useRef(initial)
  return {
    onOpenAutoFocus: (event: Event) => {
      opener.current = openerOf(document.activeElement)
      onOpenAutoFocus?.(event)
      if (!event.defaultPrevented) focusFirstField(event)
    },
    onCloseAutoFocus: (event: Event) => {
      onCloseAutoFocus?.(event)
      if (event.defaultPrevented) return
      event.preventDefault()
      const target = opener.current
      if (target instanceof HTMLElement && target !== document.body && target.isConnected) target.focus({ preventScroll: true })
    },
  }
}
