import type {
  ArchiveRecord,
  Attachment,
  Conversation,
  ImportSummary,
  MediaKind,
  Message,
} from '../../types'
import { randomId } from '../hash'
import { kindFromMime, mimeForPath } from '../paths'
import { deleteArchive, saveImportedArchive } from '../db/database'
import { makeFileIndex, type ArchiveSource } from '../fs/archiveSource'
import { parseInstagramArchive, type ParseArchiveResult } from '../instagram/parse'
import type { ImportWorkerResponse } from '../../workers/import.worker'
import { isImportJsonPath } from './jsonFiles'
import type { MediaSource } from '../media/mediaResolver'

export interface ImportProgress {
  phase: 'reading' | 'parsing' | 'resolving' | 'saving' | 'opening'
  done: number
  total: number
  label: string
}

export interface ImportResult {
  archive: ArchiveRecord
  conversations: Conversation[]
  messages: Message[]
  mediaSource: MediaSource
  summary: ImportSummary
}

function parseInMainThread(
  files: { path: string; text: string }[],
  archiveId: string,
): ParseArchiveResult {
  return parseInstagramArchive(files, { archiveId })
}

async function parseWithWorker(
  source: ArchiveSource,
  archiveId: string,
  onProgress: (progress: ImportProgress) => void,
): Promise<ParseArchiveResult> {
  const jsonFiles = source.files.filter((entry) => isImportJsonPath(entry.path))
  if (!jsonFiles.length) {
    throw new Error('No Instagram message JSON files were found in this selection.')
  }

  if (typeof Worker === 'undefined') {
    return parseFallback(jsonFiles, archiveId, onProgress)
  }

  return new Promise<ParseArchiveResult>((resolve, reject) => {
    const worker = new Worker(new URL('../../workers/import.worker.ts', import.meta.url), {
      type: 'module',
    })
    let settled = false
    const finish = () => {
      if (!settled) {
        settled = true
        worker.terminate()
      }
    }

    worker.onmessage = (event: MessageEvent<ImportWorkerResponse>) => {
      const response = event.data
      if (response.type === 'progress') {
        onProgress({
          phase: response.phase,
          done: response.done,
          total: response.total,
          label:
            response.phase === 'reading'
              ? `Reading JSON ${response.done.toLocaleString()} / ${response.total.toLocaleString()}`
              : 'Parsing, merging and ordering messages',
        })
        return
      }
      if (response.type === 'error') {
        finish()
        reject(new Error(response.message))
        return
      }
      finish()
      resolve(response.result)
    }

    worker.onerror = (event) => {
      finish()
      // Some browsers/workers can fail to start. Fall back to parsing on the
      // main thread rather than losing the import.
      void parseFallback(jsonFiles, archiveId, onProgress).then(resolve, reject)
      void event
    }

    worker.postMessage({ type: 'parse', archiveId, files: jsonFiles })
  })
}

async function parseFallback(
  jsonFiles: { path: string; file: File }[],
  archiveId: string,
  onProgress: (progress: ImportProgress) => void,
): Promise<ParseArchiveResult> {
  const inputs: { path: string; text: string }[] = []
  for (let index = 0; index < jsonFiles.length; index++) {
    const entry = jsonFiles[index]
    if (!entry) continue
    try {
      inputs.push({ path: entry.path, text: await entry.file.text() })
    } catch {
      inputs.push({ path: entry.path, text: '' })
    }
    onProgress({
      phase: 'reading',
      done: index + 1,
      total: jsonFiles.length,
      label: `Reading JSON ${(index + 1).toLocaleString()} / ${jsonFiles.length.toLocaleString()}`,
    })
  }
  onProgress({
    phase: 'parsing',
    done: jsonFiles.length,
    total: jsonFiles.length,
    label: 'Parsing, merging and ordering messages',
  })
  return parseInMainThread(inputs, archiveId)
}

function refineKind(kind: MediaKind, mime: string | null, path: string): MediaKind {
  if (kind === 'unknown' || kind === 'file') {
    return kindFromMime(mime) === 'unknown' ? kind : kindFromMime(mime)
  }
  if (kind === 'image' && mime?.startsWith('video/')) return 'video'
  if (kind === 'gif' && mime?.startsWith('video/')) return 'video'
  if ((kind === 'voice' || kind === 'audio') && !mime) {
    // Instagram voice notes are commonly mp4/m4a files.
    return path.endsWith('.ogg') || path.endsWith('.mp3') ? 'audio' : 'voice'
  }
  return kind
}

function resolveMedia(
  conversation: Conversation,
  message: Message,
  index: ReturnType<typeof makeFileIndex>,
): number {
  let matched = 0
  for (const attachment of message.attachments) {
    if (attachment.external) continue
    const uri = attachment.resolvedPath ?? attachment.path ?? attachment.uri
    const entry = uri ? index.resolve(uri, conversation.threadPath) : null
    if (!entry) continue
    attachment.resolvedPath = entry.path
    attachment.available = true
    attachment.sizeBytes = entry.file.size
    const mime = attachment.mimeType || entry.file.type || mimeForPath(entry.path)
    attachment.mimeType = mime || null
    attachment.kind = refineKind(attachment.kind, attachment.mimeType, entry.path)
    matched++
  }
  return matched
}

