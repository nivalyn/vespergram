/** Shared, serializable domain types for the archive reader. */

export interface ArchiveInputFile {
  /** Path relative to the selected archive root. */
  path: string
  /** Raw JSON text. */
  text: string
}

export type MediaKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'voice'
  | 'sticker'
  | 'gif'
  | 'file'
  | 'unknown'

export type MessageKind =
  | 'text'
  | 'media'
  | 'share'
  | 'call'
  | 'unsent'
  | 'unavailable'
  | 'unknown'

export type TimestampSource =
  | 'timestamp_ms'
  | 'timestamp'
  | 'created_at'
  | 'unknown'

export interface Attachment {
  id: string
  kind: MediaKind
  /** Raw `uri` from Instagram's JSON, repaired for mojibake. */
  uri: string
  /** Safe, normalized path relative to the archive root, when one exists. */
  path: string | null
  /** Path resolved against the selected folder's files, if matched. */
  resolvedPath: string | null
  filename: string
  mimeType: string | null
  sizeBytes: number | null
  creationTimestampMs: number | null
  /** Whether the file was present in the selected archive folder at import. */
  available: boolean
  /** True when the URI points outside the local archive (never fetched). */
  external: boolean
  thumbnail: boolean
}

export interface Reaction {
  emoji: string
  actor: string
  timestampMs: number | null
}

export interface ShareInfo {
  link: string | null
  text: string | null
  originalOwner: string | null
}

export interface MessageSource {
  file: string
  fileNumber: number
  /** Original array index in the shard. */
  index: number
  /** Normalized source order: later = newer within the shard. */
  order: number
}

export interface Message {
  id: string
  conversationId: string
  archiveId: string
  /** Position in the conversation's fully sorted timeline. */
  seq: number
  senderName: string
  timestampMs: number | null
  timestampSource: TimestampSource
  text: string
  /** Lowercased searchable text (does not include private metadata). */
  searchText: string
  kind: MessageKind
  attachments: Attachment[]
  reactions: Reaction[]
  share: ShareInfo | null
  callDurationSeconds: number | null
  isVideoCall: boolean
  isUnsent: boolean
  isDeleted: boolean
  isGeoBlocked: boolean
  source: MessageSource
}

export interface Participant {
  name: string
  isOwner: boolean
}

export interface Conversation {
  id: string
  archiveId: string
  /** `inbox/foo_123` or `message_requests/foo_123`. */
  threadPath: string
  folderName: string
  title: string
  participants: Participant[]
  isGroup: boolean
  isMessageRequest: boolean
  isStillParticipant: boolean
  messageCount: number
  mediaCount: number
  firstTimestampMs: number | null
  lastTimestampMs: number | null
  lastMessagePreview: string
  lastSenderName: string
  sourceFiles: string[]
}

export type ArchiveSourceKind = 'directory' | 'files'

export interface ArchiveRecord {
  id: string
  name: string
  rootLabel: string
  sourceKind: ArchiveSourceKind
  importedAt: number
  updatedAt: number
  ownerUsername: string
  ownerSource: 'personal_information' | 'inferred' | 'manual' | 'unknown'
  ownerConfidence: 'high' | 'low'
  conversationCount: number
  messageCount: number
  mediaCount: number
  mediaMatchedCount: number
  sourceFileCount: number
  firstTimestampMs: number | null
  lastTimestampMs: number | null
  warnings: string[]
  parseDurationMs: number
  /** Chromium File System Access handle. Not copied; permission is requested again when needed. */
  directoryHandle: FileSystemDirectoryHandle | null
  hasLinkedMedia: boolean
}

export interface DateBucket {
  key: string
  timestampMs: number
  count: number
  firstMessageIndex: number
  lastMessageIndex: number
}

export type ConversationSort = 'recent' | 'oldest' | 'messages' | 'title'

export type Density = 'comfortable' | 'compact'

export interface Settings {
  key: 'app'
  activeArchiveId: string | null
  activeConversationId: string | null
  lastReadMessageId: string | null
  fontSize: number
  density: Density
  conversationSort: ConversationSort
  detailsOpen: boolean
  sidebarCollapsed: boolean
  showMediaGallery: boolean
  motion: 'system' | 'on' | 'off'
  /** Conversation ID -> last visible message ID, for restoration. */
  scrollPositions: Record<string, string>
}

export interface SearchMatch {
  messageId: string
  messageIndex: number
  timestampMs: number | null
  senderName: string
  snippet: string
  start: number
  matchedText: string
}

export interface MediaAccessState {
  archiveId: string
  status: 'none' | 'linked' | 'session' | 'permission-required' | 'unavailable'
  directoryHandle: FileSystemDirectoryHandle | null
}

export interface ImportSummary {
  archive: ArchiveRecord
  conversationCount: number
  messageCount: number
  mediaReferenceCount: number
  mediaMatchedCount: number
  duplicateCount: number
  warnings: string[]
  durationMs: number
}
