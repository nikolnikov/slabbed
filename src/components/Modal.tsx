import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { CloseIcon } from '../icons'

type ModalProps = {
  /** Shown in the header (truncated with an ellipsis if too long), and the dialog's accessible name. */
  title: string
  /** Shown before the title in the header, e.g. a grade badge. */
  titleBadge?: ReactNode
  onClose: () => void
  children: ReactNode
}

export function Modal({ title, titleBadge, onClose, children }: ModalProps) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__panel" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="modal__header">
          <h2 className="modal__title">
            {titleBadge}
            <span className="modal__title-text">{title}</span>
          </h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  )
}
