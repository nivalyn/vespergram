import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  CornerDownLeft,
  Link2,
  Loader2,
  PanelRight,
  Search,
  X,
} from 'lucide-react'
import type {
  ArchiveRecord,
  Attachment,
  Conversation,
  SearchMatch,
} from '../../types'
import { useApp } from '../../state/AppContext'
import {
  buildDateBuckets,
  nextResultIndex,
  searchMessages,
  findBucketForTimestamp,
} from '../../lib/search'
import { dateSeparatorLabel, formatCount, formatDate } from '../../lib/dates'
import { cn } from '../../lib/cn'
import { Avatar } from '../common/Avatar'
import { MessageText } from '../messages/MessageText'
import { MessageList, type MessageListHandle } from './MessageList'
import type { ListRange } from 'react-virtuoso'

export interface ChatPanelHandle {
  jumpToBeginning: () => void
  jumpToLatest: () => void
  focusSearch: () => void
  scrollToMessage: (messageId: string) => boolean
  nextSearchResult: () => void
  previousSearchResult: () => void
  closeOverlays: () => boolean
  isSearchOpen: () => boolean
}

interface ChatPanelProps {
  conversation: Conversation
  archive: ArchiveRecord
  onBack: () => void
  onOpenMedia: (attachment: Attachment) => void
  onOpenSettings: () => void
  onToggleDetails: () => void
  detailsOpen: boolean
  onLinkFolder: () => void
}

