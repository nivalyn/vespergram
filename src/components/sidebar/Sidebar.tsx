import { useEffect, useMemo, useRef, useState } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import {
  Archive,
  Check,
  ChevronDown,
  CirclePlus,
  FolderUp,
  LockKeyhole,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings2,
  X,
} from 'lucide-react'
import { useApp } from '../../state/AppContext'
import { filterConversations, sortConversations } from '../../lib/search'
import { formatCompactTime, formatCount } from '../../lib/dates'
import { cn } from '../../lib/cn'
import { Avatar, Wordmark } from '../common/Avatar'
import type { Conversation } from '../../types'

interface SidebarProps {
  onImport: () => void
  onSettings: () => void
  onSelectConversation: (conversationId: string) => void
}

export function Sidebar({ onImport, onSettings, onSelectConversation }: SidebarProps) {
  const {
    archives,
    activeArchive,
    conversations,
    activeConversation,
    settings,
    updateSettings,
    selectArchive,
    conversationsLoading,
  } = useApp()
  const [query, setQuery] = useState('')
  const [archiveOpen, setArchiveOpen] = useState(false)
  const archiveRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<VirtuosoHandle>(null)

  const filtered = useMemo(() => {
    return sortConversations(filterConversations(conversations, query), settings.conversationSort)
  }, [conversations, query, settings.conversationSort])

  useEffect(() => {
    if (!archiveOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (!archiveRef.current?.contains(event.target as Node)) setArchiveOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [archiveOpen])

  useEffect(() => {
    if (!activeConversation) return
    const index = filtered.findIndex((conversation) => conversation.id === activeConversation.id)
    if (index > 1) {
      listRef.current?.scrollToIndex({ index, align: 'center', behavior: 'auto' })
    }
    // Only respond to conversation changes and archive switches, not each scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversation?.id, activeArchive?.id])

  const previewFor = (conversation: Conversation): string => {
    if (!conversation.lastMessagePreview) return 'No messages in this conversation'
    const owner = activeArchive?.ownerUsername ?? ''
    if (owner && conversation.lastSenderName.toLocaleLowerCase('en') === owner.toLocaleLowerCase('en')) {
      return `You: ${conversation.lastMessagePreview}`
    }
    if (conversation.isGroup && conversation.lastSenderName) {
      return `${conversation.lastSenderName}: ${conversation.lastMessagePreview}`
    }
    return conversation.lastMessagePreview
  }

  if (settings.sidebarCollapsed) {
    return (
      <>
        <aside className="hidden h-full w-[78px] shrink-0 flex-col items-center border-r border-white/[0.065] bg-ink-850 py-4 lg:flex">
          <Wordmark compact />
          <div className="mt-5 flex flex-col items-center gap-1.5">
            <button
              type="button"
              className="icon-btn h-10 w-10"
              onClick={onImport}
              title="Import archive"
              aria-label="Import archive"
            >
              <CirclePlus size={19} />
            </button>
            <button
              type="button"
              className="icon-btn h-10 w-10"
              onClick={() => updateSettings({ sidebarCollapsed: false })}
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <PanelLeftOpen size={18} />
            </button>
          </div>
          <div className="my-4 h-px w-7 bg-white/[0.08]" />
          <div className="no-scrollbar flex min-h-0 flex-1 flex-col items-center gap-2.5 overflow-y-auto px-2 py-1">
            {conversations.map((conversation) => {
              const selected = conversation.id === activeConversation?.id
              return (
                <button
                  key={conversation.id}
                  type="button"
                  className={cn(
                    'relative rounded-full transition-all',
                    selected ? 'ring-2 ring-violet-400 ring-offset-2 ring-offset-ink-850' : 'opacity-70 hover:opacity-100',
                  )}
                  onClick={() => onSelectConversation(conversation.id)}
                  title={conversation.title}
                  aria-label={`Open conversation with ${conversation.title}`}
                >
                  <Avatar
                    name={conversation.title}
                    size={38}
                    isGroup={conversation.isGroup}
                  />
                </button>
              )
            })}
          </div>
          <button
            type="button"
            className="icon-btn mt-3 h-10 w-10"
            onClick={onSettings}
            title="Settings"
            aria-label="Settings"
          >
            <Settings2 size={18} />
          </button>
        </aside>
        <div className="flex h-full w-full flex-col bg-ink-850 lg:hidden">
          <SidebarMobileHeader
            onImport={onImport}
            onSettings={onSettings}
            query={query}
            setQuery={setQuery}
          />
          <ConversationListMobile
            conversations={filtered}
            activeId={activeConversation?.id}
            onSelect={onSelectConversation}
            previewFor={previewFor}
          />
        </div>
      </>
    )
  }

  return (
    <>
      <aside className="hidden h-full w-[332px] shrink-0 flex-col border-r border-white/[0.065] bg-ink-850 lg:flex">
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <Wordmark />
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              className="icon-btn"
              onClick={onImport}
              title="Import archive"
              aria-label="Import archive"
            >
              <CirclePlus size={18} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={onSettings}
              title="Settings"
              aria-label="Settings"
            >
              <Settings2 size={17} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => updateSettings({ sidebarCollapsed: true })}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose size={17} />
            </button>
          </div>
        </div>

        <div className="px-4 pb-2 pt-2" ref={archiveRef}>
          <div className="relative">
            <button
              type="button"
              className="flex w-full items-center gap-2.5 rounded-xl border border-white/[0.075] bg-ink-800 px-3 py-2 text-left transition-colors hover:border-violet-400/25"
              onClick={() => setArchiveOpen((open) => !open)}
              aria-haspopup="listbox"
              aria-expanded={archiveOpen}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-500/12 text-violet-300">
                <Archive size={12} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-medium text-fog-200">
                  {activeArchive?.name ?? 'No archive loaded'}
                </span>
                <span className="mt-0.5 block truncate text-[9px] text-fog-500">
                  {activeArchive
                    ? `${formatCount(activeArchive.conversationCount)} conversations · ${formatCount(activeArchive.messageCount)} messages`
                    : 'Import an Instagram export to begin'}
                </span>
              </span>
              <ChevronDown
                size={14}
                className={cn('shrink-0 text-fog-500 transition-transform', archiveOpen && 'rotate-180')}
              />
            </button>
            {archiveOpen ? (
              <div className="animate-scale-in absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-white/[0.09] bg-ink-850 shadow-panel">
                <div className="max-h-64 overflow-y-auto p-1.5">
                  {archives.map((archive) => {
                    const selected = archive.id === activeArchive?.id
                    return (
                      <button
                        key={archive.id}
                        type="button"
                        className={cn(
                          'flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                          selected ? 'bg-violet-500/[0.12]' : 'hover:bg-white/[0.045]',
                        )}
                        onClick={() => {
                          selectArchive(archive.id)
                          setArchiveOpen(false)
                        }}
                      >
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/[0.04]">
                          {selected ? (
                            <Check size={12} className="text-violet-300" />
                          ) : (
                            <Archive size={11} className="text-fog-500" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11.5px] font-medium text-fog-200">
                            {archive.name}
                          </span>
                          <span className="mt-0.5 block text-[9.5px] text-fog-500">
                            {formatCount(archive.messageCount)} messages ·{' '}
                            {new Date(archive.importedAt).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 border-t border-white/[0.06] px-3.5 py-2.5 text-[11px] text-violet-300 transition-colors hover:bg-white/[0.03]"
                  onClick={() => {
                    setArchiveOpen(false)
                    onImport()
                  }}
                >
                  <CirclePlus size={13} />
                  Import another archive
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="px-4 pb-2">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fog-500"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search conversations"
              className="field h-9 pl-8 pr-8 text-[11.5px]"
              aria-label="Search conversations and participants"
            />
            {query ? (
              <button
                type="button"
                className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-fog-500 hover:bg-white/[0.06] hover:text-fog-200"
                onClick={() => setQuery('')}
                aria-label="Clear conversation search"
              >
                <X size={12} />
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between px-4 pb-1.5 pt-1">
          <span className="section-label">
            {query ? `${filtered.length} found` : 'Conversations'}
          </span>
          <select
            value={settings.conversationSort}
            onChange={(event) =>
              updateSettings({
                conversationSort: event.target.value as typeof settings.conversationSort,
              })
            }
            className="cursor-pointer appearance-none rounded-md border-0 bg-transparent py-1 pl-1 pr-4 text-[9.5px] text-fog-500 hover:text-fog-300 focus:outline-none"
            aria-label="Sort conversations"
          >
            <option value="recent">Recent</option>
            <option value="oldest">Oldest activity</option>
            <option value="messages">Most messages</option>
            <option value="title">Title A–Z</option>
          </select>
        </div>

        <div className="min-h-0 flex-1">
          {conversationsLoading ? (
            <div className="space-y-2 px-3 py-2">
              {Array.from({ length: 8 }, (_, index) => (
                <div key={index} className="flex items-center gap-3 rounded-xl px-2 py-2">
                  <div className="skeleton h-11 w-11 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-2.5 w-1/2 rounded" />
                    <div className="skeleton h-2 w-3/4 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length ? (
            <Virtuoso
              ref={listRef}
              data={filtered}
              style={{ height: '100%' }}
              computeItemKey={(_, conversation) => conversation.id}
              itemContent={(_, conversation) => (
                <ConversationRow
                  conversation={conversation}
                  selected={conversation.id === activeConversation?.id}
                  preview={previewFor(conversation)}
                  onSelect={onSelectConversation}
                />
              )}
              increaseViewportBy={400}
            />
          ) : (
            <div className="flex flex-col items-center px-8 py-14 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.025] text-fog-500">
                <Search size={19} />
              </div>
              <p className="mt-3 text-[12px] font-medium text-fog-300">
                {query ? 'No conversations match' : 'No conversations yet'}
              </p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-fog-500">
                {query
                  ? 'Try a participant name, group title, or a word from the last message.'
                  : 'Import an extracted Instagram export to start reading.'}
              </p>
              {!query ? (
                <button type="button" className="btn-secondary mt-4" onClick={onImport}>
                  <FolderUp size={14} />
                  Import archive
                </button>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/[0.055] px-4 py-2.5">
          <span className="flex items-center gap-1.5 text-[9px] text-fog-500">
            <LockKeyhole size={10} className="text-violet-400/80" />
            Local only · no network
          </span>
          <button
            type="button"
            className="text-[9px] text-fog-500 transition-colors hover:text-fog-300"
            onClick={onSettings}
          >
            Storage & privacy
          </button>
        </div>
      </aside>

      <div className="flex h-full w-full flex-col bg-ink-850 lg:hidden">
        <SidebarMobileHeader
          onImport={onImport}
          onSettings={onSettings}
          query={query}
          setQuery={setQuery}
        />
        <div className="min-h-0 flex-1">
          <ConversationListMobile
            conversations={filtered}
            activeId={activeConversation?.id}
            onSelect={onSelectConversation}
            previewFor={previewFor}
          />
        </div>
        <div className="flex items-center justify-between border-t border-white/[0.055] px-4 py-2.5">
          <span className="flex items-center gap-1.5 text-[9px] text-fog-500">
            <LockKeyhole size={10} className="text-violet-400/80" />
            Local only · no network
          </span>
          <button
            type="button"
            className="text-[9px] text-fog-500 transition-colors hover:text-fog-300"
            onClick={onSettings}
          >
            Storage & privacy
          </button>
        </div>
      </div>
    </>
  )
}

function SidebarMobileHeader({
  onImport,
  onSettings,
  query,
  setQuery,
}: {
  onImport: () => void
  onSettings: () => void
  query: string
  setQuery: (value: string) => void
}) {
  return (
    <>
      <div className="flex items-center justify-between px-4 pb-3 pt-4">
        <Wordmark />
        <div className="flex items-center gap-0.5">
          <button type="button" className="icon-btn" onClick={onImport} aria-label="Import archive">
            <CirclePlus size={18} />
          </button>
          <button type="button" className="icon-btn" onClick={onSettings} aria-label="Settings">
            <Settings2 size={17} />
          </button>
        </div>
      </div>
      <div className="px-4 pb-2">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fog-500"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search conversations"
            className="field h-9 pl-8 pr-8 text-[11.5px]"
            aria-label="Search conversations and participants"
          />
          {query ? (
            <button
              type="button"
              className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-fog-500 hover:text-fog-200"
              onClick={() => setQuery('')}
              aria-label="Clear conversation search"
            >
              <X size={12} />
            </button>
          ) : null}
        </div>
      </div>
    </>
  )
}

function ConversationListMobile({
  conversations,
  activeId,
  onSelect,
  previewFor,
}: {
  conversations: Conversation[]
  activeId?: string
  onSelect: (id: string) => void
  previewFor: (conversation: Conversation) => string
}) {
  return (
    <div className="no-scrollbar overflow-y-auto">
      {conversations.map((conversation) => (
        <ConversationRow
          key={conversation.id}
          conversation={conversation}
          selected={conversation.id === activeId}
          preview={previewFor(conversation)}
          onSelect={onSelect}
        />
      ))}
      {!conversations.length ? (
        <p className="px-6 py-12 text-center text-[11px] text-fog-500">No conversations match.</p>
      ) : null}
    </div>
  )
}

function ConversationRow({
  conversation,
  selected,
  preview,
  onSelect,
}: {
  conversation: Conversation
  selected: boolean
  preview: string
  onSelect: (id: string) => void
}) {
  return (
    <button
      type="button"
      className={cn(
        'group relative flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150',
        selected
          ? 'bg-[linear-gradient(90deg,rgba(139,92,246,0.15),rgba(139,92,246,0.025)_70%,transparent)]'
          : 'hover:bg-white/[0.028]',
      )}
      onClick={() => onSelect(conversation.id)}
      aria-current={selected ? 'true' : undefined}
      title={`${conversation.title} · ${formatCount(conversation.messageCount)} messages`}
    >
      {selected ? (
        <span className="absolute left-0 top-1/2 h-7 w-[2px] -translate-y-1/2 rounded-r-full bg-violet-400" />
      ) : null}
      <Avatar name={conversation.title} size={44} isGroup={conversation.isGroup} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-[12.5px] font-medium',
              selected ? 'text-fog-100' : 'text-fog-200',
            )}
          >
            {conversation.title}
          </span>
          <span className="shrink-0 text-[9px] text-fog-500">
            {conversation.lastTimestampMs ? formatCompactTime(conversation.lastTimestampMs) : '—'}
          </span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5">
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-[10.5px]',
              selected ? 'text-fog-300' : 'text-fog-500',
            )}
          >
            {preview}
          </span>
          {conversation.isMessageRequest ? (
            <span className="shrink-0 rounded border border-sun-500/25 px-1 py-0.5 text-[7.5px] font-semibold uppercase tracking-[0.1em] text-sun-500">
              req
            </span>
          ) : null}
        </span>
        {conversation.isGroup ? (
          <span className="mt-0.5 block truncate text-[9px] text-fog-600">
            {conversation.participants
              .filter((participant) => !participant.isOwner)
              .map((participant) => participant.name)
              .join(', ')}
          </span>
        ) : null}
      </span>
    </button>
  )
}
