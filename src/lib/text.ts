/**
 * Instagram exports are frequently UTF-8 bytes decoded as Latin-1. This
 * faithfully reverses that process only when the result is valid UTF-8.
 */
const MOJIBAKE_HINT = /[ÃÂâðï][\u0080-\u00ff]|â[\u0080-\u00ff]{2}/

export function repairInstagramText(input: string): string {
  if (!input || !MOJIBAKE_HINT.test(input)) return input

  let current = input
  for (let pass = 0; pass < 2; pass++) {
    const codepoints = Array.from(current, (character) => character.codePointAt(0) ?? 0)
    if (codepoints.some((code) => code > 0xff)) break

    try {
      const bytes = Uint8Array.from(codepoints)
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      if (decoded === current || decoded.includes('\uFFFD')) break
      current = decoded
      if (!MOJIBAKE_HINT.test(current)) break
    } catch {
      break
    }
  }

  return current
}

/** Normalize without destroying original whitespace/line breaks. */
export function cleanText(value: unknown): string {
  if (typeof value !== 'string') return ''
  let text = repairInstagramText(value)
  // Strip NUL and other C0 controls except tab/newline/carriage return.
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  return text
}

export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLocaleLowerCase('en')
    .normalize('NFC')
}

export function isPlaceholderAttachmentText(text: string): boolean {
  return /^\s*[\p{L}\p{N}_.]+ sent an attachment\.?\s*$/u.test(text)
}

export function makeSnippet(text: string, start: number, matchLength: number, radius = 72): string {
  const chars = Array.from(text)
  const before = Array.from(text.slice(0, start)).length
  const matchChars = Array.from(text.slice(start, start + matchLength)).length
  const from = Math.max(0, before - radius)
  const to = Math.min(chars.length, before + matchChars + radius)
  const prefix = from > 0 ? '…' : ''
  const suffix = to < chars.length ? '…' : ''
  return `${prefix}${chars.slice(from, to).join('').replace(/\s+/g, ' ').trim()}${suffix}`
}
