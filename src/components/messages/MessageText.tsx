import { useMemo, type ReactNode } from 'react'
import { highlightRanges } from '../../lib/search'

const URL_RE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi

function trimTrailingPunctuation(url: string): { href: string; trailing: string } {
  let end = url.length
  while (end > 0 && /[.,;:!?)\]}'"]/.test(url[end - 1] ?? '')) {
    if (url[end - 1] === ')' && url.slice(0, end).includes('(')) break
    end--
  }
  return { href: url.slice(0, end), trailing: url.slice(end) }
}

function linkify(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  URL_RE.lastIndex = 0
  while ((match = URL_RE.exec(text))) {
    const raw = match[0]
    if (!raw) continue
    if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('www.')) {
      if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index))
      const { href, trailing } = trimTrailingPunctuation(raw)
      const safeHref = href.startsWith('www.') ? `https://${href}` : href
      nodes.push(
        <a
          key={`${keyPrefix}-link-${match.index}`}
          href={safeHref}
          target="_blank"
          rel="noreferrer noopener nofollow"
          className="link-in-text"
          onClick={(event) => event.stopPropagation()}
        >
          {href}
        </a>,
      )
      if (trailing) nodes.push(trailing)
      lastIndex = match.index + raw.length
    }
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes.length ? nodes : [text]
}

export function MessageText({
  text,
  query,
  className,
  preserveWhitespace = true,
  linkify: shouldLinkify = true,
}: {
  text: string
  query?: string
  className?: string
  preserveWhitespace?: boolean
  linkify?: boolean
}) {
  const nodes = useMemo(() => {
    const renderSegment = (segment: string, keyPrefix: string): ReactNode[] =>
      shouldLinkify
        ? linkify(segment, keyPrefix)
        : [segment]
    const ranges = query ? highlightRanges(text, query) : []
    if (!ranges.length) {
      return renderSegment(text, 'plain').map((node, index) =>
        typeof node === 'string' ? <span key={`t-${index}`}>{node}</span> : node,
      )
    }

    const output: ReactNode[] = []
    let cursor = 0
    ranges.forEach(([start, end], rangeIndex) => {
      if (start > cursor) {
        for (const [index, node] of renderSegment(
          text.slice(cursor, start),
          `pre-${rangeIndex}`,
        ).entries()) {
          output.push(
            typeof node === 'string' ? (
              <span key={`pre-${rangeIndex}-${index}`}>{node}</span>
            ) : (
              node
            ),
          )
        }
      }
      output.push(
        <mark key={`hit-${rangeIndex}`} className="search-hit">
          {text.slice(start, end)}
        </mark>,
      )
      cursor = end
    })
    if (cursor < text.length) {
      for (const [index, node] of renderSegment(text.slice(cursor), 'post').entries()) {
        output.push(
          typeof node === 'string' ? <span key={`post-${index}`}>{node}</span> : node,
        )
      }
    }
    return output
  }, [text, query, shouldLinkify])

  const emojiOnly =
    text.length <= 28 &&
    /\p{Extended_Pictographic}/u.test(text) &&
    /^[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Emoji_Component}\u200d\ufe0f\s]+$/u.test(text)

  return (
    <span
      className={[
        'formatted-text message-text',
        preserveWhitespace ? '' : 'whitespace-normal',
        emojiOnly ? 'emoji-only' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {nodes}
    </span>
  )
}
