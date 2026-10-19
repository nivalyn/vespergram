import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { useApp } from '../../state/AppContext'
import { cn } from '../../lib/cn'

export function Toasts() {
  const { notices, dismissNotice } = useApp()

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2"
      aria-live="polite"
      aria-atomic="false"
    >
      {notices.map((notice) => {
        const Icon =
          notice.kind === 'error' ? AlertTriangle : notice.kind === 'success' ? CheckCircle2 : Info
        return (
          <div
            key={notice.id}
            className={cn(
              'pointer-events-auto animate-fade-up flex items-start gap-3 rounded-xl border bg-ink-850/95 px-3.5 py-3 shadow-panel',
              notice.kind === 'error' && 'border-pink-600/30',
              notice.kind === 'success' && 'border-violet-500/25',
              notice.kind === 'info' && 'border-white/10',
            )}
          >
            <Icon
              size={16}
              className={cn(
                'mt-0.5 shrink-0',
                notice.kind === 'error' && 'text-pink-400',
                notice.kind === 'success' && 'text-violet-300',
                notice.kind === 'info' && 'text-sun-500',
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium text-fog-100">{notice.title}</p>
              {notice.message ? (
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-fog-400">{notice.message}</p>
              ) : null}
            </div>
            <button
              type="button"
              className="icon-btn -mr-1.5 -mt-1.5 h-7 w-7"
              onClick={() => dismissNotice(notice.id)}
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
