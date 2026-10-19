import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react'
import {
  ArrowRight,
  CalendarRange,
  FileJson,
  FolderOpen,
  Layers,
  Loader2,
  LockKeyhole,
  MessageSquare,
  Search,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Zap,
} from 'lucide-react'
import { useApp } from './state/AppContext'
import { Sidebar } from './components/sidebar/Sidebar'
import { ChatPanel, type ChatPanelHandle } from './components/chat/ChatPanel'
import { DetailsPanel } from './components/details/DetailsPanel'
import { ImportDialog } from './components/import/ImportDialog'
import { MediaViewer, type ViewerState } from './components/media/MediaViewer'
import { SettingsDialog } from './components/settings/SettingsDialog'
import { GlobalSearch } from './components/search/GlobalSearch'
import { Toasts } from './components/common/Toasts'
import { Wordmark, VesperMark } from './components/common/Avatar'
import { useReducedMotion } from './hooks/useReducedMotion'
import {
  filesFromFileList,
  pickArchiveDirectory,
  rootLabelForFiles,
  supportsDirectoryPicker,
} from './lib/fs/archiveSource'
import { formatCount, formatDate } from './lib/dates'
import { cn } from './lib/cn'

export default function App() {
  const {
    bootState,
    bootError,
    archives,
    activeArchive,
    activeConversation,
    conversations,
    messages,
    mediaSource,
    settings,
    updateSettings,
    selectConversation,
    linkArchiveFolder,
    pushNotice,
  } = useApp()

  const [importOpen, setImportOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [detailsOverlayOpen, setDetailsOverlayOpen] = useState(false)
  const [mobileConversationOpen, setMobileConversationOpen] = useState(
    Boolean(activeConversation),
  )
  const [viewer, setViewer] = useState<ViewerState | null>(null)
  const chatRef = useRef<ChatPanelHandle>(null)
  const linkInputRef = useRef<HTMLInputElement>(null)
  const pendingJump = useRef<{ conversationId: string; messageId: string } | null>(null)
  const reducedMotion = useReducedMotion()

  const visualAttachments = useMemo(
    () =>
      messages.flatMap((message) =>
        message.attachments.filter((attachment) => !attachment.thumbnail),
      ),
    [messages],
  )

  useEffect(() => {
    document.documentElement.style.setProperty('--msg-font-size', `${settings.fontSize}px`)
    document.documentElement.dataset.density = settings.density
    document.documentElement.dataset.motion = reducedMotion ? 'reduce' : 'full'
  }, [reducedMotion, settings.density, settings.fontSize])

  useEffect(() => {
    document.title = activeConversation
      ? `${activeConversation.title} · Vesper`
      : 'Vesper — Instagram DM Archive'
  }, [activeConversation])

  useEffect(() => {
    const input = linkInputRef.current
    if (!input) return
    input.setAttribute('webkitdirectory', '')
    input.setAttribute('directory', '')
  }, [])

  useEffect(() => {
    if (activeConversation) setMobileConversationOpen(true)
    else if (archives.length) setMobileConversationOpen(false)
  }, [activeConversation, archives.length])

  useEffect(() => {
    if (!pendingJump.current || !activeConversation || !messages.length) return
    if (pendingJump.current.conversationId !== activeConversation.id) return
    const jump = pendingJump.current
    const attempt = window.setTimeout(() => {
      if (chatRef.current?.scrollToMessage(jump.messageId)) {
        pendingJump.current = null
      }
    }, 180)
    return () => window.clearTimeout(attempt)
  }, [activeConversation, messages])

  const openMessage = useCallback(
    (conversationId: string, messageId: string) => {
      setMobileConversationOpen(true)
      setDetailsOverlayOpen(false)
      if (activeConversation?.id === conversationId) {
        chatRef.current?.scrollToMessage(messageId)
        return
      }
      pendingJump.current = { conversationId, messageId }
      updateSettings({
        scrollPositions: {
          ...settings.scrollPositions,
          [conversationId]: messageId,
        },
      })
      selectConversation(conversationId)
    },
    [activeConversation?.id, selectConversation, settings.scrollPositions, updateSettings],
  )

  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      setMobileConversationOpen(true)
      setDetailsOverlayOpen(false)
      selectConversation(conversationId)
    },
    [selectConversation],
  )

  const toggleDetails = useCallback(() => {
    const desktop = window.matchMedia('(min-width: 1280px)').matches
    if (desktop) updateSettings({ detailsOpen: !settings.detailsOpen })
    else setDetailsOverlayOpen((open) => !open)
  }, [settings.detailsOpen, updateSettings])

  const closeDetails = useCallback(() => {
    setDetailsOverlayOpen(false)
    if (window.matchMedia('(min-width: 1280px)').matches) {
      updateSettings({ detailsOpen: false })
    }
  }, [updateSettings])

  const handleLinkFolder = useCallback(async () => {
    if (!activeArchive) return
    try {
      if (supportsDirectoryPicker()) {
        const source = await pickArchiveDirectory()
        if (source) await linkArchiveFolder(source)
      } else {
        linkInputRef.current?.click()
      }
    } catch (error) {
      pushNotice(
        'error',
        'Could not link the folder',
        error instanceof Error ? error.message : 'The folder picker failed.',
      )
    }
  }, [activeArchive, linkArchiveFolder, pushNotice])

  const onLinkInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = filesFromFileList(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    try {
      await linkArchiveFolder({
        kind: 'directory',
        rootLabel: rootLabelForFiles(files),
        directoryHandle: null,
        files,
      })
    } catch (error) {
      pushNotice(
        'error',
        'Could not link these files',
        error instanceof Error ? error.message : 'The selected files could not be indexed.',
      )
    }
  }

  const openMedia = useCallback(
    (attachment: (typeof visualAttachments)[number]) => {
      const index = visualAttachments.findIndex((entry) => entry.id === attachment.id)
      setViewer({
        attachments: visualAttachments,
        index: Math.max(0, index),
      })
    },
    [visualAttachments],
  )

  useEffect(() => {
    const isEditable = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false
      return (
        target.isContentEditable ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'
      )
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey
      if (modifier && event.key.toLocaleLowerCase('en') === 'k') {
        if (settingsOpen || importOpen || viewer) return
        event.preventDefault()
        setSearchOpen(true)
        return
      }

      if (event.key === 'Escape') {
        if (viewer) {
          setViewer(null)
          return
        }
        if (searchOpen) {
          setSearchOpen(false)
          return
        }
        if (settingsOpen) {
          setSettingsOpen(false)
          return
        }
        if (importOpen) {
          setImportOpen(false)
          return
        }
        if (detailsOverlayOpen) {
          setDetailsOverlayOpen(false)
          return
        }
        chatRef.current?.closeOverlays()
        return
      }

      if (isEditable(event.target)) return
      if (!activeConversation) return

      if (event.key === '/') {
        event.preventDefault()
        chatRef.current?.focusSearch()
      } else if (event.key === 'Home') {
        event.preventDefault()
        chatRef.current?.jumpToBeginning()
      } else if (event.key === 'End') {
        event.preventDefault()
        chatRef.current?.jumpToLatest()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    activeConversation,
    detailsOverlayOpen,
    importOpen,
    searchOpen,
    settingsOpen,
    viewer,
  ])

  if (bootState === 'loading') {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-5 bg-black">
        <VesperMark size={52} />
        <div className="flex items-center gap-2 text-[11px] text-fog-500">
          <Loader2 size={13} className="animate-spin text-violet-400" />
          Opening your local archive…
        </div>
      </div>
    )
  }

  if (bootState === 'error') {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center bg-black px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-pink-600/25 bg-pink-600/10 text-pink-400">
          <ShieldCheck size={21} />
        </div>
        <h1 className="mt-4 font-display text-[18px] font-semibold text-fog-100">
          Local storage could not be opened
        </h1>
        <p className="mt-2 max-w-md text-[11.5px] leading-relaxed text-fog-500">
          {bootError ??
            'Your browser blocked IndexedDB. Private browsing or a storage policy may be responsible.'}
        </p>
        <button type="button" className="btn-primary mt-5" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    )
  }

  const hasArchives = archives.length > 0

  return (
    <>
      <input
        ref={linkInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => void onLinkInput(event)}
        tabIndex={-1}
        aria-hidden="true"
      />

      {hasArchives ? (
        <div className="flex h-[100dvh] w-full overflow-hidden bg-black text-fog-100">
          <div
            className={cn(
              'h-full w-full shrink-0 lg:flex lg:w-auto',
              mobileConversationOpen && activeConversation ? 'hidden' : 'flex',
            )}
          >
            <Sidebar
              onImport={() => setImportOpen(true)}
              onSettings={() => setSettingsOpen(true)}
              onSelectConversation={handleSelectConversation}
            />
          </div>

          <main
            className={cn(
              'relative min-w-0 flex-1',
              mobileConversationOpen && activeConversation ? 'flex' : 'hidden lg:flex',
            )}
          >
            {activeConversation && activeArchive ? (
              <ChatPanel
                key={activeConversation.id}
                ref={chatRef}
                conversation={activeConversation}
                archive={activeArchive}
                onBack={() => {
                  setMobileConversationOpen(false)
                  setDetailsOverlayOpen(false)
                }}
                onOpenMedia={openMedia}
                onOpenSettings={() => setSettingsOpen(true)}
                onToggleDetails={toggleDetails}
                detailsOpen={settings.detailsOpen || detailsOverlayOpen}
                onLinkFolder={() => void handleLinkFolder()}
              />
            ) : (
              <ArchiveHome
                onImport={() => setImportOpen(true)}
                onSearch={() => setSearchOpen(true)}
                conversationCount={conversations.length}
              />
            )}

            {activeConversation && activeArchive && settings.detailsOpen ? (
              <DetailsPanel
                conversation={activeConversation}
                archive={activeArchive}
                source={mediaSource}
                onClose={closeDetails}
                onOpenMedia={openMedia}
                onOpenSettings={() => setSettingsOpen(true)}
                onLinkFolder={() => void handleLinkFolder()}
              />
            ) : null}

            {activeConversation && activeArchive && detailsOverlayOpen ? (
              <div className="fixed inset-0 z-[70] flex justify-end xl:hidden">
                <button
                  type="button"
                  className="absolute inset-0 bg-black/65 backdrop-blur-[2px]"
                  onClick={() => setDetailsOverlayOpen(false)}
                  aria-label="Close conversation details"
                />
                <div className="animate-slide-in relative h-full">
                  <DetailsPanel
                    variant="overlay"
                    conversation={activeConversation}
                    archive={activeArchive}
                    source={mediaSource}
                    onClose={() => setDetailsOverlayOpen(false)}
                    onOpenMedia={openMedia}
                    onOpenSettings={() => setSettingsOpen(true)}
                    onLinkFolder={() => void handleLinkFolder()}
                  />
                </div>
              </div>
            ) : null}
          </main>
        </div>
      ) : (
        <Welcome
          onImport={() => setImportOpen(true)}
          onSettings={() => setSettingsOpen(true)}
        />
      )}

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onStartAtBeginning={() => {
          setMobileConversationOpen(true)
          window.setTimeout(() => chatRef.current?.jumpToBeginning(), 220)
        }}
      />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onLinkFolder={() => void handleLinkFolder()}
      />
      {hasArchives ? (
        <>
          <GlobalSearch
            open={searchOpen}
            onClose={() => setSearchOpen(false)}
            onSelectMessage={openMessage}
          />
          <MediaViewer
            viewer={viewer}
            source={mediaSource}
            onClose={() => setViewer(null)}
            onChange={(index) =>
              setViewer((current) => (current ? { ...current, index } : current))
            }
          />
        </>
      ) : null}
      <Toasts />
    </>
  )
}

