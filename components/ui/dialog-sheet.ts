"use client"

import * as React from "react"

/** Below this width every dialog that is not full screen is a bottom sheet (app/styles/dialogs.css says the same). */
export const PHONE_SHEET_QUERY = "(max-width: 640px)"

let openSheets = 0

function setKeyboardInset() {
  const viewport = window.visualViewport
  if (!viewport) return
  const covered = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop))
  document.documentElement.style.setProperty("--keyboard-inset", `${covered}px`)
}

/** While any dialog is open, `--keyboard-inset` on the root is the height the on-screen keyboard covers. Phones keep the
 * layout viewport when the keyboard opens (iOS always, Chrome by default), so a sheet pinned to the bottom would sit
 * behind it with its fields and buttons; the stylesheet lifts the sheet by this much instead (DLG-028). */
export function useKeyboardInset() {
  React.useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    openSheets += 1
    setKeyboardInset()
    viewport.addEventListener("resize", setKeyboardInset)
    viewport.addEventListener("scroll", setKeyboardInset)
    return () => {
      viewport.removeEventListener("resize", setKeyboardInset)
      viewport.removeEventListener("scroll", setKeyboardInset)
      openSheets -= 1
      if (openSheets === 0) document.documentElement.style.removeProperty("--keyboard-inset")
    }
  }, [])
}

type Drag = { pointer: number; startY: number; startTime: number; sheet: HTMLElement; distance: number }

/** How far down, or how fast, a sheet must be pulled before letting go closes it. */
export function dragCloses(distance: number, milliseconds: number, height: number) {
  if (distance <= 0) return false
  if (distance >= Math.min(140, height / 4)) return true
  return distance > 24 && distance / Math.max(1, milliseconds) > 0.6
}

/** The grab handle of a phone sheet: pull it down to close the dialog. Letting go far enough presses Escape, so the dialog
 * closes exactly as it does from the keyboard: a busy dialog stays, and one with unsaved input asks first (DLG-003). The
 * sheet follows the finger and settles back when it does not close. Desktop dialogs ignore it. */
export function useSheetDrag() {
  const drag = React.useRef<Drag | null>(null)
  const release = (event: React.PointerEvent<HTMLElement>, cancelled: boolean) => {
    const current = drag.current
    if (!current || current.pointer !== event.pointerId) return
    drag.current = null
    const { sheet, distance } = current
    delete sheet.dataset.dragging
    if (cancelled || !dragCloses(distance, event.timeStamp - current.startTime, sheet.offsetHeight)) {
      sheet.style.removeProperty("transform")
      return
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }))
    // Still open (busy, or a discard question took over): settle back.
    requestAnimationFrame(() => { if (sheet.dataset.state === "open") sheet.style.removeProperty("transform") })
  }
  return {
    onPointerDown(event: React.PointerEvent<HTMLElement>) {
      if (event.button !== 0 || !window.matchMedia(PHONE_SHEET_QUERY).matches) return
      const sheet = event.currentTarget.closest<HTMLElement>("[data-slot=dialog-content]")
      if (!sheet) return
      event.currentTarget.setPointerCapture?.(event.pointerId)
      sheet.dataset.dragging = ""
      drag.current = { pointer: event.pointerId, startY: event.clientY, startTime: event.timeStamp, sheet, distance: 0 }
    },
    onPointerMove(event: React.PointerEvent<HTMLElement>) {
      const current = drag.current
      if (!current || current.pointer !== event.pointerId) return
      // Upwards the sheet only gives a little, so it feels attached rather than stuck.
      const moved = event.clientY - current.startY
      current.distance = moved
      const shown = moved > 0 ? moved : -Math.sqrt(-moved) * 2
      current.sheet.style.transform = `translateY(${shown}px)`
    },
    onPointerUp(event: React.PointerEvent<HTMLElement>) { release(event, false) },
    onPointerCancel(event: React.PointerEvent<HTMLElement>) { release(event, true) },
  }
}
