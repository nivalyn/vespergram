import { describe, expect, it } from 'vitest'
import { parseInstagramArchive } from '../lib/instagram/parse'
import { buildLargeArchive, buildSyntheticArchive, buildTinyArchive, mojibake } from './fixtures/instagram'

describe('Instagram archive parser', () => {
  it('parses a realistic export, personal information and mojibake text', () => {
    const { files } = buildSyntheticArchive()
    const result = parseInstagramArchive(files)

    expect(result.ownerUsername).toBe('me_user')
    expect(result.ownerSource).toBe('personal_information')
    expect(result.personalInfoFound).toBe(true)
    expect(result.conversations.length).toBe(4)

    const alice = result.conversations.find((conversation) => conversation.title === 'alice')
    expect(alice).toBeDefined()
    expect(alice?.messageCount).toBe(9)
    expect(alice?.isGroup).toBe(false)
    expect(alice?.isMessageRequest).toBe(false)

    const decoded = result.messages.find((message) => message.text.includes('café'))
    expect(decoded?.text).toBe('café ☕ 😊')
    expect(decoded?.senderName).toBe('me_user')
    expect(
      alice?.participants.find((participant) => participant.name === 'me_user')?.isOwner,
    ).toBe(true)
  })

  it('merges numbered shards, sorts chronologically and deduplicates overlap', () => {
    const { files } = buildSyntheticArchive()
    const result = parseInstagramArchive(files)
    const alice = result.conversations.find((conversation) => conversation.title === 'alice')
    const messages = result.messages
      .filter((message) => message.conversationId === alice?.id)
      .sort((a, b) => a.seq - b.seq)

    expect(messages.map((message) => message.timestampMs)).toEqual([
      100, 500, 1000, 1500, 2000, 2500, 3000, 4000, 5000,
    ])
    expect(result.duplicateCount).toBe(1)
    expect(messages.filter((message) => message.timestampMs === 2000)).toHaveLength(1)
    expect(messages[0]?.seq).toBe(0)
    expect(messages.at(-1)?.seq).toBe(messages.length - 1)
  })

  it('uses deterministic source order for identical timestamps', () => {
    const { files } = buildSyntheticArchive()
    const result = parseInstagramArchive(files)
    const group = result.conversations.find((conversation) => conversation.title === 'Weekend plans')
    const sameTime = result.messages
      .filter((message) => message.conversationId === group?.id && message.timestampMs === 9000)
      .sort((a, b) => a.seq - b.seq)

    // Both entries are newest-first inside message_1; the later array item is
    // older, so "Same timestamp A" comes first chronologically.
    expect(sameTime.map((message) => message.text)).toEqual([
      'Same timestamp A',
      'Same timestamp B',
    ])
    expect(sameTime.map((message) => message.seq)).toEqual([1, 2])
  })

  it('preserves unsupported, unsent, call, media and missing-text messages', () => {
    const { files } = buildSyntheticArchive()
    const result = parseInstagramArchive(files)
    const alice = result.conversations.find((conversation) => conversation.title === 'alice')
    const messages = result.messages.filter((message) => message.conversationId === alice?.id)

    const unsent = messages.find((message) => message.timestampMs === 2500)
    expect(unsent?.kind).toBe('unsent')
    expect(unsent?.isUnsent).toBe(true)

    const call = messages.find((message) => message.timestampMs === 500)
    expect(call?.kind).toBe('call')
    expect(call?.callDurationSeconds).toBe(65)

    const photo = messages.find((message) => message.timestampMs === 3000)
    expect(photo?.text).toBe('')
    expect(photo?.attachments[0]?.kind).toBe('image')
    expect(photo?.attachments[0]?.available).toBe(false)
    expect(photo?.attachments[0]?.path).toContain('photos/photo_a.jpg')

    const voice = messages.find((message) => message.timestampMs === 1000)
    expect(voice?.attachments[0]?.kind).toBe('voice')

    const unavailable = messages.find((message) => message.timestampMs === 100)
    expect(unavailable?.kind).toBe('unavailable')
    expect(unavailable).toBeDefined()
  })

  it('groups multiple conversations, group metadata, requests, empties and malformed files', () => {
    const { files } = buildSyntheticArchive()
    const result = parseInstagramArchive(files)

    const group = result.conversations.find((conversation) => conversation.title === 'Weekend plans')
    expect(group?.isGroup).toBe(true)
    expect(group?.participants).toHaveLength(3)

    const empty = result.conversations.find((conversation) => conversation.folderName.startsWith('empty_'))
    expect(empty).toBeDefined()
    expect(empty?.messageCount).toBe(0)
    expect(empty?.lastMessagePreview).toBe('')

    const request = result.conversations.find((conversation) => conversation.isMessageRequest)
    expect(request?.title).toBe('stranger')

    expect(result.warnings.some((warning) => warning.includes('broken_'))).toBe(true)
    expect(result.sourceFileCount).toBe(7)
    expect(result.messages).toHaveLength(13)
  })

  it('supports conversations from loose message JSON without directory paths', () => {
    const result = parseInstagramArchive([
      {
        path: 'message_1.json',
        text: JSON.stringify({
          participants: [{ name: 'alice' }, { name: 'me_user' }],
          title: 'alice',
          thread_path: 'inbox/alice_123/',
          messages: [{ sender_name: 'alice', timestamp_ms: 42, content: 'loose' }],
        }),
      },
    ])
    expect(result.conversations).toHaveLength(1)
    expect(result.conversations[0]?.title).toBe('alice')
    expect(result.messages[0]?.text).toBe('loose')
  })

  it('repairs double-encoded UTF-8 in text fields', () => {
    const encoded = mojibake('Malformed\u2026 café 😊')
    const result = parseInstagramArchive([
      {
        path: 'messages/inbox/a_1/message_1.json',
        text: JSON.stringify({
          participants: [{ name: 'a' }, { name: 'me' }],
          thread_path: 'inbox/a_1/',
          messages: [{ sender_name: 'a', timestamp_ms: 1, content: encoded }],
        }),
      },
    ])
    expect(result.messages[0]?.text).toBe('Malformed\u2026 café 😊')
  })

  it('infers the owner across conversations when personal information is absent', () => {
    const result = parseInstagramArchive(buildTinyArchive())
    expect(result.ownerUsername).toBe('me_user')
    expect(result.ownerSource).toBe('inferred')
    expect(result.messages.find((message) => message.senderName === 'me_user')?.isUnsent).toBe(false)
  })

  it('uses the export folder username before participant inference', () => {
    const result = parseInstagramArchive([
      {
        path: 'instagram-archive_owner-2025-07-31-abc123/your_instagram_activity/messages/inbox/alice_111/message_1.json',
        text: JSON.stringify({
          participants: [{ name: 'alice' }, { name: 'archive_owner' }],
          title: 'alice',
          thread_path: 'inbox/alice_111/',
          messages: [{ sender_name: 'alice', timestamp_ms: 1, content: 'hello' }],
        }),
      },
    ])
    expect(result.ownerUsername).toBe('archive_owner')
    expect(result.ownerSource).toBe('inferred')
    expect(result.conversations[0]?.participants.find((entry) => entry.isOwner)?.name).toBe(
      'archive_owner',
    )
  })

  it('handles 100,000 messages without truncation and keeps deterministic ordering', () => {
    const count = 100_000
    const result = parseInstagramArchive(buildLargeArchive(count))
    const conversation = result.conversations[0]
    expect(conversation?.messageCount).toBe(count)
    expect(result.messages).toHaveLength(count)
    expect(result.messages[0]?.seq).toBe(0)
    expect(result.messages.at(-1)?.seq).toBe(count - 1)
    expect(result.messages[0]?.text).toBe('the absolute first message')
    expect(result.messages.at(-1)?.text).toBe('the absolute newest message')
    expect(result.messages[0]?.timestampMs).toBeLessThan(
      result.messages.at(-1)?.timestampMs ?? 0,
    )
  })
})
