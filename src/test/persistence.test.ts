import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  clearArchiveDatabase,
  deleteArchive,
  getDatabase,
  loadArchives,
  loadConversations,
  loadMessages,
  loadSettings,
  saveImportedArchive,
  saveSettings,
} from '../lib/db/database'
import type { ArchiveRecord, Message } from '../types'
import { parseInstagramArchive } from '../lib/instagram/parse'
import { buildTinyArchive } from './fixtures/instagram'

function archiveRecord(id: string): ArchiveRecord {
  return {
    id,
    name: 'Synthetic archive',
    rootLabel: 'fixture',
    sourceKind: 'files',
    importedAt: 1,
    updatedAt: 1,
    ownerUsername: 'me_user',
    ownerSource: 'inferred',
    ownerConfidence: 'high',
    conversationCount: 2,
    messageCount: 4,
    mediaCount: 0,
    mediaMatchedCount: 0,
    sourceFileCount: 2,
    firstTimestampMs: 1,
    lastTimestampMs: 4,
    warnings: [],
    parseDurationMs: 1,
    directoryHandle: null,
    hasLinkedMedia: false,
  }
}

async function seed(id = 'archive-test') {
  const parsed = parseInstagramArchive(buildTinyArchive(), { archiveId: id })
  await saveImportedArchive(archiveRecord(id), parsed.conversations, parsed.messages)
  return parsed
}

beforeEach(async () => {
  await clearArchiveDatabase()
})

describe('local persistence', () => {
  it('stores archives, conversations and ordered messages', async () => {
    const parsed = await seed()
    const archives = await loadArchives()
    expect(archives).toHaveLength(1)
    expect(archives[0]?.id).toBe('archive-test')

    const conversations = await loadConversations('archive-test')
    expect(conversations.map((conversation) => conversation.title)).toEqual(['bob', 'alice'])

    const alice = conversations.find((conversation) => conversation.title === 'alice')
    const messages = await loadMessages(alice?.id ?? '')
    expect(messages.map((message) => message.text)).toEqual(['first', 'hello', 'hi'])
    expect(messages.map((message) => message.seq)).toEqual([0, 1, 2])
    expect(messages).toHaveLength(parsed.messages.filter((m) => m.conversationId === alice?.id).length)
  })

  it('persists settings with defaults merged', async () => {
    const defaults = await loadSettings()
    expect(defaults.fontSize).toBe(DEFAULT_SETTINGS.fontSize)
    await saveSettings({ ...defaults, fontSize: 18, density: 'compact', activeConversationId: 'c_1' })
    const loaded = await loadSettings()
    expect(loaded.fontSize).toBe(18)
    expect(loaded.density).toBe('compact')
    expect(loaded.activeConversationId).toBe('c_1')
  })

  it('deletes an archive and every derived message and conversation', async () => {
    const parsed = await seed()
    const alice = parsed.conversations.find((conversation) => conversation.title === 'alice')
    const aliceMessages = parsed.messages.filter((message) => message.conversationId === alice?.id)
    expect(aliceMessages.length).toBeGreaterThan(0)

    await deleteArchive('archive-test')

    expect(await loadArchives()).toHaveLength(0)
    expect(await loadConversations('archive-test')).toHaveLength(0)
    expect(await loadMessages(alice?.id ?? '')).toHaveLength(0)
    const db = await getDatabase()
    expect(await db.count('messages')).toBe(0)
    expect(await db.count('conversations')).toBe(0)
  })

  it('keeps the same export isolated when imported into multiple archives', async () => {
    const first = await seed('archive-one')
    const second = await seed('archive-two')

    const firstConversations = await loadConversations('archive-one')
    const secondConversations = await loadConversations('archive-two')
    expect(firstConversations).toHaveLength(2)
    expect(secondConversations).toHaveLength(2)
    expect(firstConversations[0]?.id).not.toBe(secondConversations[0]?.id)

    expect(await loadMessages(firstConversations[0]?.id ?? '')).toHaveLength(
      first.messages.filter(
        (message) => message.conversationId === firstConversations[0]?.id,
      ).length,
    )
    expect(await loadMessages(secondConversations[0]?.id ?? '')).toHaveLength(
      second.messages.filter(
        (message) => message.conversationId === secondConversations[0]?.id,
      ).length,
    )

    await deleteArchive('archive-one')
    expect(await loadConversations('archive-one')).toHaveLength(0)
    expect(await loadConversations('archive-two')).toHaveLength(2)
    expect(await loadMessages(secondConversations[0]?.id ?? '')).not.toHaveLength(0)
  })

  it('can save a synthetic large conversation in chunks', async () => {
    const id = 'archive-large'
    const messages: Message[] = Array.from({ length: 5_000 }, (_, index) => ({
      id: `m_${index}`,
      conversationId: 'c_large',
      archiveId: id,
      seq: index,
      senderName: index % 2 ? 'alice' : 'me_user',
      timestampMs: 1_700_000_000_000 + index,
      timestampSource: 'timestamp_ms',
      text: `message ${index}`,
      searchText: `message ${index}`,
      kind: 'text',
      attachments: [],
      reactions: [],
      share: null,
      callDurationSeconds: null,
      isVideoCall: false,
      isUnsent: false,
      isDeleted: false,
      isGeoBlocked: false,
      source: { file: 'message_1.json', fileNumber: 1, index, order: index },
    }))
    const conversations = [
      {
        id: 'c_large',
        archiveId: id,
        threadPath: 'inbox/large_1',
        folderName: 'large_1',
        title: 'Large',
        participants: [{ name: 'me_user', isOwner: true }],
        isGroup: false,
        isMessageRequest: false,
        isStillParticipant: true,
        messageCount: messages.length,
        mediaCount: 0,
        firstTimestampMs: messages[0]?.timestampMs ?? null,
        lastTimestampMs: messages.at(-1)?.timestampMs ?? null,
        lastMessagePreview: 'message 4999',
        lastSenderName: 'alice',
        sourceFiles: ['message_1.json'],
      },
    ]
    await saveImportedArchive(archiveRecord(id), conversations, messages)
    const loaded = await loadMessages('c_large')
    expect(loaded).toHaveLength(5_000)
    expect(loaded.at(-1)?.text).toBe('message 4999')
  })
})
