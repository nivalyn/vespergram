import type {
  ArchiveInputFile,
  Attachment,
  Conversation,
  MediaKind,
  Message,
  MessageKind,
  Reaction,
  ShareInfo,
  TimestampSource,
  Participant,
} from '../../types'
import { hashString, randomId } from '../hash'
import { basename, isExternalUri, mimeForPath, normalizeArchivePath, stripExtension } from '../paths'
import { cleanText, isPlaceholderAttachmentText, normalizeForSearch, repairInstagramText } from '../text'

type RawRecord = Record<string, unknown>

interface RawFragment {
  path: string
  raw: RawRecord
  fileNumber: number
  isMessageRequest: boolean
}

interface OwnerDetection {
  username: string
  source: 'personal_information' | 'inferred' | 'unknown'
  confidence: 'high' | 'low'
}

export interface ParseArchiveResult {
  archiveId: string
  conversations: Conversation[]
  messages: Message[]
  ownerUsername: string
  ownerSource: OwnerDetection['source']
  ownerConfidence: OwnerDetection['confidence']
  warnings: string[]
  duplicateCount: number
  sourceFileCount: number
  mediaReferenceCount: number
  durationMs: number
  personalInfoFound: boolean
}

const MESSAGE_FILE_RE = /^message(?:[_-]?(\d+))?\.json$/i
const MAX_WARNINGS = 60

function isRecord(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function stableJson(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function parseJson(text: string): unknown {
  return JSON.parse(text) as unknown
}

function parseTimestamp(value: unknown, unit: 'ms' | 'seconds'): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value <= 0) return null
    const milliseconds = unit === 'seconds' ? value * 1000 : value
    return milliseconds <= 8.64e15 ? Math.round(milliseconds) : null
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (/^\d+(?:\.\d+)?$/.test(trimmed)) return parseTimestamp(Number(trimmed), unit)
    const parsed = Date.parse(trimmed)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }
  return null
}

function timestampFrom(raw: RawRecord): { ms: number | null; source: TimestampSource } {
  // `timestamp_ms` is milliseconds by definition. Do not guess units here:
  // small values are still valid millisecond timestamps in synthetic fixtures.
  const fromMs = parseTimestamp(raw.timestamp_ms, 'ms')
  if (fromMs !== null) return { ms: fromMs, source: 'timestamp_ms' }
  const fromSeconds = parseTimestamp(raw.timestamp, 'seconds')
  if (fromSeconds !== null) return { ms: fromSeconds, source: 'timestamp' }
  const fromCreated =
    parseTimestamp(raw.created_at, 'seconds') ?? parseTimestamp(raw.creation_timestamp, 'seconds')
  if (fromCreated !== null) return { ms: fromCreated, source: 'created_at' }
  return { ms: null, source: 'unknown' }
}

