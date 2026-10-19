import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileJson,
  FolderOpen,
  FolderUp,
  HardDrive,
  ImageOff,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  UploadCloud,
  Users,
} from 'lucide-react'
import { Modal } from '../common/Modal'
import { useApp } from '../../state/AppContext'
import {
  filesFromDataTransfer,
  filesFromFileList,
  pickArchiveDirectory,
  rootLabelForFiles,
  supportsDirectoryPicker,
  type ArchiveSource,
} from '../../lib/fs/archiveSource'
import { isImportJsonPath, jsonCandidates } from '../../lib/import/jsonFiles'
import { importArchiveSource, type ImportProgress, type ImportResult } from '../../lib/import/importArchive'
import { formatBytes, formatCount, formatDate } from '../../lib/dates'
import { cn } from '../../lib/cn'
import type { ImportSummary } from '../../types'

type Phase = 'idle' | 'importing' | 'summary' | 'error'

function percentage(progress: ImportProgress): number {
  switch (progress.phase) {
    case 'reading':
      return Math.min(35, (progress.done / Math.max(1, progress.total)) * 35)
    case 'parsing':
      return 42
    case 'resolving':
      return 46 + (progress.done / Math.max(1, progress.total)) * 16
    case 'saving':
      return 64 + (progress.done / Math.max(1, progress.total)) * 33
    case 'opening':
      return 100
  }
}

