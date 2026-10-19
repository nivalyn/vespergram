import { createRef, type ReactNode } from 'react'
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ArchiveRecord, Attachment, Conversation, Message } from '../types'
import type { MessageListHandle } from '../components/chat/MessageList'
import { MessageList } from '../components/chat/MessageList'
import { parseInstagramArchive } from '../lib/instagram/parse'
import { buildSyntheticArchive } from './fixtures/instagram'

const { scrollSpy, scrollToSpy, listProps } = vi.hoisted(() => ({
  scrollSpy: vi.fn(),
  scrollToSpy: vi.fn(),
  listProps: { current: null as Record<string, unknown> | null },
}))

vi.mock('react-virtuoso', async () => {
  const React = await import('react')
  return {
    Virtuoso: React.forwardRef<unknown, Record<string, unknown>>(function MockVirtuoso(props, ref) {
      listProps.current = props
      React.useImperativeHandle(ref, () => ({
        scrollToIndex: scrollSpy,
        scrollTo: scrollToSpy,
      }))
      const data = (props.data as Message[] | undefined) ?? []
      const components = props.components as
        | { Header?: () => ReactNode; Footer?: () => ReactNode }
        | undefined
      const itemContent = props.itemContent as ((index: number, message: Message) => ReactNode) | undefined
      const Header = components?.Header
      const Footer = components?.Footer
      return React.createElement(
        'div',
        { 'data-testid': 'virtuoso-mock' },
        Header ? React.createElement(Header) : null,
        data.map((message, index) =>
          React.createElement('div', { key: message.id }, itemContent?.(index, message)),
        ),
        Footer ? React.createElement(Footer) : null,
      )
    }),
  }
})

const parsed = parseInstagramArchive(buildSyntheticArchive().files)
const conversation = parsed.conversations.find((entry) => entry.title === 'alice') as Conversation
const messages = parsed.messages
  .filter((message) => message.conversationId === conversation.id)
  .sort((a, b) => a.seq - b.seq)

const archive: ArchiveRecord = {
  id: 'archive-test',
  name: 'Synthetic archive',
  rootLabel: 'fixture',
  sourceKind: 'files',
  importedAt: 1,
  updatedAt: 1,
  ownerUsername: 'me_user',
  ownerSource: 'personal_information',
  ownerConfidence: 'high',
  conversationCount: parsed.conversations.length,
  messageCount: parsed.messages.length,
  mediaCount: 0,
  mediaMatchedCount: 0,
  sourceFileCount: 7,
  firstTimestampMs: 100,
  lastTimestampMs: 9000,
  warnings: [],
  parseDurationMs: 1,
  directoryHandle: null,
  hasLinkedMedia: false,
}

function renderList(initialMessageId: string | null = null) {
  const ref = createRef<MessageListHandle>()
  const onOpenMedia = (_attachment: Attachment) => undefined
  render(
    <MessageList
      ref={ref}
      messages={messages}
      conversation={conversation}
      archive={archive}
      source={null}
      ownerUsername="me_user"
      initialMessageId={initialMessageId}
      searchQuery=""
      currentSearchMessageId={null}
      onOpenMedia={onOpenMedia}
      onVisibleRange={() => undefined}
      onAtBottomChange={() => undefined}
    />,
  )
  return ref
}

beforeEach(() => {
  scrollSpy.mockClear()
  scrollToSpy.mockClear()
  listProps.current = null
})

describe('message timeline navigation', () => {
  it('shows the beginning marker and renders the absolute first message', () => {
    renderList()
    expect(screen.getByText('Beginning of conversation')).toBeInTheDocument()
    expect(screen.getByText('Message unavailable')).toBeInTheDocument()
    expect(screen.getByText('See you tomorrow')).toBeInTheDocument()
    expect(messages[0]?.timestampMs).toBeLessThan(messages.at(-1)?.timestampMs ?? 0)
  })

  it('opens at the latest message when no saved anchor exists', () => {
    renderList()
    expect(listProps.current?.initialTopMostItemIndex).toEqual({
      index: messages.length - 1,
      align: 'end',
    })
  })

  it('restores a saved scroll anchor by message ID', () => {
    const anchor = messages[4]
    renderList(anchor?.id ?? null)
    expect(listProps.current?.initialTopMostItemIndex).toEqual({
      index: 4,
      align: 'start',
    })
  })

  it('falls back to the latest message when a saved anchor no longer exists', () => {
    renderList('missing-message-id')
    expect(listProps.current?.initialTopMostItemIndex).toEqual({
      index: messages.length - 1,
      align: 'start',
    })
  })

  it('jumps to the first and last message through the list handle', () => {
    const ref = renderList()
    act(() => ref.current?.jumpToBeginning())
    expect(scrollToSpy).toHaveBeenLastCalledWith({ top: 0, behavior: 'auto' })

    act(() => ref.current?.jumpToLatest())
    expect(scrollSpy).toHaveBeenLastCalledWith({
      index: messages.length - 1,
      align: 'end',
      behavior: 'auto',
    })
  })

  it('scrolls to a specific message for search navigation and deep links', () => {
    const ref = renderList()
    const target = messages[6]
    act(() => {
      expect(ref.current?.scrollToMessage(target?.id ?? '')).toBe(true)
    })
    expect(scrollSpy).toHaveBeenLastCalledWith({ index: 6, align: 'center', behavior: 'auto' })

    act(() => {
      expect(ref.current?.scrollToMessage('not-present')).toBe(false)
    })
    expect(scrollSpy).toHaveBeenCalledTimes(1)
  })
})