function threadPathFromRaw(raw: RawRecord, filePath: string): string {
  const rawThread = normalizeArchivePath(cleanText(raw.thread_path))
  let thread =
    rawThread ??
    normalizeArchivePath(
      filePath.split('/').slice(0, -1).join('/').replace(/^.*?messages\//, ''),
    ) ??
    `inbox/${stripExtension(basename(filePath))}`

  thread = thread.replace(/^your_instagram_activity\//i, '').replace(/\/+$/, '')
  const messagesAt = thread.indexOf('messages/')
  if (messagesAt >= 0) thread = thread.slice(messagesAt + 'messages/'.length)
  return thread
}

function fileNumberFromPath(path: string): number {
  const match = MESSAGE_FILE_RE.exec(basename(path))
  if (!match) return 1
  const parsed = Number(match[1] ?? 1)
  return Number.isFinite(parsed) ? parsed : 1
}

function ownerFromPersonalInfo(raw: unknown): string | null {
  if (!isRecord(raw)) return null
  const profileUsers = asArray(raw.profile_user)
  for (const item of profileUsers) {
    if (!isRecord(item)) continue
    const stringMap = isRecord(item.string_map_data) ? item.string_map_data : null
    const usernameEntry = stringMap && isRecord(stringMap.Username) ? stringMap.Username : null
    const username = usernameEntry ? cleanText(usernameEntry.value) : ''
    if (username) return username
  }

  // Defensive recursive search for the Username field in older export shapes.
  const queue: Array<{ value: unknown; depth: number }> = [{ value: raw, depth: 0 }]
  while (queue.length) {
    const next = queue.shift()
    if (!next) break
    const { value, depth } = next
    if (depth > 5) continue
    if (Array.isArray(value)) {
      for (const child of value) queue.push({ value: child, depth: depth + 1 })
      continue
    }
    if (!isRecord(value)) continue
    if (isRecord(value.Username) && typeof value.Username.value === 'string') {
      const username = cleanText(value.Username.value)
      if (username) return username
    }
    for (const child of Object.values(value)) {
      if (typeof child === 'object' && child !== null) queue.push({ value: child, depth: depth + 1 })
    }
  }
  return null
}

function usernameFromRootPath(files: ArchiveInputFile[]): string | null {
  for (const file of files.slice(0, 200)) {
    const match = /(?:^|\/)instagram-([a-zA-Z0-9._]+)-\d{4}-\d{2}-\d{2}/.exec(file.path)
    if (match?.[1]) return match[1]
  }
  return null
}

function folderFallbackName(threadPath: string): string {
  const folder = basename(threadPath)
  const withoutId = folder.replace(/_\d{8,}$/, '')
  const readable = withoutId.replace(/_and\d+others/gi, ' + others').replace(/_/g, ' ')
  return readable.trim() || 'Conversation'
}

function participantNamesFromRaw(raw: RawRecord): string[] {
  return asArray(raw.participants)
    .map((participant) =>
      isRecord(participant) ? cleanText(participant.name) : cleanText(participant),
    )
    .filter(Boolean)
}

function attachmentKind(
  grouping: 'photos' | 'videos' | 'audio_files' | 'gifs' | 'stickers' | 'files' | 'thumbnail',
  rawMime: string | null,
): MediaKind {
  switch (grouping) {
    case 'photos':
      return rawMime?.startsWith('video/') ? 'video' : 'image'
    case 'videos':
      return 'video'
    case 'audio_files':
      return 'voice'
    case 'gifs':
      return rawMime?.startsWith('video/') ? 'video' : 'gif'
    case 'stickers':
      return rawMime?.startsWith('video/') ? 'video' : 'sticker'
    case 'thumbnail':
      return 'image'
    case 'files':
      break
  }
  if (rawMime?.startsWith('image/')) return 'image'
  if (rawMime?.startsWith('video/')) return 'video'
  if (rawMime?.startsWith('audio/')) return 'audio'
  return 'file'
}

function parseAttachment(
  rawAttachment: unknown,
  grouping: Parameters<typeof attachmentKind>[0],
  messageId: string,
  index: number,
): Attachment | null {
  const item = isRecord(rawAttachment) ? rawAttachment : {}
  const uri = cleanText(item.uri) || cleanText(item.path)
  const external = isExternalUri(uri)
  const path = external ? null : normalizeArchivePath(uri)
  const resolvedName = path ? basename(path) : ''
  const fallbackName =
    grouping === 'audio_files'
      ? 'Voice message'
      : grouping === 'thumbnail'
        ? 'Shared link preview'
        : `Attachment ${index + 1}`
  const filename = resolvedName || fallbackName
  const rawMime = cleanText(item.mime_type).toLowerCase() || mimeForPath(path ?? filename)
  const kind = attachmentKind(grouping, rawMime)
  const created = parseTimestamp(item.creation_timestamp, 'seconds')

  if (!uri && grouping !== 'thumbnail') {
    // Preserve placeholders for unavailable media without inventing a file path.
    return {
      id: `${messageId}_att_${index}`,
      kind,
      uri: '',
      path: null,
      resolvedPath: null,
      filename: fallbackName,
      mimeType: rawMime,
      sizeBytes: null,
      creationTimestampMs: created,
      available: false,
      external: false,
      thumbnail: false,
    }
  }
  if (!uri) return null

  return {
    id: `${messageId}_att_${index}`,
    kind,
    uri,
    path,
    resolvedPath: null,
    filename,
    mimeType: rawMime,
    sizeBytes: null,
    creationTimestampMs: created,
    available: false,
    external,
    thumbnail: grouping === 'thumbnail',
  }
}

function parseReactions(raw: unknown): Reaction[] {
  return asArray(raw)
    .map((entry): Reaction | null => {
      if (!isRecord(entry)) return null
      const emoji = cleanText(entry.reaction)
      if (!emoji) return null
      return {
        emoji,
        actor: cleanText(entry.actor) || 'Unknown',
        timestampMs:
          parseTimestamp(entry.timestamp_ms, 'ms') ??
          parseTimestamp(entry.timestamp, 'seconds'),
      }
    })
    .filter((reaction): reaction is Reaction => reaction !== null)
}

function parseShare(raw: unknown): ShareInfo | null {
  if (!isRecord(raw)) return null
  const link = cleanText(raw.link) || null
  const text = cleanText(raw.share_text) || null
  const originalOwner = cleanText(raw.original_content_owner) || null
  if (!link && !text && !originalOwner) return null
  return { link, text, originalOwner }
}

export function messagePreview(message: Message, ownerUsername?: string): string {
  if (message.isUnsent) return ownerUsername && message.senderName === ownerUsername ? 'You unsent a message' : 'Message unsent'
  if (message.isDeleted) return 'Message deleted'
  const text = message.text.trim()
  if (text && !(message.attachments.length && isPlaceholderAttachmentText(text))) {
    return text.replace(/\s+/g, ' ')
  }
  const attachments = message.attachments
  if (attachments.some((attachment) => attachment.kind === 'voice')) return 'Voice message'
  if (attachments.some((attachment) => attachment.kind === 'video')) return 'Video'
  if (attachments.some((attachment) => attachment.kind === 'image' || attachment.kind === 'gif' || attachment.kind === 'sticker')) {
    return 'Photo'
  }
  if (attachments.length) return `Attachment · ${attachments[0]?.filename ?? ''}`.trim()
  if (message.share?.text) return message.share.text
  if (message.share?.link) return 'Shared a post'
  if (message.callDurationSeconds !== null) return message.isVideoCall ? 'Video call' : 'Audio call'
  return 'Message unavailable'
}

function normalizeMessage(
  raw: unknown,
  conversationId: string,
  archiveId: string,
  sourcePath: string,
  fileNumber: number,
  index: number,
  count: number,
): Message | null {
  if (!isRecord(raw)) return null
  const senderName = cleanText(raw.sender_name) || cleanText(raw.sender) || 'Unknown'
  const id = `m_${hashString(`${conversationId}|${sourcePath}|${index}`)}_${index}`
  const timestamp = timestampFrom(raw)
  const content = cleanText(raw.content) || cleanText(raw.text)
  const attachments: Attachment[] = []
  const groupings = ['photos', 'videos', 'audio_files', 'gifs', 'stickers', 'files'] as const
  let attachmentIndex = 0
  for (const grouping of groupings) {
    for (const item of asArray(raw[grouping])) {
      const attachment = parseAttachment(item, grouping, id, attachmentIndex++)
      if (attachment) attachments.push(attachment)
    }
  }

  const share = parseShare(raw.share)
  if (share && isRecord(raw.share) && isRecord(raw.share.thumbnail)) {
    const thumbnail = parseAttachment(raw.share.thumbnail, 'thumbnail', id, attachmentIndex++)
    if (thumbnail) attachments.push(thumbnail)
  }

  const reactions = parseReactions(raw.reactions)
  const callDurationRaw = raw.call_duration
  const callDuration =
    typeof callDurationRaw === 'number' && Number.isFinite(callDurationRaw) && callDurationRaw >= 0
      ? callDurationRaw
      : null
  const isUnsent = raw.is_unsent === true
  const isDeleted = raw.is_deleted === true || raw.is_deleted_by_sender === true
  const isGeoBlocked = raw.is_geoblocked_for_viewer === true
  const isVideoCall = raw.video_call === true || raw.is_video_call === true
  const hasUnavailableFlag =
    raw.is_unsent_image_by_messenger_kid_parent === true || raw.is_unavailable === true

  let kind: MessageKind = 'text'
  if (isUnsent) kind = 'unsent'
  else if (isDeleted) kind = 'unavailable'
  else if (callDuration !== null || raw.call_duration !== undefined) kind = 'call'
  else if (share && (share.link || share.text)) kind = 'share'
  else if (attachments.length && !content) kind = 'media'
  else if (attachments.length) kind = 'media'
  else if (!content && hasUnavailableFlag) kind = 'unavailable'
  else if (!content && reactions.length === 0) kind = 'unavailable'
  else if (!content) kind = 'unknown'

  const searchText = normalizeForSearch(
    [content, share?.text ?? '', share?.originalOwner ?? '', ...attachments.map((a) => a.filename)]
      .filter(Boolean)
      .join('\n'),
  )

  return {
    id,
    conversationId,
    archiveId,
    seq: 0,
    senderName,
    timestampMs: timestamp.ms,
    timestampSource: timestamp.source,
    text: content,
    searchText,
    kind,
    attachments,
    reactions,
    share,
    callDurationSeconds: callDuration,
    isVideoCall,
    isUnsent,
    isDeleted,
    isGeoBlocked,
    source: {
      file: sourcePath,
      fileNumber,
      index,
      // Instagram shards are newest-first; invert for ascending source order.
      order: count - 1 - index,
    },
  }
}

function dedupeAcrossShards(messages: Message[]): { messages: Message[]; removed: number } {
  const byFingerprint = new Map<string, Message[]>()
  for (const message of messages) {
    if (message.timestampMs === null) continue
    const fingerprint = [
      message.timestampMs,
      message.senderName,
      message.text,
      message.attachments.map((a) => a.uri).join(','),
      message.share?.link ?? '',
      message.callDurationSeconds ?? '',
    ].join('\u0001')
    const bucket = byFingerprint.get(fingerprint)
    if (bucket) bucket.push(message)
    else byFingerprint.set(fingerprint, [message])
  }

  const drop = new Set<string>()
  for (const bucket of byFingerprint.values()) {
    const files = new Set(bucket.map((message) => message.source.file))
    if (files.size < 2) continue
    const ordered = [...bucket].sort(
      (a, b) =>
        a.source.fileNumber - b.source.fileNumber ||
        a.source.index - b.source.index ||
        a.id.localeCompare(b.id),
    )
    for (const duplicate of ordered.slice(1)) drop.add(duplicate.id)
  }

  return { messages: messages.filter((message) => !drop.has(message.id)), removed: drop.size }
}

function compareMessages(a: Message, b: Message): number {
  const timeA = a.timestampMs ?? Number.NEGATIVE_INFINITY
  const timeB = b.timestampMs ?? Number.NEGATIVE_INFINITY
  if (timeA !== timeB) return timeA - timeB
  // Higher shard number = older. For equal timestamps, place older shard first.
  if (a.source.fileNumber !== b.source.fileNumber) return b.source.fileNumber - a.source.fileNumber
  if (a.source.order !== b.source.order) return a.source.order - b.source.order
  return a.id.localeCompare(b.id)
}

function inferOwner(
  fragments: RawFragment[],
  messagesByThread: Map<string, Message[]>,
  personalInfoOwner: string | null,
  rootUsername: string | null,
): OwnerDetection {
  if (personalInfoOwner) {
    return { username: personalInfoOwner, source: 'personal_information', confidence: 'high' }
  }
  if (rootUsername) {
    return { username: rootUsername, source: 'inferred', confidence: 'high' }
  }

  const threadCounts = new Map<string, { name: string; threads: Set<string>; messages: number }>()
  const noteName = (name: string, thread: string, messageCount = 0) => {
    if (!name) return
    const key = name.toLocaleLowerCase('en')
    const current = threadCounts.get(key)
    if (current) {
      current.threads.add(thread)
      current.messages += messageCount
    } else {
      threadCounts.set(key, { name, threads: new Set([thread]), messages: messageCount })
    }
  }

  const participantsByThread = new Map<string, string[]>()
  for (const fragment of fragments) {
    const names = participantNamesFromRaw(fragment.raw)
    const thread = threadPathFromRaw(fragment.raw, fragment.path)
    if (names.length) {
      const existing = participantsByThread.get(thread)
      if (!existing) participantsByThread.set(thread, names)
    }
  }
  for (const [thread, names] of participantsByThread) {
    for (const name of names) noteName(name, thread)
  }
  for (const [thread, messages] of messagesByThread) {
    for (const message of messages) noteName(message.senderName, thread, 1)
  }

  // Strong single-thread signal: DM folders are named after the other person.
  if (participantsByThread.size === 1) {
    const entry = participantsByThread.entries().next().value as [string, string[]] | undefined
    if (entry) {
      const [thread, participants] = entry
      if (participants.length === 2) {
        const folder = basename(thread).replace(/_\d{8,}$/, '').toLocaleLowerCase('en')
        const matches = participants.filter((name) =>
          folder.includes(name.toLocaleLowerCase('en').replace(/[^a-z0-9._]/g, '')),
        )
        if (matches.length === 1) {
          const other = participants.find((name) => name !== matches[0])
          if (other) return { username: other, source: 'inferred', confidence: 'low' }
        }
      }
    }
  }

  const ranked = Array.from(threadCounts.values()).sort(
    (a, b) => b.threads.size - a.threads.size || b.messages - a.messages || a.name.localeCompare(b.name),
  )
  const best = ranked[0]
  if (!best) return { username: '', source: 'unknown', confidence: 'low' }
  const confidence =
    ranked.length > 1 && ranked[1] && best.threads.size > ranked[1].threads.size ? 'high' : 'low'
  return { username: best.name, source: 'inferred', confidence }
}

function titleFor(options: {
  rawTitle: string
  participants: string[]
  ownerUsername: string
  threadPath: string
  isGroup: boolean
}): string {
  const { rawTitle, participants, ownerUsername, threadPath, isGroup } = options
  const others = participants.filter(
    (name) => name.toLocaleLowerCase('en') !== ownerUsername.toLocaleLowerCase('en'),
  )
  if (isGroup) {
    if (rawTitle) return rawTitle
    if (participants.length) return participants.join(', ')
    return folderFallbackName(threadPath)
  }
  if (rawTitle && (!ownerUsername || rawTitle.toLocaleLowerCase('en') !== ownerUsername.toLocaleLowerCase('en'))) {
    return rawTitle
  }
  return others[0] ?? participants[0] ?? rawTitle ?? folderFallbackName(threadPath)
}

export function parseInstagramArchive(
  files: ArchiveInputFile[],
  options: { archiveId?: string; onProgress?: (done: number, total: number) => void } = {},
): ParseArchiveResult {
  const start = performance.now()
  const archiveId = options.archiveId ?? randomId('a_')
  const warnings: string[] = []
  const warn = (message: string) => {
    if (warnings.length < MAX_WARNINGS) warnings.push(message)
  }

  const fragments: RawFragment[] = []
  let personalInfoRaw: unknown = null
  let sourceFileCount = 0
  let duplicateCount = 0

  for (const input of files) {
    const normalized = normalizeArchivePath(input.path)
    if (!normalized) continue
    const filename = basename(normalized)
    const isPersonalInfo =
      /(^|\/)personal_information\/personal_information\.json$/i.test(normalized) ||
      (/^personal_information\.json$/i.test(filename) && !/\/threads\//i.test(normalized))
    // Loose-file imports do not retain `messages/` in the path, so any
    // message_N.json file is a candidate; malformed/irrelevant JSON is reported.
    const isMessage = MESSAGE_FILE_RE.test(filename)

    if (!isPersonalInfo && !isMessage) continue
    sourceFileCount++

    try {
      const raw = parseJson(input.text)
      if (isPersonalInfo) {
        personalInfoRaw = raw
        continue
      }
      if (!isRecord(raw)) {
        warn(`${normalized}: expected a JSON object; file skipped.`)
        continue
      }
      fragments.push({
        path: normalized,
        raw,
        fileNumber: fileNumberFromPath(normalized),
        isMessageRequest: /(^|\/)message_requests\//i.test(`/${normalized}`),
      })
    } catch (error) {
      warn(`${normalized}: invalid JSON (${error instanceof Error ? error.message : 'parse error'}); file skipped.`)
    }
  }

  options.onProgress?.(sourceFileCount, sourceFileCount)

  const personalInfoOwner = ownerFromPersonalInfo(personalInfoRaw)
  const rootUsername = personalInfoOwner ? null : usernameFromRootPath(files)

  const fragmentsByThread = new Map<string, RawFragment[]>()
  for (const fragment of fragments) {
    const thread = threadPathFromRaw(fragment.raw, fragment.path)
    const bucket = fragmentsByThread.get(thread)
    if (bucket) bucket.push(fragment)
    else fragmentsByThread.set(thread, [fragment])
  }

  // First pass: normalized messages per thread.
  const messagesByThread = new Map<string, Message[]>()
  const metaByThread = new Map<
    string,
    {
      conversationId: string
      title: string
      participants: string[]
      sourceFiles: string[]
      isMessageRequest: boolean
      isStillParticipant: boolean
    }
  >()

  for (const [thread, threadFragments] of fragmentsByThread) {
    const sortedFragments = [...threadFragments].sort(
      (a, b) => a.fileNumber - b.fileNumber || a.path.localeCompare(b.path),
    )
    // Scope stable IDs to the archive so importing the same export twice, or
    // importing two exports that share a thread, never overwrites messages.
    const conversationId = `c_${hashString(`${archiveId}|${thread.toLocaleLowerCase('en')}`)}`
    const participantNames: string[] = []
    const sourceFiles: string[] = []
    let title = ''
    let isStillParticipant = true
    let isMessageRequest = false
    const messages: Message[] = []

    for (const fragment of sortedFragments) {
      sourceFiles.push(fragment.path)
      isMessageRequest ||= fragment.isMessageRequest
      if (fragment.raw.is_still_participant === false) isStillParticipant = false
      if (!title) title = cleanText(fragment.raw.title)
      for (const name of participantNamesFromRaw(fragment.raw)) {
        if (!participantNames.includes(name)) participantNames.push(name)
      }
      const rawMessages = asArray(fragment.raw.messages)
      rawMessages.forEach((rawMessage, index) => {
        const normalized = normalizeMessage(
          rawMessage,
          conversationId,
          archiveId,
          fragment.path,
          fragment.fileNumber,
          index,
          rawMessages.length,
        )
        if (normalized) messages.push(normalized)
        else warn(`${fragment.path}: message at index ${index} was not an object; skipped.`)
      })
    }

    // Include senders not listed in participants (partial/old exports).
    const senders = new Set(messages.map((message) => message.senderName))
    for (const sender of senders) {
      if (sender !== 'Unknown' && !participantNames.includes(sender)) participantNames.push(sender)
    }

    const deduped = dedupeAcrossShards(messages)
    duplicateCount += deduped.removed
    if (deduped.removed > 0) {
      warn(
        `${thread}: removed ${deduped.removed} overlapping message${deduped.removed === 1 ? '' : 's'} across shards.`,
      )
    }
    const ordered = [...deduped.messages].sort(compareMessages)
    ordered.forEach((message, index) => {
      message.seq = index
    })
    messagesByThread.set(thread, ordered)
    metaByThread.set(thread, {
      conversationId,
      title,
      participants: participantNames,
      sourceFiles,
      isMessageRequest,
      isStillParticipant,
    })
  }

  const owner = inferOwner(fragments, messagesByThread, personalInfoOwner, rootUsername)
  const ownerUsername = owner.username || personalInfoOwner || rootUsername || ''

  const conversations: Conversation[] = []
  const allMessages: Message[] = []

  for (const [thread, messages] of messagesByThread) {
    const meta = metaByThread.get(thread)
    if (!meta) continue
    const participantNames = meta.participants
    const senders = new Set(messages.map((message) => message.senderName))
    const isGroup = participantNames.length > 2 || senders.size > 2
    const title = titleFor({
      rawTitle: meta.title,
      participants: participantNames,
      ownerUsername,
      threadPath: thread,
      isGroup,
    })
    const participants: Participant[] = participantNames.map((name) => ({
      name,
      isOwner:
        Boolean(ownerUsername) &&
        name.toLocaleLowerCase('en') === ownerUsername.toLocaleLowerCase('en'),
    }))
    if (ownerUsername && !participants.some((participant) => participant.isOwner)) {
      participants.push({ name: ownerUsername, isOwner: true })
    }

    const lastMessage = messages[messages.length - 1]
    const firstMessage = messages[0]
    const mediaCount = messages.reduce((count, message) => count + message.attachments.length, 0)
    const conversation: Conversation = {
      id: meta.conversationId,
      archiveId,
      threadPath: thread,
      folderName: basename(thread),
      title: title || 'Conversation',
      participants,
      isGroup,
      isMessageRequest: meta.isMessageRequest,
      isStillParticipant: meta.isStillParticipant,
      messageCount: messages.length,
      mediaCount,
      firstTimestampMs: firstMessage?.timestampMs ?? null,
      lastTimestampMs: lastMessage?.timestampMs ?? null,
      lastMessagePreview: lastMessage ? messagePreview(lastMessage, ownerUsername) : '',
      lastSenderName: lastMessage?.senderName ?? '',
      sourceFiles: meta.sourceFiles,
    }
    conversations.push(conversation)
    allMessages.push(...messages)
  }

  conversations.sort(
    (a, b) => (b.lastTimestampMs ?? 0) - (a.lastTimestampMs ?? 0) || a.title.localeCompare(b.title),
  )

  return {
    archiveId,
    conversations,
    messages: allMessages,
    ownerUsername,
    ownerSource: owner.source,
    ownerConfidence: owner.confidence,
    warnings,
    duplicateCount,
    sourceFileCount,
    mediaReferenceCount: allMessages.reduce((count, message) => count + message.attachments.length, 0),
    durationMs: Math.max(0, Math.round(performance.now() - start)),
    personalInfoFound: personalInfoOwner !== null,
  }
}

export function collectMediaReferences(messages: Message[]): Attachment[] {
  return messages.flatMap((message) => message.attachments)
}

/** Exported for tests and the import summary. */
export function rawMessageFingerprint(raw: unknown): string {
  return repairInstagramText(stableJson(raw))
}