export function ImportDialog({
  open,
  onClose,
  onStartAtBeginning,
}: {
  open: boolean
  onClose: () => void
  onStartAtBeginning: () => void
}) {
  const { adoptImport, pushNotice } = useApp()
  const [phase, setPhase] = useState<Phase>('idle')
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastSource, setLastSource] = useState<ArchiveSource | null>(null)
  const directoryInputRef = useRef<HTMLInputElement>(null)
  const filesInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const input = directoryInputRef.current
    if (input) {
      input.setAttribute('webkitdirectory', '')
      input.setAttribute('directory', '')
    }
  }, [])

  useEffect(() => {
    if (!open) {
      // Give close animations a beat before dropping large source references.
      const timer = window.setTimeout(() => {
        if (phase !== 'importing') {
          setPhase('idle')
          setSummary(null)
          setError(null)
          setProgress(null)
          setLastSource(null)
        }
      }, 200)
      return () => window.clearTimeout(timer)
    }
  }, [open, phase])

  const startImport = async (source: ArchiveSource) => {
    if (phase === 'importing') return
    setLastSource(source)
    setPhase('importing')
    setError(null)
    setSummary(null)
    setProgress({
      phase: 'reading',
      done: 0,
      total: 1,
      label: 'Preparing archive',
    })
    try {
      const result: ImportResult = await importArchiveSource(source, setProgress)
      adoptImport(result)
      setSummary(result.summary)
      setPhase('summary')
      pushNotice(
        'success',
        'Archive imported',
        `${formatCount(result.summary.messageCount)} messages across ${formatCount(result.summary.conversationCount)} conversations.`,
      )
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'The archive could not be imported.'
      setError(message)
      setPhase('error')
    }
  }

  const handleSourceFiles = (files: Awaited<ReturnType<typeof filesFromDataTransfer>>) => {
    if (!files.length) {
      setError('No files were found in that selection.')
      setPhase('error')
      return
    }
    const jsonFiles = files.filter((file) => isImportJsonPath(file.path))
    if (!jsonFiles.length) {
      setError(
        'No Instagram message JSON files were found. Choose the extracted archive folder that contains messages/inbox, or select message_1.json files directly.',
      )
      setPhase('error')
      return
    }
    const source: ArchiveSource = {
      kind: 'files',
      rootLabel: rootLabelForFiles(files),
      directoryHandle: null,
      files,
    }
    void startImport(source)
  }

  const chooseFolder = async () => {
    if (supportsDirectoryPicker()) {
      try {
        const source = await pickArchiveDirectory()
        if (source) await startImport(source)
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The folder could not be opened.')
        setPhase('error')
      }
    } else {
      directoryInputRef.current?.click()
    }
  }

  const onDirectoryInput = (event: ChangeEvent<HTMLInputElement>) => {
    const files = filesFromFileList(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    const source: ArchiveSource = {
      kind: 'directory',
      rootLabel: rootLabelForFiles(files),
      directoryHandle: null,
      files,
    }
    void startImport(source)
  }

  const onFilesInput = (event: ChangeEvent<HTMLInputElement>) => {
    const files = filesFromFileList(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    const jsonFiles = jsonCandidates(files)
    if (!jsonFiles.length) {
      setError('Select one or more Instagram message_N.json files.')
      setPhase('error')
      return
    }
    void startImport({
      kind: 'files',
      rootLabel: 'Selected JSON files',
      directoryHandle: null,
      files,
    })
  }

  const onDrop = async (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    try {
      const files = await filesFromDataTransfer(event.dataTransfer)
      handleSourceFiles(files)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The dropped items could not be read.')
      setPhase('error')
    }
  }

  const closable = phase !== 'importing'
  const progressPercent = progress ? percentage(progress) : 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      closable={closable}
      size="lg"
      title={phase === 'summary' ? 'Import complete' : 'Import Instagram archive'}
      description={
        phase === 'summary'
          ? 'Your conversations are indexed locally and ready to read.'
          : 'Read your own exported Direct Messages. No login, no API, no upload.'
      }
    >
      <input
        ref={directoryInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={onDirectoryInput}
        tabIndex={-1}
        aria-hidden="true"
      />
      <input
        ref={filesInputRef}
        type="file"
        multiple
        accept=".json,application/json"
        className="hidden"
        onChange={onFilesInput}
        tabIndex={-1}
        aria-hidden="true"
      />

      {phase === 'idle' ? (
        <div className="p-5 sm:p-6">
          <div
            className={cn(
              'relative flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-9 text-center transition-colors',
              dragging
                ? 'border-violet-400/70 bg-violet-500/[0.08]'
                : 'border-white/[0.13] bg-white/[0.018]',
            )}
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={(event) => {
              if (event.currentTarget === event.target) setDragging(false)
            }}
            onDrop={(event) => void onDrop(event)}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-ink-800 text-violet-300 shadow-violet">
              <UploadCloud size={23} />
            </div>
            <h3 className="mt-4 font-display text-[16px] font-semibold tracking-[-0.02em] text-fog-100">
              Drop your extracted archive here
            </h3>
            <p className="mt-1.5 max-w-md text-[11.5px] leading-relaxed text-fog-400">
              Choose the folder you unzipped from Instagram. Vesper finds{' '}
              <code className="rounded bg-white/[0.06] px-1 py-0.5 text-[10px] text-violet-200">
                messages/inbox
              </code>
              , all numbered shards, and any exported media.
            </p>
            <div className="mt-5 flex flex-col items-center gap-2 sm:flex-row">
              <button type="button" className="btn-primary w-full sm:w-auto" onClick={() => void chooseFolder()}>
                <FolderOpen size={15} />
                Open archive folder
              </button>
              <button
                type="button"
                className="btn-secondary w-full sm:w-auto"
                onClick={() => filesInputRef.current?.click()}
              >
                <FileJson size={15} />
                Choose JSON files
              </button>
            </div>
            <p className="mt-3 text-[9.5px] text-fog-500">
              {supportsDirectoryPicker()
                ? 'Your browser will ask for read-only access to the folder you choose.'
                : 'Your browser will open a folder picker; media access lasts for this session.'}
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Feature
              icon={<LockKeyhole size={14} />}
              title="Stays on this device"
              text="Parsing and search run locally. No chat content touches a server."
            />
            <Feature
              icon={<FolderUp size={14} />}
              title="Shards merged"
              text="message_1.json, message_2.json and older fragments become one timeline."
            />
            <Feature
              icon={<HardDrive size={14} />}
              title="Complete history"
              text="Every message is indexed. Virtual rendering keeps 100k-message threads responsive."
            />
          </div>

          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.018] px-3.5 py-3">
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-violet-300" />
            <p className="text-[10px] leading-relaxed text-fog-400">
              <span className="font-medium text-fog-200">Privacy:</span> Vesper never contacts
              Instagram, analytics, or third-party APIs. Messages are copied into this browser’s
              IndexedDB so the archive reopens instantly. Media is left in your folder and read in
              place when your browser grants access.
            </p>
          </div>
        </div>
      ) : null}

      {phase === 'importing' ? (
        <div className="px-5 py-8 sm:px-8">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/12 text-violet-300">
              <Loader2 size={18} className="animate-spin" />
            </span>
            <div>
              <p className="text-[13px] font-medium text-fog-100">Building your local archive</p>
              <p className="mt-0.5 text-[10.5px] text-fog-500">
                {lastSource?.rootLabel ?? 'Reading archive'} · {formatCount(lastSource?.files.length ?? 0)}{' '}
                files selected
              </p>
            </div>
          </div>
          <div className="mt-7 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#8B5CF6,#FF3CAC)] transition-[width] duration-300"
              style={{ width: `${Math.max(3, progressPercent)}%` }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-[10px] text-fog-500">
            <span>{progress?.label ?? 'Preparing…'}</span>
            <span className="shrink-0 font-mono">{Math.round(progressPercent)}%</span>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ProgressStep done={progressPercent >= 42} label="Read JSON" />
            <ProgressStep done={progressPercent >= 46} label="Merge shards" />
            <ProgressStep done={progressPercent >= 64} label="Match media" />
            <ProgressStep done={progressPercent >= 100} label="Open archive" />
          </div>
          <p className="mt-7 flex items-center gap-1.5 text-[9.5px] text-fog-500">
            <LockKeyhole size={10} className="text-violet-400/80" />
            Everything is processed in this tab. Large archives can take a few minutes.
          </p>
        </div>
      ) : null}

      {phase === 'summary' && summary ? (
        <div className="p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/12 text-violet-300">
              <CheckCircle2 size={22} />
            </span>
            <div>
              <p className="font-display text-[16px] font-semibold text-fog-100">
                {formatCount(summary.messageCount)} messages indexed
              </p>
              <p className="mt-0.5 text-[10.5px] text-fog-500">
                {formatCount(summary.conversationCount)} conversations · parsed in{' '}
                {(summary.durationMs / 1000).toFixed(1)}s
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <SummaryCell
              icon={<Users size={14} />}
              label="Conversations"
              value={formatCount(summary.conversationCount)}
            />
            <SummaryCell
              icon={<FileJson size={14} />}
              label="Messages"
              value={formatCount(summary.messageCount)}
            />
            <SummaryCell
              icon={<ImageOff size={14} />}
              label="Media"
              value={`${formatCount(summary.mediaMatchedCount)}/${formatCount(summary.mediaReferenceCount)}`}
            />
            <SummaryCell
              icon={<ShieldCheck size={14} />}
              label="Duplicates"
              value={formatCount(summary.duplicateCount)}
            />
          </div>

          <div className="mt-3 space-y-1.5 rounded-xl border border-white/[0.07] bg-white/[0.018] px-3.5 py-3 text-[10.5px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-fog-500">Archive</span>
              <span className="truncate text-fog-300">{summary.archive.name}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-fog-500">Date range</span>
              <span className="text-fog-300">
                {summary.archive.firstTimestampMs
                  ? formatDate(summary.archive.firstTimestampMs)
                  : 'Unknown'}{' '}
                →{' '}
                {summary.archive.lastTimestampMs
                  ? formatDate(summary.archive.lastTimestampMs)
                  : 'Unknown'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-fog-500">Authorship</span>
              <span className="truncate text-fog-300">
                {summary.archive.ownerUsername
                  ? `@${summary.archive.ownerUsername} (${summary.archive.ownerSource.replace(/_/g, ' ')})`
                  : 'Not detected — set it in settings'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-fog-500">Media storage</span>
              <span className="truncate text-fog-300">
                {summary.mediaMatchedCount
                  ? `${formatCount(summary.mediaMatchedCount)} files linked in place`
                  : 'JSON only — media not found'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-fog-500">Anticipated index</span>
              <span className="text-fog-300">
                {formatBytes(
                  summary.messageCount *
                    (summary.conversationCount > 0 ? 420 : 0),
                )}{' '}
                approximate
              </span>
            </div>
          </div>

          {summary.warnings.length ? (
            <details className="mt-3 rounded-xl border border-sun-500/15 bg-sun-500/[0.035] px-3.5 py-2.5">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-[10.5px] font-medium text-sun-500">
                <AlertTriangle size={13} />
                {summary.warnings.length} import warning
                {summary.warnings.length === 1 ? '' : 's'}
              </summary>
              <ul className="mt-2 max-h-24 space-y-1 overflow-y-auto text-[9.5px] leading-relaxed text-fog-500">
                {summary.warnings.slice(0, 8).map((warning, index) => (
                  <li key={index} className="break-words">
                    {warning}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Stay here
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                onClose()
                onStartAtBeginning()
              }}
            >
              Start at the beginning
              <ArrowRight size={14} />
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
            >
              Read latest
            </button>
          </div>
        </div>
      ) : null}

      {phase === 'error' ? (
        <div className="p-5 sm:p-6">
          <div className="rounded-xl border border-pink-600/20 bg-pink-600/[0.055] px-4 py-4">
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={17} className="mt-0.5 shrink-0 text-pink-400" />
              <div>
                <p className="text-[12.5px] font-medium text-pink-200">Import failed</p>
                <p className="mt-1 text-[10.5px] leading-relaxed text-fog-400">{error}</p>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button type="button" className="btn-primary" onClick={() => void chooseFolder()}>
              <FolderOpen size={14} />
              Choose another folder
            </button>
            <button type="button" className="btn-secondary" onClick={() => filesInputRef.current?.click()}>
              <FileJson size={14} />
              Choose JSON files
            </button>
            {lastSource ? (
              <button type="button" className="btn-ghost" onClick={() => void startImport(lastSource)}>
                Retry
              </button>
            ) : null}
          </div>
          <p className="mt-4 text-[9.5px] leading-relaxed text-fog-500">
            Make sure you selected the extracted archive root (the folder containing{' '}
            <code className="text-fog-300">your_instagram_activity/messages</code> or{' '}
            <code className="text-fog-300">messages/inbox</code>), not the .zip file itself.
          </p>
        </div>
      ) : null}
    </Modal>
  )
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.018] px-3 py-3">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300">
        {icon}
      </span>
      <p className="mt-2 text-[10.5px] font-medium text-fog-200">{title}</p>
      <p className="mt-1 text-[9.5px] leading-relaxed text-fog-500">{text}</p>
    </div>
  )
}

function ProgressStep({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[9.5px]">
      <span
        className={cn(
          'flex h-4 w-4 items-center justify-center rounded-full border',
          done
            ? 'border-violet-400/50 bg-violet-500/20 text-violet-200'
            : 'border-white/10 text-transparent',
        )}
      >
        <CheckCircle2 size={9} />
      </span>
      <span className={done ? 'text-fog-300' : 'text-fog-600'}>{label}</span>
    </div>
  )
}

function SummaryCell({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.018] px-3 py-2.5">
      <span className="text-violet-300">{icon}</span>
      <p className="mt-1.5 font-display text-[17px] font-semibold tracking-[-0.02em] text-fog-100">
        {value}
      </p>
      <p className="mt-0.5 text-[9px] uppercase tracking-[0.1em] text-fog-500">{label}</p>
    </div>
  )
}
