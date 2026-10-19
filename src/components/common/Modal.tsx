import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'

export function Modal({
  open,
  onClose,
  children,
  title,
  description,
  size = 'md',
  closable = true,
  className,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  title?: string
  description?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  closable?: boolean
  className?: string
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const closableRef = useRef(closable)

  useEffect(() => {
    onCloseRef.current = onClose
    closableRef.current = closable
  }, [closable, onClose])

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement as HTMLElement | null
    const timer = window.setTimeout(() => {
      const panel = panelRef.current
      const target = panel?.querySelector<HTMLElement>(
        '[data-autofocus], input, textarea, button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      target?.focus()
    }, 30)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closableRef.current) {
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null)
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus?.()
    }
  }, [open])

  if (!open) return null

  const width = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
  }[size]

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/82 p-4 pt-[max(5vh,24px)] backdrop-blur-[3px] sm:p-6 sm:pt-[8vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && closable) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'animate-scale-in relative w-full overflow-hidden rounded-2xl border border-white/[0.09] bg-ink-850 shadow-panel',
          width,
          className,
        )}
      >
        {title || closable ? (
          <header className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-5 py-4 sm:px-6">
            <div className="min-w-0">
              {title ? (
                <h2 className="font-display text-[17px] font-semibold tracking-[-0.02em] text-fog-100">
                  {title}
                </h2>
              ) : null}
              {description ? (
                <p className="mt-1 text-[12px] leading-relaxed text-fog-400">{description}</p>
              ) : null}
            </div>
            {closable ? (
              <button type="button" className="icon-btn -mr-1 -mt-1" onClick={onClose} aria-label="Close dialog">
                <X size={18} />
              </button>
            ) : null}
          </header>
        ) : null}
        {children}
      </div>
    </div>,
    document.body,
  )
}
