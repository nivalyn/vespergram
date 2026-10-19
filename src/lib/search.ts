import type { Conversation, DateBucket, Message, SearchMatch } from '../types'
import { dateKey, startOfDay } from './dates'
import { makeSnippet, normalizeForSearch } from './text'

export interface FoldedText {
  folded: string
  /** Maps each folded UTF-16 unit back to the source UTF-16 offset. */
  starts: number[]
}

export function foldWithMap(text: string): FoldedText {
  const parts: string[] = []
  const starts: number[] = []
  let sourceOffset = 0
  for (const character of text) {
    const folded = character
      .normalize('NFD')
      .replace(/\p{M}+/gu, '')
      .toLocaleLowerCase('en')
    parts.push(folded)
    for (let index = 0; index < folded.length; index++) starts.push(sourceOffset)
    sourceOffset += character.length
  }
  return { folded: parts.join(''), starts }
}

export function highlightRanges(text: string, query: string): Array<[number, number]> {
  const foldedQuery = normalizeForSearch(query)
  if (!foldedQuery) return []
  const { folded, starts } = foldWithMap(text)
  const ranges: Array<[number, number]> = []
  let from = 0
  while (from <= folded.length - foldedQuery.length) {
    const at = folded.indexOf(foldedQuery, from)
    if (at < 0) break
    const start = starts[at] ?? text.length
    const end = starts[at + foldedQuery.length] ?? text.length
    if (end > start) ranges.push([start, end])
    from = at + Math.max(1, foldedQuery.length)
  }
  return ranges
}

function searchableOriginal(message: Message): string {
  return [
    message.text,
    message.share?.text ?? '',
    message.share?.originalOwner ?? '',
    ...message.attachments.map((attachment) => attachment.filename),
  ]
    .filter(Boolean)
    .join('\n')
}

export function searchMessages(messages: Message[], query: string): SearchMatch[] {
  const foldedQuery = normalizeForSearch(query).trim()
  if (!foldedQuery) return []
  const results: SearchMatch[] = []

  for (let index = 0; index < messages.length; index++) {
    const message = messages[index]
    if (!message || !message.searchText.includes(foldedQuery)) continue
    const original = searchableOriginal(message)
    const { folded, starts } = foldWithMap(original)
    const at = folded.indexOf(foldedQuery)
    if (at < 0) continue
    const start = starts[at] ?? 0
    const end = starts[at + foldedQuery.length] ?? original.length
    const matchedText = original.slice(start, end)
    results.push({
      messageId: message.id,
      messageIndex: index,
      timestampMs: message.timestampMs,
      senderName: message.senderName,
      snippet: makeSnippet(original, start, matchedText.length),
      start,
      matchedText,
    })
  }

  return results
}

export function nextResultIndex(current: number, total: number, direction: 1 | -1): number {
  if (total <= 0) return -1
  if (current < 0) return direction === 1 ? 0 : total - 1
  return (current + direction + total) % total
}

export function findMessageIndexById(messages: Message[], messageId: string | null): number {
  if (!messageId) return -1
  return messages.findIndex((message) => message.id === messageId)
}

export function findIndexForTimestamp(messages: Message[], timestampMs: number): number {
  if (!messages.length) return -1
  let low = 0
  let high = messages.length - 1
  let answer = -1
  while (low <= high) {
    const middle = (low + high) >> 1
    const message = messages[middle]
    if (!message) break
    const time = message.timestampMs ?? Number.NEGATIVE_INFINITY
    if (time >= timestampMs) {
      answer = middle
      high = middle - 1
    } else {
      low = middle + 1
    }
  }
  // A date after the newest message resolves to the newest message.
  return answer === -1 ? messages.length - 1 : answer
}

export function buildDateBuckets(messages: Message[]): DateBucket[] {
  const buckets: DateBucket[] = []
  const byKey = new Map<string, DateBucket>()
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index]
    if (!message || message.timestampMs === null) continue
    const key = dateKey(message.timestampMs)
    let bucket = byKey.get(key)
    if (!bucket) {
      bucket = {
        key,
        timestampMs: startOfDay(message.timestampMs),
        count: 0,
        firstMessageIndex: index,
        lastMessageIndex: index,
      }
      byKey.set(key, bucket)
      buckets.push(bucket)
    }
    bucket.count++
    bucket.lastMessageIndex = index
  }
  return buckets
}

export function findBucketForTimestamp(buckets: DateBucket[], timestampMs: number | null): DateBucket | null {
  if (timestampMs === null) return null
  let best: DateBucket | null = null
  for (const bucket of buckets) {
    if (bucket.timestampMs <= timestampMs) best = bucket
    else break
  }
  return best
}

export function filterConversations(conversations: Conversation[], query: string): Conversation[] {
  const folded = normalizeForSearch(query).trim()
  if (!folded) return conversations
  return conversations.filter((conversation) => {
    const haystack = normalizeForSearch(
      [conversation.title, ...conversation.participants.map((participant) => participant.name), conversation.lastMessagePreview]
        .filter(Boolean)
        .join('\n'),
    )
    return haystack.includes(folded)
  })
}

export function sortConversations(
  conversations: Conversation[],
  sort: 'recent' | 'oldest' | 'messages' | 'title',
): Conversation[] {
  const copy = [...conversations]
  switch (sort) {
    case 'recent':
      copy.sort((a, b) => (b.lastTimestampMs ?? 0) - (a.lastTimestampMs ?? 0) || a.title.localeCompare(b.title))
      break
    case 'oldest':
      copy.sort((a, b) => (a.lastTimestampMs ?? Number.MAX_SAFE_INTEGER) - (b.lastTimestampMs ?? Number.MAX_SAFE_INTEGER) || a.title.localeCompare(b.title))
      break
    case 'messages':
      copy.sort((a, b) => b.messageCount - a.messageCount || a.title.localeCompare(b.title))
      break
    case 'title':
      copy.sort((a, b) => a.title.localeCompare(b.title))
      break
  }
  return copy
}