export const ChatPanel = forwardRef<ChatPanelHandle, ChatPanelProps>(function ChatPanel(
  {
    conversation,
    archive,
    onBack,
    onOpenMedia,
    onOpenSettings,
    onToggleDetails,
    detailsOpen,
    onLinkFolder,
  },
  ref,
) {
  const {
    messages,
    messagesLoading,
    mediaSource,
    mediaStatus,
    reconnectMedia,
    settings,
    recordScrollPosition,
  } = useApp()

  const listRef = useRef<MessageListHandle>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const datePopoverRef = useRef<HTMLDivElement>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [matches, setMatches] = useState<SearchMatch[]>([])
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1)
  const [dateOpen, setDateOpen] = useState(false)
  const [visibleDate, setVisibleDate] = useState<string | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const scrolledToMatch = useRef(-1)
  const saveTimer = useRef<number | null>(null)
  const visibleRange = useRef<ListRange>({ startIndex: 0, endIndex: 0 })

  const ownerUsername = archive.ownerUsername
  const dates = useMemo(() => buildDateBuckets(messages), [messages])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(searchInput.trim()), 180)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    scrolledToMatch.current = -1
    if (!debouncedQuery) {
      setMatches([])
      setCurrentMatchIndex(-1)
      return
    }
    const found = searchMessages(messages, debouncedQuery)
    setMatches(found)
    setCurrentMatchIndex(found.length ? 0 : -1)
  }, [debouncedQuery, messages])

  useEffect(() => {
    if (!searchOpen) {
      setSearchInput('')
      setDebouncedQuery('')
      setMatches([])
      setCurrentMatchIndex(-1)
    }
  }, [searchOpen])

  useEffect(() => {
    if (!dateOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (!datePopoverRef.current?.contains(event.target as Node)) setDateOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [dateOpen])

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [])

  const goToMatch = useCallback(
    (index: number, scroll: boolean) => {
      if (index < 0 || !matches[index]) return
      setCurrentMatchIndex(index)
      if (scroll) {
        listRef.current?.scrollToMessage(matches[index].messageId)
        scrolledToMatch.current = index
      }
    },
    [matches],
  )

  const nextSearchResult = useCallback(() => {
    if (!matches.length) return
    const index =
      scrolledToMatch.current === currentMatchIndex
        ? nextResultIndex(currentMatchIndex, matches.length, 1)
        : currentMatchIndex
    goToMatch(index, true)
  }, [currentMatchIndex, goToMatch, matches])

  const previousSearchResult = useCallback(() => {
    if (!matches.length) return
    const index =
      scrolledToMatch.current === currentMatchIndex
        ? nextResultIndex(currentMatchIndex, matches.length, -1)
        : currentMatchIndex
    goToMatch(index, true)
  }, [currentMatchIndex, goToMatch, matches])

  const focusSearch = useCallback(() => {
    setSearchOpen(true)
    window.setTimeout(() => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    }, 30)
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      jumpToBeginning: () => listRef.current?.jumpToBeginning(),
      jumpToLatest: () => listRef.current?.jumpToLatest(),
      focusSearch,
      scrollToMessage: (messageId: string) => listRef.current?.scrollToMessage(messageId) ?? false,
      nextSearchResult,
      previousSearchResult,
      closeOverlays: () => {
        if (searchOpen) {
          setSearchOpen(false)
          return true
        }
        if (dateOpen) {
          setDateOpen(false)
          return true
        }
        return false
      },
      isSearchOpen: () => searchOpen,
    }),
    [dateOpen, focusSearch, nextSearchResult, previousSearchResult, searchOpen],
  )

  const onVisibleRange = useCallback(
    (range: ListRange) => {
      visibleRange.current = range
      const message = messages[range.startIndex]
      setVisibleDate(message?.timestampMs ? dateSeparatorLabel(message.timestampMs) : null)
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => {
        const anchor = messages[visibleRange.current.startIndex]
        if (anchor) recordScrollPosition(conversation.id, anchor.id)
      }, 900)
    },
    [conversation.id, messages, recordScrollPosition],
  )

  const currentMatch = currentMatchIndex >= 0 ? matches[currentMatchIndex] : null
  const initialMessageId = settings.scrollPositions[conversation.id] ?? null

  const openAtDate = (index: number) => {
    listRef.current?.scrollToIndex(index, 'center')
    setDateOpen(false)
  }

  const participantsLabel = conversation.isGroup
    ? conversation.participants
        .filter((participant) => !participant.isOwner)
        .map((participant) => participant.name)
        .join(', ') || 'Group conversation'
    : conversation.participants.find((participant) => !participant.isOwner)?.name ??
      conversation.participants[0]?.name ??
      conversation.title

  const showMediaWarning =
    conversation.mediaCount > 0 &&
    (mediaStatus === 'permission-required' || mediaStatus === 'unavailable' || mediaStatus === 'none')

  const bucketForVisible = findBucketForTimestamp(
    dates,
    messages[visibleRange.current.startIndex]?.timestampMs ?? null,
  )

  return (
    <section
      className="relative flex h-full min-w-0 flex-1 flex-col bg-black"
      aria-label={`Conversation with ${conversation.title}`}
    >
      <header className="relative z-30 flex h-[72px] shrink-0 items-center gap-3 border-b border-white/[0.065] bg-ink-950 px-3 sm:px-5">
        <button
          type="button"
          className="icon-btn -ml-1 lg:hidden"
          onClick={onBack}
          aria-label="Back to conversations"
        >
          <ArrowLeft size={19} />
        </button>
        <Avatar name={conversation.title} size={42} isGroup={conversation.isGroup} ring />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-display text-[14.5px] font-semibold tracking-[-0.015em] text-fog-100 sm:text-[15.5px]">
              {conversation.title}
            </h2>
            {conversation.isMessageRequest ? (
              <span className="rounded-md border border-sun-500/25 bg-sun-500/[0.07] px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.12em] text-sun-500">
                request
              </span>
            ) : null}
            {conversation.isGroup ? (
              <span className="hidden rounded-md border border-violet-500/20 bg-violet-500/[0.07] px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.12em] text-violet-300 sm:inline">
                group
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-[10.5px] text-fog-500">
            {visibleDate ? (
              <>
                <span className="text-fog-400">{visibleDate}</span>
                <span className="text-fog-600">·</span>
              </>
            ) : null}
            <span className="truncate">{participantsLabel}</span>
            <span className="text-fog-600">·</span>
            <span className="shrink-0">{formatCount(conversation.messageCount)} messages</span>
          </p>
        </div>

        {!ownerUsername ? (
          <button
            type="button"
            className="hidden items-center gap-1.5 rounded-lg border border-sun-500/25 bg-sun-500/[0.06] px-2.5 py-1.5 text-[10px] font-medium text-sun-500 transition-colors hover:border-sun-500/40 md:flex"
            onClick={onOpenSettings}
            title="Choose which participant is you"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-sun-500" />
            Set your name
          </button>
        ) : null}

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className={cn('icon-btn', searchOpen && 'bg-white/[0.06] text-fog-100')}
            onClick={() => setSearchOpen((open) => !open)}
            aria-label="Search this conversation"
            title="Search in conversation (/ or Ctrl+K then Enter)"
          >
            <Search size={17} />
          </button>
          <div className="relative">
            <button
              type="button"
              className={cn('icon-btn', dateOpen && 'bg-white/[0.06] text-fog-100')}
              onClick={() => setDateOpen((open) => !open)}
              aria-label="Jump to date"
              title="Jump to a date"
            >
              <CalendarDays size={17} />
            </button>
            {dateOpen ? (
              <div
                ref={datePopoverRef}
                className="animate-scale-in absolute right-0 top-[calc(100%+9px)] z-50 w-[318px] overflow-hidden rounded-xl border border-white/[0.09] bg-ink-850 shadow-panel"
              >
                <div className="flex items-center justify-between border-b border-white/[0.06] px-3.5 py-3">
                  <div>
                    <p className="text-[12px] font-medium text-fog-100">Jump to a date</p>
                    <p className="mt-0.5 text-[10px] text-fog-500">
                      {formatCount(dates.length)} active days in this thread
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="icon-btn h-7 w-7"
                      onClick={() => openAtDate(0)}
                      title="Jump to beginning"
                    >
                      <ChevronsUp size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn h-7 w-7"
                      onClick={() => openAtDate(messages.length - 1)}
                      title="Jump to latest"
                    >
                      <ChevronsDown size={14} />
                    </button>
                  </div>
                </div>
                <div className="no-scrollbar max-h-[min(52vh,420px)] overflow-y-auto p-1.5">
                  {dates.length ? (
                    [...dates].reverse().map((bucket) => {
                      const active = bucketForVisible?.key === bucket.key
                      return (
                        <button
                          key={bucket.key}
                          type="button"
                          className={cn(
                            'flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition-colors',
                            active ? 'bg-violet-500/[0.12]' : 'hover:bg-white/[0.045]',
                          )}
                          onClick={() => openAtDate(bucket.firstMessageIndex)}
                        >
                          <span
                            className={cn(
                              'text-[11.5px]',
                              active ? 'font-medium text-violet-200' : 'text-fog-300',
                            )}
                          >
                            {formatDate(bucket.timestampMs)}
                          </span>
                          <span className="shrink-0 font-mono text-[9.5px] text-fog-500">
                            {formatCount(bucket.count)}
                          </span>
                        </button>
                      )
                    })
                  ) : (
                    <p className="px-3 py-6 text-center text-[11px] text-fog-500">
                      No timestamped messages in this conversation.
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="icon-btn hidden sm:inline-flex"
            onClick={() => listRef.current?.jumpToBeginning()}
            aria-label="Jump to beginning"
            title="Jump to beginning (Home)"
          >
            <ChevronsUp size={17} />
          </button>
          <button
            type="button"
            className="icon-btn hidden sm:inline-flex"
            onClick={() => listRef.current?.jumpToLatest()}
            aria-label="Jump to latest"
            title="Jump to latest (End)"
          >
            <ChevronsDown size={17} />
          </button>
          <button
            type="button"
            className="icon-btn xl:hidden"
            onClick={onToggleDetails}
            aria-label="Toggle conversation details"
            title="Conversation details"
          >
            <PanelRight size={17} />
          </button>
          <button
            type="button"
            className={cn('icon-btn hidden xl:inline-flex', detailsOpen && 'text-fog-200')}
            onClick={onToggleDetails}
            aria-label="Toggle conversation details"
            title="Conversation details"
          >
            <PanelRight size={17} />
          </button>
        </div>
      </header>

      {showMediaWarning ? (
        <div className="flex shrink-0 items-center gap-2.5 border-b border-sun-500/[0.12] bg-sun-500/[0.04] px-4 py-2 text-[10.5px] text-fog-400 sm:px-6">
          <Link2 size={12} className="shrink-0 text-sun-500" />
          <span className="min-w-0 flex-1 truncate">
            {mediaStatus === 'permission-required'
              ? 'Media access needs to be reconnected to your folder.'
              : mediaStatus === 'unavailable'
                ? 'Access to the media folder was denied. Attachments show as placeholders.'
                : 'Media files are not linked. Attachments show as placeholders.'}
          </span>
          {mediaStatus === 'permission-required' || mediaStatus === 'unavailable' ? (
            <button
              type="button"
              className="shrink-0 font-medium text-sun-500 hover:text-sun-400"
              onClick={() => void reconnectMedia()}
            >
              Reconnect
            </button>
          ) : (
            <button
              type="button"
              className="shrink-0 font-medium text-sun-500 hover:text-sun-400"
              onClick={onLinkFolder}
            >
              Link folder
            </button>
          )}
        </div>
      ) : null}

      {searchOpen ? (
        <div className="absolute left-0 right-0 top-[72px] z-40 border-b border-white/[0.075] bg-ink-900/98 shadow-[0_18px_40px_-24px_rgba(0,0,0,.9)] backdrop-blur-sm">
          <div className="flex items-center gap-2 px-3 py-2.5 sm:px-5">
            <Search size={15} className="shrink-0 text-fog-500" />
            <input
              ref={searchInputRef}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  if (event.shiftKey) previousSearchResult()
                  else nextSearchResult()
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setSearchOpen(false)
                }
              }}
              placeholder="Find a message in this conversation…"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-fog-100 placeholder:text-fog-500 focus:outline-none"
              aria-label="Find a message in this conversation"
              autoComplete="off"
              spellCheck={false}
            />
            <div className="flex shrink-0 items-center gap-1">
              <span className="mr-1 hidden text-[10px] text-fog-500 sm:inline">
                {matches.length
                  ? `${(currentMatchIndex + 1).toLocaleString()} / ${formatCount(matches.length)}`
                  : debouncedQuery
                    ? 'No matches'
                    : ''}
              </span>
              <button
                type="button"
                className="icon-btn h-7 w-7"
                onClick={previousSearchResult}
                disabled={!matches.length}
                aria-label="Previous search result"
                title="Previous result (Shift+Enter)"
              >
                <ChevronUp size={15} />
              </button>
              <button
                type="button"
                className="icon-btn h-7 w-7"
                onClick={nextSearchResult}
                disabled={!matches.length}
                aria-label="Next search result"
                title="Next result (Enter)"
              >
                <ChevronDown size={15} />
              </button>
              <span className="mx-1 hidden h-4 w-px bg-white/10 sm:block" />
              <span className="hidden items-center gap-1 text-[9.5px] text-fog-500 sm:flex">
                <span className="kbd">
                  <CornerDownLeft size={9} />
                </span>
                next
              </span>
              <button
                type="button"
                className="icon-btn h-7 w-7"
                onClick={() => setSearchOpen(false)}
                aria-label="Close message search"
              >
                <X size={15} />
              </button>
            </div>
          </div>
          {debouncedQuery ? (
            <div className="max-h-[min(42vh,360px)] overflow-y-auto border-t border-white/[0.05]">
              {matches.length ? (
                <>
                  {matches.slice(0, 300).map((match, index) => (
                    <button
                      key={`${match.messageId}-${index}`}
                      type="button"
                      className={cn(
                        'flex w-full items-start gap-3 border-l-2 px-4 py-2.5 text-left transition-colors',
                        index === currentMatchIndex
                          ? 'border-sun-500 bg-sun-500/[0.055]'
                          : 'border-transparent hover:bg-white/[0.03]',
                      )}
                      onClick={() => goToMatch(index, true)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[10.5px] font-medium text-violet-300">
                            {match.senderName}
                          </span>
                          <span className="shrink-0 text-[9.5px] text-fog-500">
                            {match.timestampMs !== null ? formatDate(match.timestampMs) : 'Unknown date'}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-fog-300">
                          <MessageText
                            text={match.snippet}
                            query={debouncedQuery}
                            preserveWhitespace={false}
                            linkify={false}
                          />
                        </p>
                      </div>
                    </button>
                  ))}
                  {matches.length > 300 ? (
                    <p className="px-4 py-3 text-center text-[10px] text-fog-500">
                      Showing the first 300 of {formatCount(matches.length)} matching messages. Use
                      Enter to keep navigating through all results.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="px-4 py-8 text-center text-[11.5px] text-fog-500">
                  No message text matches “{debouncedQuery}”.
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="relative flex min-h-0 flex-1 flex-col">
        {messagesLoading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-fog-500">
            <Loader2 size={20} className="animate-spin text-violet-400" />
            <p className="text-[11px]">Loading the full conversation from the local index…</p>
          </div>
        ) : (
          <MessageList
            ref={listRef}
            messages={messages}
            conversation={conversation}
            archive={archive}
            source={mediaSource}
            ownerUsername={ownerUsername}
            initialMessageId={initialMessageId}
            searchQuery={searchOpen ? debouncedQuery : ''}
            currentSearchMessageId={currentMatch?.messageId ?? null}
            onOpenMedia={onOpenMedia}
            onVisibleRange={onVisibleRange}
            onAtBottomChange={setAtBottom}
          />
        )}
      </div>

      <footer className="flex h-8 shrink-0 items-center justify-between border-t border-white/[0.05] px-4 text-[9.5px] text-fog-600 sm:px-6">
        <span className="flex items-center gap-1.5">
          <span className="h-1 w-1 rounded-full bg-violet-500/70" />
          Read-only local archive · nothing leaves this device
        </span>
        <span className="hidden sm:inline">
          {atBottom ? 'At latest message' : 'Scroll or press End for latest'}
        </span>
      </footer>
    </section>
  )
})