function ArchiveHome({
  onImport,
  onSearch,
  conversationCount,
}: {
  onImport: () => void
  onSearch: () => void
  conversationCount: number
}) {
  const { activeArchive } = useApp()
  return (
    <div className="relative flex h-full flex-1 flex-col items-center justify-center overflow-hidden px-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        style={{
          background:
            'radial-gradient(ellipse 55% 42% at 50% 34%, rgba(139,92,246,0.13), transparent 70%), radial-gradient(ellipse 34% 30% at 70% 72%, rgba(255,60,172,0.07), transparent 70%)',
        }}
      />
      <div className="relative max-w-lg text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-500/20 bg-violet-500/[0.07] text-violet-300 shadow-violet">
          <MessageSquare size={22} />
        </div>
        <h1 className="mt-5 font-display text-[24px] font-semibold tracking-[-0.03em] text-fog-100">
          Pick up a conversation
        </h1>
        <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-fog-500">
          {conversationCount
            ? `${formatCount(conversationCount)} conversations are indexed from ${activeArchive?.name ?? 'this archive'}. Choose one in the sidebar to read its complete history.`
            : 'This archive does not contain any conversation folders yet. Try importing a newer export.'}
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
          <button type="button" className="btn-primary" onClick={onSearch}>
            <Search size={14} />
            Search everything
            <span className="kbd ml-1 border-white/20 bg-white/10 text-white/80">⌘K</span>
          </button>
          <button type="button" className="btn-secondary" onClick={onImport}>
            <UploadCloud size={14} />
            Import another archive
          </button>
        </div>
        {activeArchive ? (
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[9.5px] text-fog-600">
            <span className="flex items-center gap-1.5">
              <CalendarRange size={11} />
              {activeArchive.firstTimestampMs
                ? formatDate(activeArchive.firstTimestampMs)
                : 'Unknown start'}{' '}
              →{' '}
              {activeArchive.lastTimestampMs
                ? formatDate(activeArchive.lastTimestampMs)
                : 'Unknown end'}
            </span>
            <span className="flex items-center gap-1.5">
              <FileJson size={11} />
              {formatCount(activeArchive.sourceFileCount)} source files
            </span>
            <span className="flex items-center gap-1.5">
              <LockKeyhole size={11} />
              Local only
            </span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function Welcome({
  onImport,
  onSettings,
}: {
  onImport: () => void
  onSettings: () => void
}) {
  return (
    <div className="relative h-[100dvh] overflow-y-auto bg-black">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[680px]"
        style={{
          background:
            'radial-gradient(ellipse 52% 58% at 50% -8%, rgba(139,92,246,0.24), transparent 68%), radial-gradient(ellipse 32% 40% at 82% 18%, rgba(255,60,172,0.10), transparent 70%)',
        }}
      />
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Wordmark />
        <div className="flex items-center gap-1.5">
          <button type="button" className="btn-ghost hidden py-2 text-[11px] sm:inline-flex" onClick={onSettings}>
            Settings
          </button>
          <button type="button" className="btn-secondary py-2 text-[11.5px]" onClick={onImport}>
            <FolderOpen size={14} />
            Import archive
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-5xl px-5 pb-16 pt-10 sm:px-8 sm:pt-16">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-500/[0.07] px-3 py-1.5 text-[9.5px] font-medium uppercase tracking-[0.16em] text-violet-200">
            <LockKeyhole size={11} />
            100% local · no login · no upload
          </div>
          <h1 className="mt-6 font-display text-[clamp(34px,7vw,64px)] font-semibold leading-[1.02] tracking-[-0.055em] text-fog-100">
            Your conversations,
            <br />
            <span className="bg-[linear-gradient(105deg,#C4B5FD_0%,#A855F7_38%,#FF3CAC_100%)] bg-clip-text text-transparent">
              finally your own.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[13px] leading-relaxed text-fog-400 sm:text-[14px]">
            Vesper reads the Direct Messages export you downloaded from Instagram and turns it
            into a fast, private archive. Every message, from the latest reply back to the very
            first hello.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
            <button type="button" className="btn-primary w-full px-6 py-3 sm:w-auto" onClick={onImport}>
              <UploadCloud size={17} />
              Open your archive
              <ArrowRight size={15} />
            </button>
            <span className="text-[9.5px] text-fog-500">
              JSON export · processed in your browser
            </span>
          </div>
        </div>

        <div className="mt-16 grid gap-3 sm:grid-cols-3">
          <FeatureCard
            icon={<Layers size={17} />}
            title="One complete timeline"
            text="Numbered message shards are merged, de-duplicated, and ordered. Nothing is truncated — jump from the newest message to the absolute beginning."
          />
          <FeatureCard
            icon={<Zap size={17} />}
            title="Built for long histories"
            text="Hundreds of thousands of messages stay scrollable, searchable, and organized by date with virtualization."
          />
          <FeatureCard
            icon={<ShieldCheck size={17} />}
            title="Yours alone"
            text="No Instagram login, no API, no analytics. Messages are indexed in IndexedDB; photos and videos stay in your folder."
          />
        </div>

        <section className="mt-14 overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.014]">
          <div className="grid gap-px bg-white/[0.055] sm:grid-cols-3">
            <InfoCell
              label="Supported export"
              value="Instagram JSON archive"
              detail="messages/inbox, message_requests, message_N.json"
            />
            <InfoCell
              label="What is preserved"
              value="Text, media, voice, shares"
              detail="Reactions, calls, unsent and unavailable messages"
            />
            <InfoCell
              label="What leaves this device"
              value="Nothing"
              detail="No network requests containing your messages"
            />
          </div>
          <div className="flex flex-col gap-3 px-5 py-4 text-[10px] leading-relaxed text-fog-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <span className="flex items-center gap-2">
              <Sparkles size={12} className="text-sun-500" />
              Export your messages from Instagram: Accounts Center → Your information and
              permissions → Download your information → Messages.
            </span>
            <span className="flex shrink-0 items-center gap-1 text-fog-600">
              <LockKeyhole size={10} />
              Local-first by design
            </span>
          </div>
        </section>

        <section className="mt-10 text-center">
          <p className="section-label">The first message is still there</p>
          <p className="mx-auto mt-2 max-w-lg font-display text-[18px] font-medium tracking-[-0.025em] text-fog-300">
            Open the archive and start where it all began.
          </p>
          <button type="button" className="btn-secondary mt-4" onClick={onImport}>
            <UploadCloud size={14} />
            Import Instagram export
          </button>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/[0.055] px-5 py-5 sm:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 text-[9px] text-fog-600 sm:flex-row">
          <span className="flex items-center gap-2">
            <VesperMark size={18} />
            Vesper — message archive · an independent local reader
          </span>
          <span>Not affiliated with Instagram or Meta. Your export, your device, your data.</span>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  text,
}: {
  icon: ReactNode
  title: string
  text: string
}) {
  return (
    <div className="rounded-2xl border border-white/[0.065] bg-white/[0.016] px-4 py-4">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-400/15 bg-violet-500/[0.08] text-violet-300">
        {icon}
      </span>
      <h2 className="mt-3 text-[12px] font-medium text-fog-200">{title}</h2>
      <p className="mt-1.5 text-[10.5px] leading-relaxed text-fog-500">{text}</p>
    </div>
  )
}

function InfoCell({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="bg-black/35 px-5 py-4 sm:px-6">
      <p className="text-[8.5px] font-semibold uppercase tracking-[0.16em] text-fog-600">
        {label}
      </p>
      <p className="mt-1.5 font-display text-[13px] font-medium text-fog-200">{value}</p>
      <p className="mt-1 text-[9.5px] leading-relaxed text-fog-500">{detail}</p>
    </div>
  )
}
