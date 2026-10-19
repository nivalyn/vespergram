import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  ArchiveRecord,
  Conversation,
  MediaAccessState,
  Message,
  Settings,
} from '../types'
import {
  DEFAULT_SETTINGS,
  clearArchiveDatabase,
  deleteArchive as deleteArchiveFromDb,
  loadArchives,
  loadConversations,
  loadMessages,
  loadSettings,
  saveSettings,
  updateArchive as updateArchiveInDb,
} from '../lib/db/database'
import { makeFileIndex, permissionState, type ArchiveSource } from '../lib/fs/archiveSource'
import type { MediaSource } from '../lib/media/mediaResolver'
import type { ImportResult } from '../lib/import/importArchive'
import { randomId } from '../lib/hash'

export interface Notice {
  id: string
  kind: 'info' | 'success' | 'error'
  title: string
  message?: string
}

interface AppContextValue {
  bootState: 'loading' | 'ready' | 'error'
  bootError: string | null
  archives: ArchiveRecord[]
  activeArchive: ArchiveRecord | null
  conversations: Conversation[]
  activeConversation: Conversation | null
  messages: Message[]
  conversationsLoading: boolean
  messagesLoading: boolean
  mediaSource: MediaSource
  mediaStatus: MediaAccessState['status']
  settings: Settings
  notices: Notice[]
  deletingArchiveId: string | null
  updateSettings: (patch: Partial<Settings>) => void
  selectConversation: (conversationId: string) => void
  selectArchive: (archiveId: string) => void
  adoptImport: (result: ImportResult) => void
  removeArchive: (archiveId: string) => Promise<void>
  removeAllData: () => Promise<void>
  updateOwner: (username: string) => Promise<void>
  linkArchiveFolder: (source: ArchiveSource) => Promise<void>
  reconnectMedia: () => Promise<void>
  recordScrollPosition: (conversationId: string, messageId: string) => void
  pushNotice: (kind: Notice['kind'], title: string, message?: string) => void
  dismissNotice: (id: string) => void
}

const AppContext = createContext<AppContextValue | null>(null)

function applyOwner(conversations: Conversation[], ownerUsername: string): Conversation[] {
  const ownerKey = ownerUsername.trim().toLocaleLowerCase('en')
  return conversations.map((conversation) => {
    const participants = conversation.participants.map((participant) => ({
      ...participant,
      isOwner: Boolean(ownerKey) && participant.name.toLocaleLowerCase('en') === ownerKey,
    }))
    if (
      ownerKey &&
      !participants.some((participant) => participant.isOwner) &&
      !conversation.isGroup
    ) {
      participants.push({ name: ownerUsername.trim(), isOwner: true })
    }
    return { ...conversation, participants }
  })
}

