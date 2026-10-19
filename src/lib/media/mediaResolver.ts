import { normalizeArchivePath } from '../paths'
import type { Attachment } from '../../types'
import type { ArchiveFileIndex } from '../paths'
import { readLinkedFile } from '../fs/archiveSource'

export type MediaSource =
  | { type: 'handle'; root: FileSystemDirectoryHandle }
  | { type: 'session'; index: ArchiveFileIndex }
  | null

export async function resolveAttachmentFile(
  source: MediaSource,
  attachment: Attachment,
): Promise<File | null> {
  if (!source || attachment.external) return null
  const path = attachment.resolvedPath ?? attachment.path
  if (!path) return null

  if (source.type === 'handle') {
    return readLinkedFile(source.root, path)
  }

  const normalized = normalizeArchivePath(path)
  if (!normalized) return null
  return source.index.resolve(normalized)?.file ?? null
}

export function mediaKindLabel(kind: Attachment['kind']): string {
  switch (kind) {
    case 'image':
      return 'Photo'
    case 'video':
      return 'Video'
    case 'audio':
      return 'Audio'
    case 'voice':
      return 'Voice message'
    case 'sticker':
      return 'Sticker'
    case 'gif':
      return 'GIF'
    case 'file':
      return 'File'
    default:
      return 'Attachment'
  }
}
