import { useId } from 'react'
import { cn } from '../../lib/cn'
import { hashString } from '../../lib/hash'

const GRADIENTS = [
  'linear-gradient(135deg, #8B5CF6 0%, #FF3CAC 100%)',
  'linear-gradient(135deg, #6D28D9 0%, #A855F7 100%)',
  'linear-gradient(135deg, #FF3CAC 0%, #8B5CF6 100%)',
  'linear-gradient(135deg, #7C3AED 0%, #FFD60A 135%)',
  'linear-gradient(135deg, #A855F7 0%, #F72585 100%)',
  'linear-gradient(135deg, #4C1D95 0%, #A855F7 100%)',
]

export function initialsFor(name: string): string {
  const cleaned = name.replace(/[@_]+/g, ' ').trim()
  if (!cleaned) return '?'
  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length === 1) {
    const word = words[0] ?? ''
    const characters = Array.from(word)
    return (characters.slice(0, 2).join('') || '?').toLocaleUpperCase()
  }
  return `${Array.from(words[0] ?? '')[0] ?? ''}${Array.from(words[1] ?? '')[0] ?? ''}`.toLocaleUpperCase()
}

export function Avatar({
  name,
  size = 46,
  isGroup = false,
  className,
  ring = false,
}: {
  name: string
  size?: number
  isGroup?: boolean
  className?: string
  ring?: boolean
}) {
  const seed = hashString(name)
  const gradient = GRADIENTS[Number.parseInt(seed.slice(-2), 36) % GRADIENTS.length] ?? GRADIENTS[0]
  const initials = initialsFor(name)
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-display font-semibold text-white',
        ring && 'ring-2 ring-black/70',
        className,
      )}
      style={{
        width: size,
        height: size,
        background: gradient,
        fontSize: Math.max(10, Math.round(size * (initials.length > 1 ? 0.31 : 0.38))),
        letterSpacing: '-0.02em',
        textShadow: '0 1px 8px rgba(0,0,0,.28)',
      }}
      aria-hidden="true"
    >
      <span className="translate-y-[-0.5px]">{initials}</span>
      {isGroup ? (
        <span
          className="absolute bottom-[9%] right-[9%] rounded-full border border-black/40 bg-black/55"
          style={{ width: Math.max(7, size * 0.2), height: Math.max(7, size * 0.2) }}
        />
      ) : null}
    </span>
  )
}

export function VesperMark({ size = 32 }: { size?: number }) {
  const gradientId = `vesper-mark-${useId().replace(/:/g, '')}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="8" y1="6" x2="58" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A78BFA" />
          <stop offset="0.58" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#FF3CAC" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="17" fill="#0A0A0E" />
      <rect x="0.5" y="0.5" width="63" height="63" rx="16.5" stroke="rgba(255,255,255,0.09)" />
      <path
        d="M15 18.5C15 15.46 17.46 13 20.5 13h23C46.54 13 49 15.46 49 18.5v18c0 3.04-2.46 5.5-5.5 5.5H31.2l-9.4 8.1c-1.1.95-2.8.17-2.8-1.28V42.9C16.3 42.24 15 40.02 15 37.5v-19Z"
        fill={`url(#${gradientId})`}
      />
      <circle cx="26" cy="28" r="2.7" fill="#07070A" />
      <circle cx="32.5" cy="28" r="2.7" fill="#07070A" />
      <circle cx="39" cy="28" r="2.7" fill="#FFD60A" />
    </svg>
  )
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <VesperMark size={compact ? 30 : 34} />
      {compact ? null : (
        <div className="flex flex-col leading-none">
          <span className="font-display text-[19px] font-semibold tracking-[-0.035em] text-fog-100">
            vesper<span className="text-sun-500">.</span>
          </span>
          <span className="mt-1 text-[8.5px] font-medium uppercase tracking-[0.22em] text-fog-500">
            message archive
          </span>
        </div>
      )}
    </div>
  )
}
