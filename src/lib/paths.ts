import type { MediaKind } from '../types'

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  bmp: 'image/bmp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  m4v: 'video/x-m4v',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/opus',
  pdf: 'application/pdf',
  txt: 'text/plain',
  zip: 'application/zip',
}

export function fileExtension(path: string): string {
  const clean = path.split(/[?#]/)[0] ?? path
  const basename = clean.split('/').pop() ?? ''
  const dot = basename.lastIndexOf('.')
  return dot > 0 ? basename.slice(dot + 1).toLowerCase() : ''
}

export function mimeForPath(path: string): string | null {
  return MIME_BY_EXTENSION[fileExtension(path)] ?? null
}

export function kindFromMime(mime: string | null): MediaKind {
  if (!mime) return 'unknown'
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'file'
}

/** Safe path for display and for File System Access lookups. Rejects traversal. */
export function normalizeArchivePath(input: unknown): string | null {
  if (typeof input !== 'string') return null
  let value = input
  try {
    value = decodeURIComponent(value)
  } catch {
    // Keep the original if it contains a stray percent sign.
  }
  value = value.trim().replace(/\\/g, '/')
  if (!value || /^[a-z]+:\/\//i.test(value)) return null
  value = value.split(/[?#]/)[0] ?? value
  value = value.replace(/^\.\/+/, '').replace(/^\/+/, '')

  const parts = value.split('/').filter(Boolean)
  if (!parts.length) return null
  if (parts.some((part) => part === '..' || part === '.' || part === '__MACOSX')) return null
  if (parts.some((part) => part.startsWith('._'))) return null
  if (parts.some((part) => part.includes('\u0000'))) return null

  return parts.join('/')
}

export function pathKey(path: string): string {
  return path.normalize('NFC').toLocaleLowerCase('en')
}

export function basename(path: string): string {
  return path.split('/').pop() ?? path
}

export function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot > 0 ? filename.slice(0, dot) : filename
}

export function isExternalUri(uri: string): boolean {
  return /^(?:https?|ftp):\/\//i.test(uri.trim())
}

export interface FileIndexEntry {
  path: string
  file: File
}

/** Index for resolving relative media URIs without ever escaping the archive root. */
export class ArchiveFileIndex {
  private readonly byPath = new Map<string, FileIndexEntry>()
  private readonly byBasename = new Map<string, FileIndexEntry[]>()

  constructor(entries: FileIndexEntry[]) {
    for (const entry of entries) {
      const normalized = normalizeArchivePath(entry.path)
      if (!normalized) continue
      const key = pathKey(normalized)
      this.byPath.set(key, { path: normalized, file: entry.file })
      const base = pathKey(basename(normalized))
      const bucket = this.byBasename.get(base)
      if (bucket) bucket.push({ path: normalized, file: entry.file })
      else this.byBasename.set(base, [{ path: normalized, file: entry.file }])
    }
  }

  get size(): number {
    return this.byPath.size
  }

  listPaths(): string[] {
    return Array.from(this.byPath.values(), (entry) => entry.path)
  }

  resolve(uri: string, threadFolder?: string): FileIndexEntry | null {
    const normalized = normalizeArchivePath(uri)
    if (!normalized) return null

    const candidates = new Set<string>([normalized])
    const withoutActivity = normalized.replace(/^your_instagram_activity\//i, '')
    candidates.add(withoutActivity)
    const messagesIndex = normalized.indexOf('messages/')
    if (messagesIndex >= 0) {
      candidates.add(normalized.slice(messagesIndex + 'messages/'.length))
      const afterActivity = withoutActivity.indexOf('messages/')
      if (afterActivity >= 0) {
        candidates.add(withoutActivity.slice(afterActivity + 'messages/'.length))
      }
    }
    if (threadFolder) {
      const folder = normalizeArchivePath(threadFolder)
      if (folder) candidates.add(`${folder}/${normalized.replace(/^\.?\//, '')}`)
    }

    for (const candidate of candidates) {
      const match = this.byPath.get(pathKey(candidate))
      if (match) return match
    }

    // Last-resort basename matching only when unambiguous. This helps people
    // who selected loose JSON + media files without directory paths.
    const bucket = this.byBasename.get(pathKey(basename(normalized)))
    if (bucket?.length === 1) return bucket[0] ?? null
    return null
  }
}