export async function importArchiveSource(
  source: ArchiveSource,
  onProgress: (progress: ImportProgress) => void,
): Promise<ImportResult> {
  const archiveId = randomId('a_')
  const fileIndex = makeFileIndex(source.files)
  const result = await parseWithWorker(source, archiveId, onProgress)

  if (!result.conversations.length) {
    throw new Error(
      'No conversations were found. Select the extracted Instagram archive folder (or its messages files) and try again.',
    )
  }

  onProgress({
    phase: 'resolving',
    done: 0,
    total: result.conversations.length,
    label: 'Matching media files',
  })

  const conversationById = new Map(result.conversations.map((conversation) => [conversation.id, conversation]))
  let matchedMedia = 0
  let processed = 0
  for (const message of result.messages) {
    const conversation = conversationById.get(message.conversationId)
    if (conversation) matchedMedia += resolveMedia(conversation, message, fileIndex)
    processed++
    if (processed % 5_000 === 0) {
      onProgress({
        phase: 'resolving',
        done: processed,
        total: result.messages.length,
        label: `Matching media · ${processed.toLocaleString()} messages`,
      })
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
  }

  const firstTimestamps = result.conversations
    .map((conversation) => conversation.firstTimestampMs)
    .filter((value): value is number => value !== null)
  const lastTimestamps = result.conversations
    .map((conversation) => conversation.lastTimestampMs)
    .filter((value): value is number => value !== null)

  const now = Date.now()
  const rootLabel = source.rootLabel || 'Instagram archive'
  const ownerLabel = result.ownerUsername ? `@${result.ownerUsername}` : null
  const archive: ArchiveRecord = {
    id: archiveId,
    name: ownerLabel ? `${ownerLabel} · archive` : rootLabel,
    rootLabel,
    sourceKind: source.kind,
    importedAt: now,
    updatedAt: now,
    ownerUsername: result.ownerUsername,
    ownerSource: result.ownerSource,
    ownerConfidence: result.ownerConfidence,
    conversationCount: result.conversations.length,
    messageCount: result.messages.length,
    mediaCount: result.mediaReferenceCount,
    mediaMatchedCount: matchedMedia,
    sourceFileCount: result.sourceFileCount,
    firstTimestampMs: firstTimestamps.length ? Math.min(...firstTimestamps) : null,
    lastTimestampMs: lastTimestamps.length ? Math.max(...lastTimestamps) : null,
    warnings: result.warnings,
    parseDurationMs: result.durationMs,
    directoryHandle: source.directoryHandle,
    hasLinkedMedia: Boolean(source.directoryHandle) && matchedMedia > 0,
  }

  onProgress({
    phase: 'saving',
    done: 0,
    total: result.messages.length,
    label: 'Writing local index',
  })

  try {
    await saveImportedArchive(archive, result.conversations, result.messages, (progress) => {
      if (progress.stage === 'messages') {
        onProgress({
          phase: 'saving',
          done: progress.done,
          total: progress.total,
          label: `Writing local index · ${progress.done.toLocaleString()} / ${progress.total.toLocaleString()}`,
        })
      } else if (progress.stage === 'conversations') {
        onProgress({
          phase: 'saving',
          done: 0,
          total: result.messages.length,
          label: 'Creating conversation index',
        })
      }
    })
  } catch (error) {
    // Avoid leaving a half-written archive behind.
    try {
      await deleteArchive(archiveId)
    } catch {
      // Ignore cleanup failures; the original error is more useful.
    }
    throw new Error(
      `Could not save the archive locally. The browser may be out of storage. ${
        error instanceof Error ? error.message : ''
      }`.trim(),
    )
  }

  onProgress({
    phase: 'opening',
    done: result.messages.length,
    total: result.messages.length,
    label: 'Opening your oldest conversation',
  })

  const mediaSource: MediaSource = source.directoryHandle
    ? { type: 'handle', root: source.directoryHandle }
    : { type: 'session', index: fileIndex }

  return {
    archive,
    conversations: result.conversations,
    messages: result.messages,
    mediaSource,
    summary: {
      archive,
      conversationCount: result.conversations.length,
      messageCount: result.messages.length,
      mediaReferenceCount: result.mediaReferenceCount,
      mediaMatchedCount: matchedMedia,
      duplicateCount: result.duplicateCount,
      warnings: result.warnings,
      durationMs: result.durationMs,
    },
  }
}

/** Used by tests and the import summary without spinning up a worker. */
export function resolveAttachmentsForTest(messages: Message[]): Attachment[] {
  return messages.flatMap((message) => message.attachments)
}