async function resolveMediaAccess(
  archive: ArchiveRecord,
  sessionSources: Map<string, MediaSource>,
): Promise<{ source: MediaSource; status: MediaAccessState['status'] }> {
  const session = sessionSources.get(archive.id)
  if (session) {
    return { source: session, status: session.type === 'handle' ? 'linked' : 'session' }
  }
  if (archive.directoryHandle) {
    const permission = await permissionState(archive.directoryHandle, false)
    if (permission === 'granted') {
      return { source: { type: 'handle', root: archive.directoryHandle }, status: 'linked' }
    }
    if (permission === 'prompt') {
      return {
        source: { type: 'handle', root: archive.directoryHandle },
        status: 'permission-required',
      }
    }
    return { source: null, status: 'unavailable' }
  }
  return { source: null, status: archive.mediaMatchedCount > 0 ? 'none' : 'none' }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [bootState, setBootState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [bootError, setBootError] = useState<string | null>(null)
  const [archives, setArchives] = useState<ArchiveRecord[]>([])
  const [activeArchive, setActiveArchive] = useState<ArchiveRecord | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [conversationsLoading, setConversationsLoading] = useState(false)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [mediaSource, setMediaSource] = useState<MediaSource>(null)
  const [mediaStatus, setMediaStatus] = useState<MediaAccessState['status']>('none')
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS })
  const [notices, setNotices] = useState<Notice[]>([])
  const [deletingArchiveId, setDeletingArchiveId] = useState<string | null>(null)

  const hydrated = useRef(false)
  const sessionSources = useRef(new Map<string, MediaSource>())
  const conversationLoadToken = useRef(0)
  const archiveLoadToken = useRef(0)
  const activeConversationIdRef = useRef<string | null>(null)

  const pushNotice = useCallback(
    (kind: Notice['kind'], title: string, message?: string) => {
      const id = randomId('n_')
      setNotices((current) => [...current.slice(-3), { id, kind, title, message }])
      window.setTimeout(() => {
        setNotices((current) => current.filter((notice) => notice.id !== id))
      }, kind === 'error' ? 9_000 : 5_500)
    },
    [],
  )

  const dismissNotice = useCallback((id: string) => {
    setNotices((current) => current.filter((notice) => notice.id !== id))
  }, [])

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => ({ ...current, ...patch }))
  }, [])

  const loadConversation = useCallback(
    async (conversationId: string, initialMessages?: Message[]) => {
      const token = ++conversationLoadToken.current
      activeConversationIdRef.current = conversationId
      setActiveConversationId(conversationId)
      setMessagesLoading(true)
      if (!initialMessages) setMessages([])
      try {
        const loaded = initialMessages ?? (await loadMessages(conversationId))
        if (token !== conversationLoadToken.current) return
        setMessages(loaded)
        setMessagesLoading(false)
      } catch (error) {
        if (token !== conversationLoadToken.current) return
        setMessages([])
        setMessagesLoading(false)
        pushNotice(
          'error',
          'Could not load this conversation',
          error instanceof Error ? error.message : 'Local storage read failed.',
        )
      }
    },
    [pushNotice],
  )

  const openArchive = useCallback(
    async (archive: ArchiveRecord, preferredConversationId?: string | null) => {
      const token = ++archiveLoadToken.current
      setConversationsLoading(true)
      setActiveArchive(archive)
      setConversations([])
      setMessages([])
      setActiveConversationId(null)
      activeConversationIdRef.current = null
      try {
        const [loadedConversations, access] = await Promise.all([
          loadConversations(archive.id),
          resolveMediaAccess(archive, sessionSources.current),
        ])
        if (token !== archiveLoadToken.current) return
        const withOwners = applyOwner(loadedConversations, archive.ownerUsername)
        setConversations(withOwners)
        setMediaSource(access.source)
        setMediaStatus(access.status)
        setConversationsLoading(false)

        const preferred = preferredConversationId
          ? withOwners.find((conversation) => conversation.id === preferredConversationId)
          : null
        const nextConversation = preferred ?? withOwners[0] ?? null
        if (nextConversation) {
          await loadConversation(nextConversation.id)
          if (token === archiveLoadToken.current) {
            updateSettings({
              activeArchiveId: archive.id,
              activeConversationId: nextConversation.id,
            })
          }
        } else {
          updateSettings({ activeArchiveId: archive.id, activeConversationId: null })
          setMessagesLoading(false)
        }
      } catch (error) {
        if (token !== archiveLoadToken.current) return
        setConversationsLoading(false)
        setMessagesLoading(false)
        pushNotice(
          'error',
          'Could not open the archive',
          error instanceof Error ? error.message : 'Unknown local storage error.',
        )
      }
    },
    [loadConversation, pushNotice, updateSettings],
  )

  useEffect(() => {
    let cancelled = false
    const boot = async () => {
      try {
        const [storedSettings, storedArchives] = await Promise.all([loadSettings(), loadArchives()])
        if (cancelled) return
        setSettings(storedSettings)
        setArchives(storedArchives)
        hydrated.current = true

        const archive =
          storedArchives.find((entry) => entry.id === storedSettings.activeArchiveId) ??
          storedArchives[0] ??
          null
        if (archive) {
          await openArchive(archive, storedSettings.activeConversationId)
        }
        if (!cancelled) setBootState('ready')
      } catch (error) {
        if (cancelled) return
        setBootError(error instanceof Error ? error.message : 'Could not open local storage.')
        setBootState('error')
      }
    }
    void boot()
    return () => {
      cancelled = true
    }
  }, [openArchive])

  useEffect(() => {
    if (!hydrated.current) return
    const timer = window.setTimeout(() => {
      void saveSettings(settings).catch(() => {
        // Storage may be unavailable in private browsing. The reader still
        // works for the current session, so do not interrupt the user.
      })
    }, 250)
    return () => window.clearTimeout(timer)
  }, [settings])

  const selectConversation = useCallback(
    (conversationId: string) => {
      if (!activeArchive) return
      if (conversationId === activeConversationIdRef.current) return
      void loadConversation(conversationId)
      updateSettings({ activeArchiveId: activeArchive.id, activeConversationId: conversationId })
    },
    [activeArchive, loadConversation, updateSettings],
  )

  const selectArchive = useCallback(
    (archiveId: string) => {
      const archive = archives.find((entry) => entry.id === archiveId)
      if (!archive) return
      void openArchive(archive, settings.activeConversationId)
    },
    [archives, openArchive, settings.activeConversationId],
  )

  const adoptImport = useCallback(
    (result: ImportResult) => {
      sessionSources.current.set(result.archive.id, result.mediaSource)
      setArchives((current) => [
        result.archive,
        ...current.filter((entry) => entry.id !== result.archive.id),
      ])
      const sorted = [...result.conversations].sort(
        (a, b) => (b.lastTimestampMs ?? 0) - (a.lastTimestampMs ?? 0),
      )
      const withOwners = applyOwner(sorted, result.archive.ownerUsername)
      setActiveArchive(result.archive)
      setConversations(withOwners)
      setConversationsLoading(false)
      setMediaSource(result.mediaSource)
      setMediaStatus(
        result.archive.directoryHandle
          ? 'linked'
          : result.archive.mediaMatchedCount > 0
            ? 'session'
            : 'none',
      )
      setBootState('ready')
      const first = withOwners[0] ?? null
      if (first) {
        activeConversationIdRef.current = first.id
        setActiveConversationId(first.id)
        setMessages(result.messages.filter((message) => message.conversationId === first.id))
        setMessagesLoading(false)
        updateSettings({
          activeArchiveId: result.archive.id,
          activeConversationId: first.id,
        })
      } else {
        setActiveConversationId(null)
        setMessages([])
        setMessagesLoading(false)
        updateSettings({ activeArchiveId: result.archive.id, activeConversationId: null })
      }
    },
    [updateSettings],
  )

  const removeArchive = useCallback(
    async (archiveId: string) => {
      setDeletingArchiveId(archiveId)
      try {
        await deleteArchiveFromDb(archiveId)
        sessionSources.current.delete(archiveId)
        const remaining = archives.filter((archive) => archive.id !== archiveId)
        setArchives(remaining)
        if (activeArchive?.id === archiveId) {
          const next = remaining[0] ?? null
          if (next) {
            await openArchive(next, null)
          } else {
            setActiveArchive(null)
            setConversations([])
            setMessages([])
            setActiveConversationId(null)
            activeConversationIdRef.current = null
            setMediaSource(null)
            setMediaStatus('none')
            updateSettings({
              activeArchiveId: null,
              activeConversationId: null,
              lastReadMessageId: null,
            })
          }
        }
        pushNotice('success', 'Archive removed', 'Messages and derived indexes were deleted from this browser.')
      } catch (error) {
        pushNotice(
          'error',
          'Could not remove the archive',
          error instanceof Error ? error.message : 'Local storage deletion failed.',
        )
      } finally {
        setDeletingArchiveId(null)
      }
    },
    [activeArchive?.id, archives, openArchive, pushNotice, updateSettings],
  )

  const removeAllData = useCallback(async () => {
    try {
      await clearArchiveDatabase()
      sessionSources.current.clear()
      setArchives([])
      setActiveArchive(null)
      setConversations([])
      setMessages([])
      setActiveConversationId(null)
      activeConversationIdRef.current = null
      setMediaSource(null)
      setMediaStatus('none')
      setSettings({ ...DEFAULT_SETTINGS })
      conversationLoadToken.current++
      archiveLoadToken.current++
      pushNotice('success', 'All local archive data removed', 'The browser database is now empty.')
    } catch (error) {
      pushNotice(
        'error',
        'Could not clear local data',
        error instanceof Error ? error.message : 'Local storage deletion failed.',
      )
    }
  }, [pushNotice])

  const updateOwner = useCallback(
    async (username: string) => {
      if (!activeArchive) return
      const trimmed = username.trim()
      const updated: ArchiveRecord = {
        ...activeArchive,
        name: trimmed ? `@${trimmed} · archive` : activeArchive.rootLabel,
        ownerUsername: trimmed,
        ownerSource: trimmed ? 'manual' : 'unknown',
        ownerConfidence: 'high',
        updatedAt: Date.now(),
      }
      try {
        await updateArchiveInDb(updated)
        setActiveArchive(updated)
        setArchives((current) =>
          current.map((entry) => (entry.id === updated.id ? updated : entry)),
        )
        setConversations((current) => applyOwner(current, trimmed))
        pushNotice('success', 'Message authorship updated', trimmed ? `Your messages are now marked as @${trimmed}.` : 'Ownership cleared.')
      } catch (error) {
        pushNotice(
          'error',
          'Could not update your username',
          error instanceof Error ? error.message : 'Local storage write failed.',
        )
      }
    },
    [activeArchive, pushNotice],
  )

  const linkArchiveFolder = useCallback(
    async (source: ArchiveSource) => {
      if (!activeArchive) return
      const handle = source.directoryHandle
      let updated = activeArchive
      if (handle) {
        updated = {
          ...activeArchive,
          directoryHandle: handle,
          sourceKind: 'directory',
          hasLinkedMedia: activeArchive.mediaCount > 0,
          updatedAt: Date.now(),
        }
        await updateArchiveInDb(updated).catch(() => undefined)
        setActiveArchive(updated)
        setArchives((current) =>
          current.map((entry) => (entry.id === updated.id ? updated : entry)),
        )
        sessionSources.current.set(updated.id, { type: 'handle', root: handle })
        setMediaSource({ type: 'handle', root: handle })
        setMediaStatus('linked')
        pushNotice('success', 'Folder linked', 'Media will be read directly from the selected folder. Nothing was uploaded.')
      } else {
        const index = makeFileIndex(source.files)
        const media: MediaSource = { type: 'session', index }
        sessionSources.current.set(activeArchive.id, media)
        setMediaSource(media)
        setMediaStatus('session')
        pushNotice('success', 'Folder linked for this session', 'Media will be available until this tab is closed.')
      }
    },
    [activeArchive, pushNotice],
  )

  const reconnectMedia = useCallback(async () => {
    if (!activeArchive) return
    const handle = activeArchive.directoryHandle
    if (!handle) {
      pushNotice(
        'info',
        'No linked folder',
        'Use “Link archive folder” to grant access to the extracted media files.',
      )
      return
    }
    const permission = await permissionState(handle, true)
    if (permission === 'granted') {
      sessionSources.current.set(activeArchive.id, { type: 'handle', root: handle })
      setMediaSource({ type: 'handle', root: handle })
      setMediaStatus('linked')
      pushNotice('success', 'Media reconnected', 'Reading files directly from your archive folder.')
    } else {
      pushNotice('error', 'Folder permission was not granted', 'Your browser did not allow read access.')
    }
  }, [activeArchive, pushNotice])

  const recordScrollPosition = useCallback((conversationId: string, messageId: string) => {
    setSettings((current) => {
      if (current.scrollPositions[conversationId] === messageId) return current
      const nextPositions = { ...current.scrollPositions, [conversationId]: messageId }
      const keys = Object.keys(nextPositions)
      if (keys.length > 250) {
        for (const key of keys.slice(0, keys.length - 250)) delete nextPositions[key]
      }
      return { ...current, scrollPositions: nextPositions }
    })
  }, [])

  const activeConversation = activeConversationId
    ? conversations.find((conversation) => conversation.id === activeConversationId) ?? null
    : null

  const value: AppContextValue = {
    bootState,
    bootError,
    archives,
    activeArchive,
    conversations,
    activeConversation,
    messages,
    conversationsLoading,
    messagesLoading,
    mediaSource,
    mediaStatus,
    settings,
    notices,
    deletingArchiveId,
    updateSettings,
    selectConversation,
    selectArchive,
    adoptImport,
    removeArchive,
    removeAllData,
    updateOwner,
    linkArchiveFolder,
    reconnectMedia,
    recordScrollPosition,
    pushNotice,
    dismissNotice,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used inside AppProvider')
  return context
}

export function scrollAnchorFor(settings: Settings, conversationId: string): string | null {
  return settings.scrollPositions[conversationId] ?? null
}
