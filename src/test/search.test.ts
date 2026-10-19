import { describe, expect, it } from 'vitest'
import {
  buildDateBuckets,
  filterConversations,
  findIndexForTimestamp,
  findMessageIndexById,
  highlightRanges,
  nextResultIndex,
  searchMessages,
  sortConversations,
} from '../lib/search'
import { parseInstagramArchive } from '../lib/instagram/parse'
import { buildSyntheticArchive } from './fixtures/instagram'

const parsed = parseInstagramArchive(buildSyntheticArchive().files)
const alice = parsed.conversations.find((conversation) => conversation.title === 'alice')

const messages = parsed.messages
  .filter((message) => message.conversationId === alice?.id)
  .sort((a, b) => a.seq - b.seq)

describe('local search', () => {
  it('is Unicode-aware and case-insensitive', () => {
    const [match] = searchMessages(messages, 'CAFÉ')
    expect(match).toBeDefined()
    expect(match?.matchedText.toLocaleLowerCase()).toContain('café')
    expect(match?.messageIndex).toBeGreaterThanOrEqual(0)
  })

  it('matches accented text without requiring diacritics', () => {
    expect(searchMessages(messages, 'CAFE')).toHaveLength(1)
    expect(highlightRanges('A café and CAFÉ', 'cafe')).toHaveLength(2)
  })

  it('finds emoji and multiline content', () => {
    expect(searchMessages(messages, '☕')).toHaveLength(1)
    expect(searchMessages(messages, 'line one')).toHaveLength(1)
  })

  it('returns empty results for an empty query', () => {
    expect(searchMessages(messages, '   ')).toEqual([])
  })

  it('builds non-overlapping highlight ranges for Unicode text', () => {
    const ranges = highlightRanges('Hello café, CAFÉ and café', 'café')
    expect(ranges).toHaveLength(3)
    const pieces = ranges.map(([start, end]) => 'Hello café, CAFÉ and café'.slice(start, end))
    expect(pieces[0]).toBe('café')
    expect(pieces[1]).toBe('CAFÉ')
  })

  it('navigates results with wrap-around in both directions', () => {
    expect(nextResultIndex(-1, 3, 1)).toBe(0)
    expect(nextResultIndex(2, 3, 1)).toBe(0)
    expect(nextResultIndex(0, 3, -1)).toBe(2)
    expect(nextResultIndex(0, 0, 1)).toBe(-1)
  })

  it('resolves stable message IDs and timestamps to list indexes', () => {
    const target = messages[4]
    expect(findMessageIndexById(messages, target?.id ?? '')).toBe(4)
    expect(findIndexForTimestamp(messages, 2000)).toBe(4)
    expect(findIndexForTimestamp(messages, 0)).toBe(0)
    expect(findIndexForTimestamp(messages, 999_999)).toBe(messages.length - 1)
  })

  it('builds date buckets that point at the first message of each day', () => {
    const buckets = buildDateBuckets(messages)
    expect(buckets.length).toBeGreaterThan(0)
    for (const bucket of buckets) {
      expect(messages[bucket.firstMessageIndex]?.timestampMs).not.toBeNull()
      expect(bucket.count).toBeGreaterThan(0)
    }
  })

  it('filters and sorts conversations locally', () => {
    expect(filterConversations(parsed.conversations, 'weekend')).toHaveLength(1)
    expect(filterConversations(parsed.conversations, 'ALICE').length).toBeGreaterThanOrEqual(2)
    expect(filterConversations(parsed.conversations, 'no such person')).toHaveLength(0)

    const byMessages = sortConversations(parsed.conversations, 'messages')
    expect(byMessages[0]?.messageCount).toBeGreaterThanOrEqual(byMessages.at(-1)?.messageCount ?? 0)
    const byTitle = sortConversations(parsed.conversations, 'title')
    const expectedTitleOrder = [...parsed.conversations]
      .map((conversation) => conversation.title)
      .sort((a, b) => a.localeCompare(b))
    expect(byTitle.map((c) => c.title)).toEqual(expectedTitleOrder)
  })
})
