import { useEffect, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  Archive,
  Check,
  Database,
  FolderOpen,
  HardDrive,
  Keyboard,
  LockKeyhole,
  MonitorSmartphone,
  ShieldCheck,
  Sparkles,
  Trash2,
  Type,
  UserRound,
} from 'lucide-react'
import { Modal } from '../common/Modal'
import { useApp } from '../../state/AppContext'
import {
  getStorageUsage,
  requestPersistentStorage,
} from '../../lib/db/database'
import { formatBytes, formatCount, formatDate } from '../../lib/dates'
import { cn } from '../../lib/cn'

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
  onLinkFolder: () => void
}

export function SettingsDialog({ open, onClose, onLinkFolder }: SettingsDialogProps) {
  const {
    activeArchive,
    archives,
    settings,
    updateSettings,
    updateOwner,
    removeArchive,
    removeAllData,
    deletingArchiveId,
    pushNotice,
  } = useApp()

  const [username, setUsername] = useState('')
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    setUsername(activeArchive?.ownerUsername ?? '')
  }, [activeArchive?.id, activeArchive?.ownerUsername])

  useEffect(() => {
    if (!open) {
      setConfirmRemove(false)
      setConfirmClear(false)
      return
    }
    let active = true
    void getStorageUsage()
      .then((usage) => {
        if (active) setStorage(usage)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [open])

  const persist = async () => {
    const granted = await requestPersistentStorage()
    pushNotice(
      granted ? 'success' : 'info',
      granted ? 'Persistent storage granted' : 'Persistent storage was not granted',
      granted
        ? 'The browser will be less likely to evict your local archive under storage pressure.'
        : 'Your browser may clear local data if storage runs low. Keep your original export as a backup.',
    )
  }

  const saveIdentity = () => {
    void updateOwner(username)
  }

  const confirmDeleteArchive = async () => {
    if (!activeArchive) return
    const name = activeArchive.name
    await removeArchive(activeArchive.id)
    setConfirmRemove(false)
    setConfirmClear(false)
    pushNotice('info', 'Archive deleted', `${name} was removed from this browser.`)
    onClose()
  }

  const confirmDeleteEverything = async () => {
    setClearing(true)
    try {
      await removeAllData()
      setConfirmRemove(false)
      setConfirmClear(false)
      onClose()
    } finally {
      setClearing(false)
    }
  }

  const usagePercent =
    storage && storage.quota > 0 ? Math.min(100, (storage.usage / storage.quota) * 100) : 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Settings & storage"
      description="Reading preferences, authorship, and control over everything stored on this device."
    >
      <div className="no-scrollbar max-h-[min(76vh,760px)] overflow-y-auto">
        <section className="border-b border-white/[0.055] px-5 py-5 sm:px-6">
          <SectionHeading icon={<UserRound size={14} />} title="Your identity" />
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-fog-500">
            Messages from this username are aligned to the right as outgoing. Vesper uses it only
            inside this browser.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-fog-500">
                @
              </span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') saveIdentity()
                }}
                placeholder="your_username"
                className="field h-9 pl-7 text-[12px]"
                aria-label="Your Instagram username"
                autoComplete="off"
                spellCheck={false}
                disabled={!activeArchive}
              />
            </div>
            <button
              type="button"
              className="btn-secondary h-9 px-4 text-[11.5px]"
              onClick={saveIdentity}
              disabled={!activeArchive || username.trim() === activeArchive.ownerUsername}
            >
              <Check size={13} />
              Save
            </button>
          </div>
          <p className="mt-2 text-[9.5px] text-fog-500">
            {activeArchive
              ? activeArchive.ownerSource === 'personal_information'
                ? 'Detected from personal_information.json.'
                : activeArchive.ownerSource === 'inferred'
                  ? 'Inferred from the export folder or participant activity — check that this is correct.'
                  : activeArchive.ownerSource === 'manual'
                    ? 'Set manually for this archive.'
                    : 'Not detected. Outgoing messages cannot be identified until you set this.'
              : 'Import an archive to configure authorship.'}
          </p>
        </section>

        <section className="border-b border-white/[0.055] px-5 py-5 sm:px-6">
          <SectionHeading icon={<Type size={14} />} title="Reading" />
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="font-size" className="text-[11px] text-fog-300">
                  Message text size
                </label>
                <span className="font-mono text-[10px] text-fog-500">{settings.fontSize}px</span>
              </div>
              <input
                id="font-size"
                type="range"
                min={13}
                max={20}
                step={1}
                value={settings.fontSize}
                onChange={(event) => updateSettings({ fontSize: Number(event.target.value) })}
                className="mt-2.5 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-violet-400"
              />
              <p
                className="message-text mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-fog-200"
                aria-hidden="true"
              >
                This is how your messages will look.
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <span className="text-[11px] text-fog-300">Message density</span>
                <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-xl border border-white/[0.07] bg-ink-800 p-1">
                  {(['comfortable', 'compact'] as const).map((density) => (
                    <button
                      key={density}
                      type="button"
                      className={cn(
                        'rounded-lg px-2 py-1.5 text-[10.5px] capitalize transition-colors',
                        settings.density === density
                          ? 'bg-violet-500/20 text-violet-200'
                          : 'text-fog-500 hover:text-fog-300',
                      )}
                      onClick={() => updateSettings({ density })}
                    >
                      {density}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <span>
                  <span className="block text-[11px] text-fog-300">Media gallery</span>
                  <span className="mt-0.5 block text-[9.5px] text-fog-500">
                    Show visual attachments in conversation details.
                  </span>
                </span>
                <span
                  className={cn(
                    'relative h-5 w-9 shrink-0 rounded-full border transition-colors',
                    settings.showMediaGallery
                      ? 'border-violet-400/40 bg-violet-500/50'
                      : 'border-white/10 bg-white/[0.06]',
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={settings.showMediaGallery}
                    onChange={(event) =>
                      updateSettings({ showMediaGallery: event.target.checked })
                    }
                    aria-label="Show media gallery"
                  />
                  <span
                    className={cn(
                      'absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-transform',
                      settings.showMediaGallery ? 'translate-x-[18px]' : 'translate-x-[3px]',
                    )}
                  />
                </span>
              </label>
              <label className="flex items-center justify-between gap-3">
                <span>
                  <span className="block text-[11px] text-fog-300">Motion</span>
                  <span className="mt-0.5 block text-[9.5px] text-fog-500">
                    Animations and smooth transitions.
                  </span>
                </span>
                <select
                  value={settings.motion}
                  onChange={(event) =>
                    updateSettings({ motion: event.target.value as typeof settings.motion })
                  }
                  className="field h-8 w-28 px-2 text-[10.5px]"
                  aria-label="Motion preference"
                >
                  <option value="system">System</option>
                  <option value="on">On</option>
                  <option value="off">Off</option>
                </select>
              </label>
            </div>
          </div>
        </section>

        <section className="border-b border-white/[0.055] px-5 py-5 sm:px-6">
          <SectionHeading icon={<Keyboard size={14} />} title="Keyboard" />
          <div className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
            <Shortcut keys={['⌘', 'K']} label="Search everything" />
            <Shortcut keys={['/']} label="Search this conversation" />
            <Shortcut keys={['Home']} label="Jump to the first message" />
            <Shortcut keys={['End']} label="Jump to the latest message" />
            <Shortcut keys={['Enter']} label="Next search result" />
            <Shortcut keys={['Esc']} label="Close search or panel" />
          </div>
          <p className="mt-3 text-[9px] text-fog-600">
            On Windows and Linux, use Ctrl instead of ⌘.
          </p>
        </section>

        <section className="border-b border-white/[0.055] px-5 py-5 sm:px-6">
          <SectionHeading icon={<HardDrive size={14} />} title="Local storage" />
          <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.018] px-4 py-3">
            <div className="flex items-center justify-between gap-3 text-[10.5px]">
              <span className="text-fog-400">
                {storage
                  ? `${formatBytes(storage.usage)} used of ${formatBytes(storage.quota)} available`
                  : 'Estimating browser storage…'}
              </span>
              <span className="font-mono text-[9.5px] text-fog-500">
                {storage ? `${usagePercent.toFixed(1)}%` : '—'}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#8B5CF6,#FF3CAC)]"
                style={{ width: `${Math.max(1, usagePercent)}%` }}
              />
            </div>
            <div className="mt-3 flex items-start gap-2 text-[9.5px] leading-relaxed text-fog-500">
              <ShieldCheck size={12} className="mt-0.5 shrink-0 text-violet-300" />
              <span>
                Messages and indexes live in this browser’s IndexedDB. Media files are never copied
                — Vesper reads them from your linked archive folder.
              </span>
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button type="button" className="btn-secondary py-1.5 text-[10.5px]" onClick={() => void persist()}>
              <LockKeyhole size={12} />
              Request persistent storage
            </button>
            {activeArchive ? (
              <button type="button" className="btn-secondary py-1.5 text-[10.5px]" onClick={onLinkFolder}>
                <FolderOpen size={12} />
                Link archive folder
              </button>
            ) : null}
          </div>
        </section>

        {activeArchive ? (
          <section className="border-b border-white/[0.055] px-5 py-5 sm:px-6">
            <SectionHeading icon={<Archive size={14} />} title="Archive details" />
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Conversations" value={formatCount(activeArchive.conversationCount)} />
              <Stat label="Messages" value={formatCount(activeArchive.messageCount)} />
              <Stat label="Media" value={formatCount(activeArchive.mediaCount)} />
              <Stat label="JSON shards" value={formatCount(activeArchive.sourceFileCount)} />
            </div>
            <div className="mt-3 space-y-1.5 text-[10px]">
              <DetailRow label="Archive" value={activeArchive.name} />
              <DetailRow label="Imported from" value={activeArchive.rootLabel} />
              <DetailRow
                label="Range"
                value={`${
                  activeArchive.firstTimestampMs
                    ? formatDate(activeArchive.firstTimestampMs)
                    : 'Unknown'
                } → ${
                  activeArchive.lastTimestampMs
                    ? formatDate(activeArchive.lastTimestampMs)
                    : 'Unknown'
                }`}
              />
              <DetailRow
                label="Media linked"
                value={`${formatCount(activeArchive.mediaMatchedCount)} of ${formatCount(activeArchive.mediaCount)}`}
              />
            </div>
            {activeArchive.warnings.length ? (
              <details className="mt-3 rounded-xl border border-sun-500/15 bg-sun-500/[0.035] px-3.5 py-2.5">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-[10.5px] font-medium text-sun-500">
                  <AlertTriangle size={13} />
                  {activeArchive.warnings.length} import warning
                  {activeArchive.warnings.length === 1 ? '' : 's'}
                </summary>
                <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-[9.5px] leading-relaxed text-fog-500">
                  {activeArchive.warnings.map((warning, index) => (
                    <li key={index} className="break-words">
                      {warning}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        ) : null}

        <section className="px-5 py-5 sm:px-6">
          <SectionHeading icon={<Trash2 size={14} />} title="Delete local data" danger />
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-fog-500">
            Deleting is immediate and cannot be undone. Your original Instagram export is not
            affected. Export a fresh archive from Instagram if you need to restore this data.
          </p>

          {activeArchive ? (
            <div className="mt-3 rounded-xl border border-pink-600/20 bg-pink-600/[0.035] px-3.5 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-[11.5px] font-medium text-fog-200">
                    Remove “{activeArchive.name}”
                  </p>
                  <p className="mt-0.5 text-[9.5px] text-fog-500">
                    {formatCount(activeArchive.messageCount)} messages and all derived indexes.
                  </p>
                </div>
                {confirmRemove ? (
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      className="btn-ghost py-1.5 text-[10.5px]"
                      onClick={() => setConfirmRemove(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn-danger py-1.5 text-[10.5px]"
                      disabled={deletingArchiveId === activeArchive.id}
                      onClick={() => void confirmDeleteArchive()}
                    >
                      <Trash2 size={12} />
                      {deletingArchiveId === activeArchive.id ? 'Deleting…' : 'Delete archive'}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn-danger shrink-0 py-1.5 text-[10.5px]"
                    onClick={() => setConfirmRemove(true)}
                  >
                    <Trash2 size={12} />
                    Remove archive
                  </button>
                )}
              </div>
            </div>
          ) : null}

          <div className="mt-2.5 rounded-xl border border-pink-600/20 bg-pink-600/[0.035] px-3.5 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[11.5px] font-medium text-fog-200">Clear all Vesper data</p>
                <p className="mt-0.5 text-[9.5px] text-fog-500">
                  {archives.length} archive{archives.length === 1 ? '' : 's'}, all messages,
                  settings, and reading positions.
                </p>
              </div>
              {confirmClear ? (
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    className="btn-ghost py-1.5 text-[10.5px]"
                    onClick={() => setConfirmClear(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-danger py-1.5 text-[10.5px]"
                    disabled={clearing}
                    onClick={() => void confirmDeleteEverything()}
                  >
                    <Trash2 size={12} />
                    {clearing ? 'Clearing…' : 'Yes, delete everything'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn-danger shrink-0 py-1.5 text-[10.5px]"
                  onClick={() => setConfirmClear(true)}
                >
                  <Database size={12} />
                  Clear all data
                </button>
              )}
            </div>
          </div>

          <p className="mt-3 flex items-center gap-1.5 text-[9px] text-fog-600">
            <MonitorSmartphone size={10} />
            Local to this browser profile. Clearing site data in browser settings also removes it.
          </p>
        </section>

        <div className="border-t border-white/[0.055] px-5 py-3 sm:px-6">
          <p className="flex items-center gap-1.5 text-[9px] text-fog-500">
            <Sparkles size={10} className="text-violet-400" />
            Vesper 1.0 · no account, no analytics, no network requests with your messages
          </p>
        </div>
      </div>
    </Modal>
  )
}

function SectionHeading({
  icon,
  title,
  danger = false,
}: {
  icon: ReactNode
  title: string
  danger?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn(danger ? 'text-pink-400' : 'text-violet-300')}>{icon}</span>
      <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.15em] text-fog-300">
        {title}
      </h3>
    </div>
  )
}

function Shortcut({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[10.5px] text-fog-400">{label}</span>
      <span className="flex shrink-0 gap-1">
        {keys.map((key) => (
          <span key={key} className="kbd">
            {key}
          </span>
        ))}
      </span>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.018] px-2.5 py-2">
      <p className="font-display text-[15px] font-semibold text-fog-100">{value}</p>
      <p className="mt-0.5 text-[8.5px] uppercase tracking-[0.1em] text-fog-500">{label}</p>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-fog-500">{label}</span>
      <span className="min-w-0 truncate text-right text-fog-300">{value}</span>
    </div>
  )
}
