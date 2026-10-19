import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  File as FileIcon,
  ImageOff,
  X,
} from 'lucide-react'
import type { Attachment } from '../../types'
import type { MediaSource } from '../../lib/media/mediaResolver'
import { mediaKindLabel } from '../../lib/media/mediaResolver'
import { useMediaFile } from '../../hooks/useMediaFile'
import { UnavailableMedia, AudioPlayer } from '../messages/Attachments'
import { formatBytes, formatDateTime } from '../../lib/dates'

export interface ViewerState {
  attachments: Attachment[]
  index: number
}

export function MediaViewer({
  viewer,
  source,
  onClose,
  onChange,
}: {
  viewer: ViewerState | null
  source: MediaSource
  onClose: () => void
  onChange: (index: number) => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const [zoomed, setZoomed] = useState(false)

  useEffect(() => {
    setZoomed(false)
  }, [viewer?.index])

  useEffect(() => {
    if (!viewer) return
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
      if (event.key === 'ArrowLeft' && viewer.attachments.length > 1) {
        event.preventDefault()
        onChange((viewer.index - 1 + viewer.attachments.length) % viewer.attachments.length)
      }
      if (event.key === 'ArrowRight' && viewer.attachments.length > 1) {
        event.preventDefault()
        onChange((viewer.index + 1) % viewer.attachments.length)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [viewer, onClose, onChange])

  if (!viewer) return null
  const attachment = viewer.attachments[viewer.index]
  if (!attachment) return null
  const total = viewer.attachments.length

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex flex-col bg-black/96 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={`${mediaKindLabel(attachment.kind)} viewer`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-white/[0.07] px-3 sm:px-5">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium text-fog-200">{attachment.filename}</p>
          <p className="mt-0.5 flex items-center gap-2 text-[9.5px] text-fog-500">
            <span>{mediaKindLabel(attachment.kind)}</span>
            {attachment.sizeBytes ? (
              <>
                <span className="text-fog-600">·</span>
                <span>{formatBytes(attachment.sizeBytes)}</span>
              </>
            ) : null}
            {attachment.creationTimestampMs ? (
              <>
                <span className="text-fog-600">·</span>
                <span>{formatDateTime(attachment.creationTimestampMs)}</span>
              </>
            ) : null}
            {total > 1 ? (
              <>
                <span className="text-fog-600">·</span>
                <span>
                  {viewer.index + 1} / {total}
                </span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <MediaDownload attachment={attachment} source={source} />
          <button
            ref={closeRef}
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close media viewer"
          >
            <X size={19} />
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center p-6 sm:p-10">
        {total > 1 ? (
          <button
            type="button"
            className="absolute left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-ink-850/90 text-fog-300 transition-colors hover:border-violet-400/30 hover:text-white sm:left-6"
            onClick={() => onChange((viewer.index - 1 + total) % total)}
            aria-label="Previous attachment"
          >
            <ChevronLeft size={19} />
          </button>
        ) : null}

        <div className="flex h-full w-full max-w-6xl items-center justify-center">
          {attachment.kind === 'image' ||
          attachment.kind === 'gif' ||
          attachment.kind === 'sticker' ? (
            <ViewerImage
              attachment={attachment}
              source={source}
              zoomed={zoomed}
              onToggleZoom={() => setZoomed((value) => !value)}
            />
          ) : null}
          {attachment.kind === 'video' ? (
            <ViewerVideo attachment={attachment} source={source} />
          ) : null}
          {attachment.kind === 'voice' || attachment.kind === 'audio' ? (
            <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-ink-850 p-5">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-violet-500/15 text-violet-300">
                  <FileIcon size={18} />
                </span>
                <div>
                  <p className="text-[13px] font-medium text-fog-100">
                    {attachment.kind === 'voice' ? 'Voice message' : 'Audio attachment'}
                  </p>
                  <p className="mt-0.5 text-[10.5px] text-fog-500">{attachment.filename}</p>
                </div>
              </div>
              <AudioPlayer attachment={attachment} source={source} />
            </div>
          ) : null}
          {attachment.kind === 'file' ||
          (attachment.kind !== 'image' &&
            attachment.kind !== 'gif' &&
            attachment.kind !== 'sticker' &&
            attachment.kind !== 'video' &&
            attachment.kind !== 'voice' &&
            attachment.kind !== 'audio') ? (
            <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-ink-850 p-6 text-center">
              <FileIcon size={28} className="mx-auto text-fog-400" />
              <p className="mt-3 text-[13px] text-fog-200">{attachment.filename}</p>
              <p className="mt-1 text-[10.5px] text-fog-500">File attachment</p>
              <div className="mt-4 flex justify-center">
                <MediaDownload attachment={attachment} source={source} labelled />
              </div>
            </div>
          ) : null}
        </div>

        {total > 1 ? (
          <button
            type="button"
            className="absolute right-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-ink-850/90 text-fog-300 transition-colors hover:border-violet-400/30 hover:text-white sm:right-6"
            onClick={() => onChange((viewer.index + 1) % total)}
            aria-label="Next attachment"
          >
            <ChevronRight size={19} />
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

function ViewerImage({
  attachment,
  source,
  zoomed,
  onToggleZoom,
}: {
  attachment: Attachment
  source: MediaSource
  zoomed: boolean
  onToggleZoom: () => void
}) {
  const { url, status } = useMediaFile(attachment, source)
  if (status === 'loading' || status === 'idle') {
    return <div className="skeleton h-[min(70vh,700px)] w-[min(80vw,900px)] rounded-xl" />
  }
  if (status === 'missing' || status === 'error' || !url) {
    return (
      <div className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-ink-850 p-6 text-center">
        <ImageOff size={26} className="mx-auto text-fog-400" />
        <p className="mt-3 text-[12px] text-fog-300">{attachment.filename}</p>
        <p className="mt-1 text-[10.5px] text-fog-500">
          The original file was not found in the linked archive folder.
        </p>
      </div>
    )
  }
  return (
    <button
      type="button"
      className="flex h-full w-full cursor-zoom-in items-center justify-center overflow-auto border-0 bg-transparent p-0"
      onClick={onToggleZoom}
      aria-label={zoomed ? 'Zoom out' : 'Zoom in'}
      style={{ cursor: zoomed ? 'zoom-out' : 'zoom-in' }}
    >
      <img
        src={url}
        alt={attachment.filename}
        className={
          zoomed
            ? 'max-h-none max-w-none scale-150 object-contain transition-transform duration-200'
            : 'max-h-full max-w-full object-contain transition-transform duration-200'
        }
        draggable={false}
      />
    </button>
  )
}

function ViewerVideo({
  attachment,
  source,
}: {
  attachment: Attachment
  source: MediaSource
}) {
  const { url, status } = useMediaFile(attachment, source)
  if (status === 'loading' || status === 'idle') {
    return <div className="skeleton aspect-video w-full max-w-4xl rounded-xl" />
  }
  if (status === 'missing' || status === 'error' || !url) {
    return (
      <div className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-ink-850 p-6 text-center">
        <p className="text-[12px] text-fog-300">{attachment.filename}</p>
        <p className="mt-1 text-[10.5px] text-fog-500">The original video was not found.</p>
      </div>
    )
  }
  return (
    <video
      src={url}
      controls
      autoPlay
      playsInline
      className="max-h-full max-w-full rounded-xl bg-black"
      aria-label={attachment.filename}
    />
  )
}

function MediaDownload({
  attachment,
  source,
  labelled = false,
}: {
  attachment: Attachment
  source: MediaSource
  labelled?: boolean
}) {
  const { url, file, status } = useMediaFile(attachment, source)
  if (status !== 'ready' || !url || !file) {
    if (labelled) return <UnavailableMedia attachment={attachment} compact />
    return null
  }
  return (
    <a
      href={url}
      download={attachment.filename || 'attachment'}
      className={labelled ? 'btn-secondary' : 'icon-btn'}
      title="Save a copy"
      aria-label="Save a copy"
    >
      <Download size={labelled ? 14 : 17} />
      {labelled ? 'Save file' : null}
    </a>
  )
}
