"use client"

import * as React from "react"

/** A copy of the dialog's last frame, marked closed so the stylesheet plays its exit, inert and hidden from assistive
 * technology, without ids that would clash with the page. */
function ghostOf(node: HTMLElement) {
  const copy = node.cloneNode(true) as HTMLElement
  copy.dataset.state = "closed"
  copy.setAttribute("aria-hidden", "true")
  copy.inert = true
  copy.style.pointerEvents = "none"
  for (const element of [copy, ...copy.querySelectorAll("[id]")]) element.removeAttribute("id")
  return copy
}

/** Most dialogs here are removed by their parent while open (`{editing && <Dialog open>…}`), so Radix never sees them close
 * and they vanished in one frame. This lets such a dialog, and its overlay, still leave on screen: when the content is
 * removed while open, a copy of its last frame plays the exit and then goes. A dialog closed through `open` has already
 * played its exit (it is `closed` when removed) and gets no copy. Purely visual: focus, state and the page are untouched.
 * A `ref` passed to the content replaces this one, and that dialog simply vanishes as before. */
export function useExitGhost<T extends HTMLElement>() {
  const node = React.useRef<T>(null)
  React.useLayoutEffect(() => () => {
    const content = node.current
    if (!content || content.dataset.state !== "open" || !content.isConnected) return
    const overlay = content.previousElementSibling instanceof HTMLElement && content.previousElementSibling.dataset.slot?.endsWith("overlay") ? content.previousElementSibling : null
    const copies = [overlay, content].filter(element => element !== null).map(ghostOf)
    // Development mounts every effect twice: a dialog still on the page after this commit was not really removed.
    queueMicrotask(() => {
      if (content.isConnected) return
      for (const copy of copies) document.body.appendChild(copy)
      const done = () => copies.forEach(copy => copy.remove())
      copies.at(-1)?.addEventListener("animationend", done, { once: true })
      setTimeout(done, 400)
    })
  }, [])
  return node
}
