import * as React from "react"

// Typed text is kept as written: no spellcheck underline and no autocorrect, like Input.
function Textarea(props: React.ComponentProps<"textarea">) {
  return <textarea spellCheck={false} autoCorrect="off" {...props} />
}

export { Textarea }
