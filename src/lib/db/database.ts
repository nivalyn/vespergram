import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { ArchiveRecord, Conversation, Message, Settings } from '../../types'

const DB_NAME = 'vesper-archive'
const DB_VERSION = 1

interface VesperDB extends DBSchema {
  archives: {
    key: string
    value: ArchiveRecord
  }
  conversations: {
    key: string
    value: Conversation
    indexes: {
      archiveId: string
      archiveId_lastTimestamp: [string, number]
      archiveId_title: [string, string]
    }
  }
  messages: {
    key: string
    value: Message
    indexes: {
      conversationId: string
      conversationId_seq: [string, number]
    }
  }
  settings: {
    key: string
    value: Settings
  }
}

let databasePromise: Promise<IDBPDatabase<VesperDB>> | null = null

export function getDatabase(): Promise<IDBPDatabase<VesperDB>> {
  databasePromise ??= openDB<VesperDB>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      const archives = database.createObjectStore('archives', { keyPath: 'id' })
      void archives

      const conversations = database.createObjectStore('conversations', { keyPath: 'id' })
      conversations.createIndex('archiveId', 'archiveId')
      conversations.createIndex('archiveId_lastTimestamp', ['archiveId', 'lastTimestampMs'])
      conversations.createIndex('archiveId_title', ['archiveId', 'title'])

      const messages = database.createObjectStore('messages', { keyPath: 'id' })
      messages.createIndex('conversationId', 'conversationId')
      messages.createIndex('conversationId_seq', ['conversationId', 'seq'])

      database.createObjectStore('settings', { keyPath: 'key' })
    },
  })
  return databasePromise
}

export const DEFAULT_SETTINGS: Settings = {
  key: 'app',
  activeArchiveId: null,
  activeConversationId: null,
  lastReadMessageId: null,
  fontSize: 15,
  density: 'comfortable',
  conversationSort: 'recent',
  detailsOpen: true,
  sidebarCollapsed: false,
  showMediaGallery: true,
  motion: 'system',
  scrollPositions: {},
}

export async function loadSettings(): Promise<Settings> {
  const db = await getDatabase()
  const stored = await db.get('settings', 'app')
  if (!stored) return { ...DEFAULT_SETTINGS }
  return { ...DEFAULT_SETTINGS, ...stored, key: 'app' }
}

export async function saveSettings(settings: Settings): Promise<void> {
  const db = await getDatabase()
  await db.put('settings', settings)
}

export async function loadArchives(): Promise<ArchiveRecord[]> {
  const db = await getDatabase()
  const archives = await db.getAll('archives')
  return archives.sort((a, b) => b.importedAt - a.importedAt)
}

export async function loadConversations(archiveId: string): Promise<Conversation[]> {
  const db = await getDatabase()
  const conversations = await db.getAllFromIndex('conversations', 'archiveId', archiveId)
  return conversations.sort(
    (a, b) => (b.lastTimestampMs ?? 0) - (a.lastTimestampMs ?? 0) || a.title.localeCompare(b.title),
  )
}

export async function loadMessages(conversationId: string): Promise<Message[]> {
  const db = await getDatabase()
  const range = IDBKeyRange.bound(
    [conversationId, Number.NEGATIVE_INFINITY],
    [conversationId, Number.POSITIVE_INFINITY],
  )
  const messages = await db.getAllFromIndex('messages', 'conversationId_seq', range)
  return messages
}

export async function loadMessage(messageId: string): Promise<Message | undefined> {
  const db = await getDatabase()
  return db.get('messages', messageId)
}

export interface SaveImportProgress {
  stage: 'conversations' | 'messages' | 'finishing'
  done: number
  total: number
}

export async function saveImportedArchive(
  archive: ArchiveRecord,
  conversations: Conversation[],
  messages: Message[],
  onProgress?: (progress: SaveImportProgress) => void,
): Promise<void> {
  const db = await getDatabase()

  {
    const tx = db.transaction(['archives', 'conversations'], 'readwrite')
    await tx.objectStore('archives').put(archive)
    for (const conversation of conversations) {
      await tx.objectStore('conversations').put(conversation)
    }
    await tx.done
  }
  onProgress?.({ stage: 'conversations', done: conversations.length, total: conversations.length })

  const chunkSize = 2_000
  for (let start = 0; start < messages.length; start += chunkSize) {
    const chunk = messages.slice(start, start + chunkSize)
    const tx = db.transaction('messages', 'readwrite')
    const store = tx.objectStore('messages')
    await Promise.all([...chunk.map((message) => store.put(message)), tx.done])
    onProgress?.({
      stage: 'messages',
      done: Math.min(start + chunk.length, messages.length),
      total: messages.length,
    })
    // Yield to the UI so the import progress and animations stay responsive.
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }

  onProgress?.({ stage: 'finishing', done: messages.length, total: messages.length })
}

export async function updateArchive(archive: ArchiveRecord): Promise<void> {
  const db = await getDatabase()
  await db.put('archives', archive)
}

export async function deleteArchive(archiveId: string): Promise<void> {
  const db = await getDatabase()
  const conversationIds = await db.getAllKeysFromIndex(
    'conversations',
    'archiveId',
    archiveId,
  )

  for (const conversationId of conversationIds) {
    for (;;) {
      const messagesTx = db.transaction('messages', 'readwrite')
      const keys = await messagesTx.store.index('conversationId').getAllKeys(conversationId)
      if (!keys.length) {
        await messagesTx.done
        break
      }
      for (const key of keys) messagesTx.store.delete(key)
      await messagesTx.done
    }

    const conversationTx = db.transaction('conversations', 'readwrite')
    conversationTx.store.delete(conversationId)
    await conversationTx.done
  }

  const tx = db.transaction('archives', 'readwrite')
  tx.store.delete(archiveId)
  await tx.done
}

export async function clearArchiveDatabase(): Promise<void> {
  const db = await getDatabase()
  const tx = db.transaction(['archives', 'conversations', 'messages', 'settings'], 'readwrite')
  await Promise.all([
    tx.objectStore('archives').clear(),
    tx.objectStore('conversations').clear(),
    tx.objectStore('messages').clear(),
    tx.objectStore('settings').clear(),
    tx.done,
  ])
}

export async function getStorageUsage(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null
  const estimate = await navigator.storage.estimate()
  return {
    usage: estimate.usage ?? 0,
    quota: estimate.quota ?? 0,
  }
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  try {
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export async function countMessagesForArchive(archiveId: string): Promise<number> {
  const db = await getDatabase()
  const conversations = await db.getAllKeysFromIndex('conversations', 'archiveId', archiveId)
  let count = 0
  for (const conversationId of conversations) {
    count += await db.countFromIndex('messages', 'conversationId', conversationId)
  }
  return count
}

export { DB_NAME }
