import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Virtuoso, type ListRange, type VirtuosoHandle } from 'react-virtuoso'
import { ArrowDown, Sparkles } from 'lucide-react'
import type {
  ArchiveRecord,
  Attachment,
  Conversation,
  Message,
} from '../../types'
import type { MediaSource } from '../../lib/media/mediaResolver'
import { dateKey, formatDate, formatWeekdayDate } from '../../lib/dates'
import { MessageRow, shouldGroup } from '../messages/MessageBubble'
import { formatCount } from '../../lib/dates'

export interface MessageListHandle {
  jumpToBeginning: (behavior?: 'auto' | 'smooth') => void
  jumpToLatest: (behavior?: 'auto' | 'smooth') => void
  scrollToIndex: (index: number, align?: 'start' | 'center' | 'end') => void
  scrollToMessage: (messageId: string) => boolean
}

interface MessageListProps {
  messages: Message[]
  conversation: Conversation
  archive: ArchiveRecord
  source: MediaSource
  ownerUsername: string
  initialMessageId: string | null
  searchQuery: string
  currentSearchMessageId: string | null
  onOpenMedia: (attachment: Attachment) => void
  onVisibleRange: (range: ListRange) => void
  onAtBottomChange: (atBottom: boolean) => void
}

function BeginningIndicator({ messages }: { messages: Message[] }) {
  const first = messages[0]
  return (
    <div className="flex flex-col items-center px-6 pb-1 pt-9 text-center">
      <div className="flex items-center gap-2.5 rounded-full border border-sun-500/20 bg-sun-500/[0.055] px-3.5 py-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-sun-500 shadow-[0_0_10px_rgba(255,214,10,.65)]" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-sun-500">
          Beginning of conversation
        </span>
      </div>
      <p className="mt-2.5 max-w-sm text-[11px] leading-relaxed text-fog-500">
        {first?.timestampMs
          ? `${formatWeekdayDate(first.timestampMs)} · ${formatCount(messages.length)} messages in this archive`
          : `${formatCount(messages.length)} messages in this archive`}
      </p>
      <span className="mt-5 h-8 w-px bg-gradient-to-b from-sun-500/30 to-transparent" />
    </div>
  )
}

function LatestIndicator({ messages }: { messages: Message[] }) {
  const last = messages[messages.length - 1]
  return (
    <div className="flex flex-col items-center px-6 pb-8 pt-2 text-center">
      <span className="h-8 w-px bg-gradient-to-t from-violet-500/30 to-transparent" />
      <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-fog-500">
        <Sparkles size={11} className="text-violet-400" />
        End of the archive
        <span className="text-fog-600">·</span>
        <span className="normal-case tracking-normal text-fog-400">
          {last?.timestampMs ? formatDate(last.timestampMs) : 'No timestamp'}
        </span>
      </div>
    </div>
  )
}

export const MessageList = forwardRef<MessageListHandle, MessageListProps>(function MessageList(
  {
    messages,
    conversation,
    archive,
    source,
    ownerUsername,
    initialMessageId,
    searchQuery,
    currentSearchMessageId,
    onOpenMedia,
    onVisibleRange,
    onAtBottomChange,
  },
  ref,
) {
  const virtuoso = useRef<VirtuosoHandle>(null)

  const initialIndex = useMemo(() => {
    if (!messages.length) return 0
    if (!initialMessageId) return messages.length - 1
    const index = messages.findIndex((message) => message.id === initialMessageId)
    return index >= 0 ? index : messages.length - 1
  }, [initialMessageId, messages])

  const initialAlign = initialMessageId ? 'start' : 'end'
  const [atBottom, setAtBottom] = useState(false)

  const scrollToIndex = useCallback((index: number, align: 'start' | 'center' | 'end' = 'center') => {
    if (!messages.length) return
    const clamped = Math.max(0, Math.min(index, messages.length - 1))
    virtuoso.current?.scrollToIndex({ index: clamped, align, behavior: 'auto' })
  }, [messages.length])

  useImperativeHandle(
    ref,
    () => ({
      // Scroll to the very top so the "Beginning of conversation" marker is visible.
      jumpToBeginning: (behavior: 'auto' | 'smooth' = 'auto') =>
        virtuoso.current?.scrollTo({ top: 0, behavior }),
      jumpToLatest: () => scrollToIndex(messages.length - 1, 'end'),
      scrollToIndex,
      scrollToMessage: (messageId: string) => {
        const index = messages.findIndex((message) => message.id === messageId)
        if (index < 0) return false
        scrollToIndex(index, 'center')
        return true
      },
    }),
    [messages, scrollToIndex],
  )

  const components = useMemo(
    () => ({
      Header: () => <BeginningIndicator messages={messages} />,
      Footer: () => <LatestIndicator messages={messages} />,
    }),
    [messages],
  )

  if (!messages.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.025] text-fog-500">
          <Sparkles size={21} />
        </div>
        <h3 className="mt-4 font-display text-[16px] font-medium text-fog-200">
          No messages in this conversation
        </h3>
        <p className="mt-1.5 max-w-xs text-[12px] leading-relaxed text-fog-500">
          The export contains this thread, but no message records. It may have been empty when the
          archive was created.
        </p>
      </div>
    )
  }

  return (
    <div className="relative min-h-0 flex-1">
      <Virtuoso
        ref={virtuoso}
        key={conversation.id}
        data={messages}
        className="chat-scroller"
        style={{ height: '100%' }}
        computeItemKey={(_, message) => message.id}
        initialTopMostItemIndex={{ index: initialIndex, align: initialAlign }}
        alignToBottom
        atBottomStateChange={(value) => {
          setAtBottom(value)
          onAtBottomChange(value)
        }}
        atBottomThreshold={140}
        rangeChanged={(range) => onVisibleRange(range)}
        increaseViewportBy={{ top: 800, bottom: 800 }}
        components={components}
        itemContent={(index, message) => {
          const previous = messages[index - 1]
          const next = messages[index + 1]
          const showDate =
            !previous ||
            (previous.timestampMs === null && message.timestampMs === null
              ? false
              : previous.timestampMs === null || message.timestampMs === null
                ? true
                : dateKey(previous.timestampMs) !== dateKey(message.timestampMs))
          const isGroupStart = showDate || !shouldGroup(previous, message)
          const isGroupEnd =
            !next ||
            (next.timestampMs === null && message.timestampMs === null) ||
            (next.timestampMs !== null &&
              message.timestampMs !== null &&
              dateKey(next.timestampMs) !== dateKey(message.timestampMs)) ||
            !shouldGroup(message, next)
          return (
            <MessageRow
              message={message}
              conversation={conversation}
              archive={archive}
              source={source}
              ownerUsername={ownerUsername}
              isGroupStart={isGroupStart}
              isGroupEnd={isGroupEnd}
              showDate={showDate}
              searchQuery={searchQuery}
              isCurrentHit={message.id === currentSearchMessageId}
              onOpenMedia={onOpenMedia}
            />
          )
        }}
      />
      {!atBottom ? (
        <button
          type="button"
          className="absolute bottom-5 right-5 z-20 flex h-10 items-center gap-2 rounded-full border border-white/10 bg-ink-800/95 px-3.5 text-[11px] font-medium text-fog-200 shadow-panel transition-colors hover:border-violet-400/30 hover:text-white"
          onClick={() => scrollToIndex(messages.length - 1, 'end')}
        >
          <ArrowDown size={14} className="text-violet-300" />
          Latest
        </button>
      ) : null}
    </div>
  )
})
