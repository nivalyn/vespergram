import { ExternalLink, Link2, PlaySquare } from 'lucide-react'
import type { Attachment, ShareInfo } from '../../types'
import type { MediaSource } from '../../lib/media/mediaResolver'
import { useMediaFile } from '../../hooks/useMediaFile'
import { cn } from '../../lib/cn'

function safeHref(link: string | null): string | null {
  if (!link) return null
  try {
    const parsed = new URL(link)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null
  } catch {
    return null
  }
}

function hostFor(link: string | null): string {
  if (!link) return ''
  try {
    return new URL(link).hostname.replace(/^www\./, '')
  } catch {
    return link
  }
}

export function ShareCard({
  share,
  thumbnail,
  source,
}: {
  share: ShareInfo
  thumbnail?: Attachment
  source: MediaSource
}) {
  const { url, status } = useMediaFile(thumbnail ?? null, source)
  const href = safeHref(share.link)
  const content = (
    <>
      {thumbnail && status === 'ready' && url ? (
        <img
          src={url}
          alt="Shared link preview"
          loading="lazy"
          className="h-[142px] w-full object-cover"
        />
      ) : (
        <div className="flex h-[92px] w-full items-center justify-center bg-[radial-gradient(circle_at_25%_20%,rgba(139,92,246,.26),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(255,60,172,.2),transparent_55%)]">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/25 text-violet-200">
            <PlaySquare size={19} />
          </span>
        </div>
      )}
      <div className="p-3">
        <p className="flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-violet-300">
          <Link2 size={10} />
          {share.originalOwner ? `Shared by @${share.originalOwner}` : 'Shared post'}
        </p>
        {share.text ? (
          <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-[12.5px] leading-relaxed text-fog-200">
            {share.text}
          </p>
        ) : null}
        <p className="mt-2 flex items-center gap-1 truncate text-[10.5px] text-fog-500">
          {hostFor(share.link)}
          <ExternalLink size={9} />
        </p>
      </div>
    </>
  )

  return (
    <div
      className={cn(
        'mt-1.5 w-[300px] max-w-full overflow-hidden rounded-xl border border-white/[0.08] bg-black/25',
        href ? 'transition-colors hover:border-violet-400/30' : '',
      )}
    >
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener nofollow"
          className="block"
          onClick={(event) => event.stopPropagation()}
        >
          {content}
        </a>
      ) : (
        content
      )}
    </div>
  )
}
