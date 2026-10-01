import { useEffect, useId, useRef, type ReactNode } from 'react'
import './Modal.css'

export const Modal = ({ open, title, onClose, children, footer, busy = false }: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  busy?: boolean
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = dialogRef.current
    if (!open || !dialog) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = overflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [open])

  if (!open) return null
  return (
      <dialog
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy}
        onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}
        onClick={(event) => {
          if (busy || event.target !== event.currentTarget) return
          const rect = event.currentTarget.getBoundingClientRect()
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose()
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return
          const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]'))
          const first = items[0]
          const last = items[items.length - 1]
          if (!first || !last) { event.preventDefault(); return }
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
        }}
      >
        <header className="modal__bar">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="닫기" disabled={busy}>×</button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__foot">{footer}</footer>}
      </dialog>
  )
}
