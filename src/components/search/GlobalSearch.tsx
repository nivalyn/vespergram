import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowRight,
  CornerDownLeft,
  MessageSquare,
  Search,
  UserRound,
  X,
} from 'lucide-react'
import { useApp } from '../../state/AppContext'
import { filterConversations, searchMessages, sortConversations } from '../../lib/search'
import { formatCompactTime, formatCount, formatDate } from '../../lib/dates'
import { cn } from '../../lib/cn'
import { Avatar } from '../common/Avatar'
import { MessageText } from '../messages/MessageText'

interface GlobalSearchProps {
  open: boolean
  onClose: () => void
  onSelectMessage: (conversationId: string, messageId: string) => void
}

type Item =
  | { kind: 'conversation'; id: string; title: string; subtitle: string }
  | {
      kind: 'message'
      id: string
      conversationId: string
      sender: string
      date: number | null
      snippet: string
    }

export function GlobalSearch({ open, onClose, onSelectMessage }: GlobalSearchProps) {
  const {
    conversations,
    messages,
    activeConversation,
    settings,
    selectConversation,
  } = useApp()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setSelected(0)
      return
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40)
    return () => window.clearTimeout(timer)
  }, [open])

  const sortedConversations = useMemo(
    () => sortConversations(conversations, settings.conversationSort),
    [conversations, settings.conversationSort],
  )

  const conversationMatches = useMemo(() => {
    const filtered = filterConversations(sortedConversations, query)
    return filtered.slice(0, query ? 8 : 7)
  }, [query, sortedConversations])

  const messageMatches = useMemo(() => {
    if (!query.trim() || !activeConversation) return []
    return searchMessages(messages, query).slice(0, 20)
  }, [activeConversation, messages, query])

  const items = useMemo<Item[]>(() => {
    const output: Item[] = conversationMatches.map((conversation) => ({
      kind: 'conversation',
      id: conversation.id,
      title: conversation.title,
      subtitle: `${formatCount(conversation.messageCount)} messages${
        conversation.lastTimestampMs
          ? ` · ${formatCompactTime(conversation.lastTimestampMs)}`
          : ''
      }`,
    }))
    if (activeConversation) {
      for (const match of messageMatches) {
        output.push({
          kind: 'message',
          id: match.messageId,
          conversationId: activeConversation.id,
          sender: match.senderName,
          date: match.timestampMs,
          snippet: match.snippet,
        })
      }
    }
    return output
  }, [activeConversation, conversationMatches, messageMatches])

  useEffect(() => {
    setSelected(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelected((current) => (items.length ? (current + 1) % items.length : 0))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelected((current) =>
          items.length ? (current - 1 + items.length) % items.length : 0,
        )
      } else if (event.key === 'Enter') {
        event.preventDefault()
        const item = items[selected]
        if (!item) return
        if (item.kind === 'conversation') {
          selectConversation(item.id)
          onClose()
        } else {
          onSelectMessage(item.conversationId, item.id)
          onClose()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [items, onClose, onSelectMessage, open, selectConversation, selected])

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const active = list.querySelector<HTMLElement>('[data-selected="true"]')
    active?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  if (!open) return null

  const hasQuery = Boolean(query.trim())
  const conversationCount = conversationMatches.length
  const messageCount = messageMatches.length

  const choose = (item: Item) => {
    if (item.kind === 'conversation') {
      selectConversation(item.id)
      onClose()
    } else {
      onSelectMessage(item.conversationId, item.id)
      onClose()
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[85] flex items-start justify-center bg-black/78 px-3 pt-[max(9vh,52px)] backdrop-blur-[3px] sm:px-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search conversations and messages"
        className="animate-scale-in w-full max-w-2xl overflow-hidden rounded-2xl border border-white/[0.09] bg-ink-850 shadow-panel"
      >
        <div className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-3.5">
          <Search size={18} className="shrink-0 text-violet-300" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              activeConversation
                ? `Search conversations and “${activeConversation.title}”…`
                : 'Search conversations…'
            }
            className="min-w-0 flex-1 bg-transparent text-[14px] text-fog-100 placeholder:text-fog-500 focus:outline-none"
            aria-label="Search conversations and messages"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" className="icon-btn h-8 w-8" onClick={onClose} aria-label="Close search">
            <X size={16} />
          </button>
        </div>

        <div ref={listRef} className="max-h-[min(62vh,560px)] overflow-y-auto p-2">
          {!items.length ? (
            <div className="px-5 py-12 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.025] text-fog-500">
                <Search size={18} />
              </div>
              <p className="mt-3 text-[12px] font-medium text-fog-300">
                {hasQuery ? 'No local results' : 'Start typing to search'}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-[10.5px] leading-relaxed text-fog-500">
                {hasQuery
                  ? 'Try a different spelling. Search is case- and accent-insensitive.'
                  : 'Find a conversation by name, or open a conversation and search every message in it.'}
              </p>
            </div>
          ) : null}

          {conversationCount ? (
            <div>
              <GroupHeading icon={<UserRound size={11} />} label="Conversations" count={conversationCount} />
              {conversationMatches.map((conversation, index) => {
                const active = selected === index
                const participants = conversation.isGroup
                  ? conversation.participants
                      .filter((participant) => !participant.isOwner)
                      .map((participant) => participant.name)
                      .join(', ')
                  : ''
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    data-selected={active ? 'true' : undefined}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors',
                      active ? 'bg-violet-500/[0.13]' : 'hover:bg-white/[0.035]',
                    )}
                    onMouseEnter={() => setSelected(index)}
                    onClick={() => choose(items[index] as Item)}
                  >
                    <Avatar
                      name={conversation.title}
                      size={34}
                      isGroup={conversation.isGroup}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium text-fog-100">
                        {conversation.title}
                      </span>
                      <span className="mt-0.5 block truncate text-[9.5px] text-fog-500">
                        {participants || conversation.lastMessagePreview || 'No messages'}
                      </span>
                    </span>
                    <span className="shrink-0 text-[9px] text-fog-500">
                      {conversation.lastTimestampMs
                        ? formatCompactTime(conversation.lastTimestampMs)
                        : ''}
                    </span>
                    {active ? (
                      <ArrowRight size={13} className="shrink-0 text-violet-300" />
                    ) : null}
                  </button>
                )
              })}
            </div>
          ) : null}

          {messageCount && activeConversation ? (
            <div className={conversationCount ? 'mt-2 border-t border-white/[0.05] pt-2' : ''}>
              <GroupHeading
                icon={<MessageSquare size={11} />}
                label={`Messages in ${activeConversation.title}`}
                count={messageCount}
              />
              {messageMatches.map((match, index) => {
                const flatIndex = conversationCount + index
                const active = selected === flatIndex
                const item = items[flatIndex]
                if (!item) return null
                return (
                  <button
                    key={match.messageId}
                    type="button"
                    data-selected={active ? 'true' : undefined}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-xl px-2.5 py-2 text-left transition-colors',
                      active ? 'bg-sun-500/[0.09]' : 'hover:bg-white/[0.035]',
                    )}
                    onMouseEnter={() => setSelected(flatIndex)}
                    onClick={() => choose(item)}
                  >
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-fog-400">
                      <MessageSquare size={12} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[10.5px] font-medium text-violet-300">
                          {match.senderName}
                        </span>
                        <span className="shrink-0 text-[9px] text-fog-500">
                          {match.timestampMs !== null
                            ? formatDate(match.timestampMs)
                            : 'Unknown date'}
                        </span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-[11.5px] leading-relaxed text-fog-300">
                        <MessageText
                          text={match.snippet}
                          query={query}
                          preserveWhitespace={false}
                          linkify={false}
                        />
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          ) : null}

          {hasQuery && !messageCount && activeConversation ? (
            <p className="px-3 py-2.5 text-center text-[9px] text-fog-600">
              No message text matches “{query}” in this conversation.
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] bg-white/[0.012] px-4 py-2.5">
          <span className="flex items-center gap-2 text-[9px] text-fog-500">
            <span className="kbd">↑</span>
            <span className="kbd">↓</span>
            navigate
            <span className="ml-1 kbd">
              <CornerDownLeft size={9} />
            </span>
            open
            <span className="kbd">Esc</span>
            close
          </span>
          <span className="text-[9px] text-fog-600">
            {hasQuery
              ? `${formatCount(items.length)} result${items.length === 1 ? '' : 's'}`
              : activeConversation
                ? 'Searching this conversation’s messages'
                : 'Open a conversation to search messages'}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function GroupHeading({
  icon,
  label,
  count,
}: {
  icon: ReactNode
  label: string
  count: number
}) {
  return (
    <div className="flex items-center gap-2 px-2.5 pb-1 pt-2">
      <span className="text-fog-600">{icon}</span>
      <span className="section-label flex-1 truncate">{label}</span>
      <span className="font-mono text-[9px] text-fog-600">{count}</span>
    </div>
  )
}
