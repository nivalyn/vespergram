import { useEffect, useRef, useState } from 'react'
import {
  Download,
  File as FileIcon,
  ImageOff,
  Maximize2,
  Mic,
  Pause,
  Play,
  VideoOff,
} from 'lucide-react'
import type { Attachment } from '../../types'
import { useMediaFile } from '../../hooks/useMediaFile'
import type { MediaSource } from '../../lib/media/mediaResolver'
import { resolveAttachmentFile } from '../../lib/media/mediaResolver'
import { formatBytes } from '../../lib/dates'
import { cn } from '../../lib/cn'
import { mediaKindLabel } from '../../lib/media/mediaResolver'

export function UnavailableMedia({
  attachment,
  compact = false,
}: {
  attachment: Attachment
  compact?: boolean
}) {
  const Icon =
    attachment.kind === 'video'
      ? VideoOff
      : attachment.kind === 'voice' || attachment.kind === 'audio'
        ? Mic
        : attachment.kind === 'file'
          ? FileIcon
          : ImageOff
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border border-white/[0.07] bg-black/25 text-fog-400',
        compact ? 'px-3 py-2.5' : 'min-h-[96px] w-full max-w-[340px] px-4 py-3',
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[12px] font-medium text-fog-300">
          {attachment.filename || mediaKindLabel(attachment.kind)}
        </p>
        <p className="mt-0.5 text-[10.5px] text-fog-500">
          {attachment.external
            ? 'External link only — not downloaded'
            : 'Original file not found in the linked folder'}
        </p>
      </div>
    </div>
  )
}

export function MediaThumb({
  attachment,
  source,
  onOpen,
  className,
  compact = false,
}: {
  attachment: Attachment
  source: MediaSource
  onOpen?: (attachment: Attachment) => void
  className?: string
  compact?: boolean
}) {
  const { url, status } = useMediaFile(attachment, source)
  if (status === 'loading' || status === 'idle') {
    return (
      <div
        className={cn(
          'skeleton rounded-xl',
          compact ? 'h-24 w-full' : 'h-[220px] w-full max-w-[380px]',
          className,
        )}
        aria-label="Loading media"
      />
    )
  }
  if (status === 'missing' || status === 'error' || !url) {
    return <UnavailableMedia attachment={attachment} compact={compact} />
  }

  return (
    <button
      type="button"
      className={cn(
        'group/media relative block overflow-hidden rounded-xl border border-white/[0.07] bg-black/30 text-left',
        className,
      )}
      onClick={(event) => {
        event.stopPropagation()
        onOpen?.(attachment)
      }}
      aria-label={`Open ${mediaKindLabel(attachment.kind).toLocaleLowerCase()}`}
    >
      <img
        src={url}
        alt={attachment.filename}
        loading="lazy"
        decoding="async"
        className={cn(
          'w-full object-cover transition-transform duration-300 ease-out group-hover/media:scale-[1.012]',
          compact ? 'h-full min-h-[96px]' : 'max-h-[360px] min-h-[120px]',
        )}
      />
      {onOpen ? (
        <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg bg-black/55 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover/media:opacity-100">
          <Maximize2 size={13} />
        </span>
      ) : null}
    </button>
  )
}

export function VideoPlayer({
  attachment,
  source,
  onOpen,
  className,
}: {
  attachment: Attachment
  source: MediaSource
  onOpen?: (attachment: Attachment) => void
  className?: string
}) {
  const { url, status } = useMediaFile(attachment, source)
  if (status === 'loading' || status === 'idle') {
    return <div className={cn('skeleton h-[220px] w-full max-w-[380px] rounded-xl', className)} />
  }
  if (status === 'missing' || status === 'error' || !url) {
    return <UnavailableMedia attachment={attachment} />
  }
  return (
    <div
      className={cn(
        'group/video relative overflow-hidden rounded-xl border border-white/[0.07] bg-black',
        className,
      )}
    >
      <video
        src={url}
        controls
        playsInline
        preload="metadata"
        className="max-h-[400px] w-full max-w-[460px] object-contain"
      />
      {onOpen ? (
        <button
          type="button"
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover/video:opacity-100"
          onClick={(event) => {
            event.stopPropagation()
            onOpen(attachment)
          }}
          aria-label="Open video viewer"
        >
          <Maximize2 size={13} />
        </button>
      ) : null}
    </div>
  )
}

function clockTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function AudioPlayer({
  attachment,
  source,
  className,
}: {
  attachment: Attachment
  source: MediaSource
  className?: string
}) {
  const { url, status } = useMediaFile(attachment, source)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const update = () => setCurrent(audio.currentTime)
    const loaded = () => setDuration(audio.duration)
    const ended = () => setPlaying(false)
    const play = () => setPlaying(true)
    const pause = () => setPlaying(false)
    audio.addEventListener('timeupdate', update)
    audio.addEventListener('loadedmetadata', loaded)
    audio.addEventListener('durationchange', loaded)
    audio.addEventListener('ended', ended)
    audio.addEventListener('play', play)
    audio.addEventListener('pause', pause)
    return () => {
      audio.removeEventListener('timeupdate', update)
      audio.removeEventListener('loadedmetadata', loaded)
      audio.removeEventListener('durationchange', loaded)
      audio.removeEventListener('ended', ended)
      audio.removeEventListener('play', play)
      audio.removeEventListener('pause', pause)
    }
  }, [url])

  if (status === 'loading' || status === 'idle') {
    return <div className={cn('skeleton h-[58px] w-[280px] rounded-xl', className)} />
  }
  if (status === 'missing' || status === 'error' || !url) {
    return <UnavailableMedia attachment={attachment} compact />
  }

  return (
    <div
      className={cn(
        'flex w-[290px] max-w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5',
        className,
      )}
    >
      <audio ref={audioRef} src={url} preload="metadata" />
      <button
        type="button"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500 text-white shadow-violet transition-transform active:scale-95"
        onClick={() => {
          const audio = audioRef.current
          if (!audio) return
          if (audio.paused) void audio.play()
          else audio.pause()
        }}
        aria-label={playing ? 'Pause audio' : 'Play audio'}
      >
        {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} className="ml-0.5" fill="currentColor" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.13em] text-fog-400">
            <Mic size={11} />
            {attachment.kind === 'voice' ? 'Voice' : 'Audio'}
          </span>
          <span className="font-mono text-[10px] text-fog-500">
            {clockTime(current)} / {clockTime(duration)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={Number.isFinite(duration) && duration > 0 ? duration : 0}
          step={0.1}
          value={Math.min(current, duration || 0)}
          onChange={(event) => {
            const audio = audioRef.current
            if (!audio) return
            audio.currentTime = Number(event.target.value)
            setCurrent(audio.currentTime)
          }}
          className="mt-1.5 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-violet-400"
          aria-label="Audio progress"
        />
      </div>
    </div>
  )
}

export function FileCard({
  attachment,
  source,
}: {
  attachment: Attachment
  source: MediaSource
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'missing'>('idle')

  const download = async () => {
    setState('loading')
    const file = await resolveAttachmentFile(source, attachment)
    if (!file) {
      setState('missing')
      return
    }
    const url = URL.createObjectURL(file)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = attachment.filename || 'attachment'
    anchor.rel = 'noopener'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 2_000)
    setState('idle')
  }

  return (
    <div className="flex w-[300px] max-w-full items-center gap-3 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-fog-300">
        <FileIcon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-fog-200">{attachment.filename}</p>
        <p className="mt-0.5 text-[10.5px] text-fog-500">
          {attachment.sizeBytes ? formatBytes(attachment.sizeBytes) : 'File attachment'}
        </p>
      </div>
      <button
        type="button"
        className="icon-btn h-8 w-8"
        onClick={() => void download()}
        aria-label="Save attachment"
        title={state === 'missing' ? 'Original file not found' : 'Save file'}
      >
        {state === 'loading' ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border border-fog-400 border-t-transparent" />
        ) : (
          <Download size={15} />
        )}
      </button>
    </div>
  )
}

export function AttachmentRenderer({
  attachments,
  source,
  onOpenMedia,
}: {
  attachments: Attachment[]
  source: MediaSource
  onOpenMedia?: (attachment: Attachment) => void
}) {
  const visible = attachments.filter((attachment) => !attachment.thumbnail)
  if (!visible.length) return null

  const visual = visible.filter(
    (attachment) =>
      attachment.kind === 'image' ||
      attachment.kind === 'gif' ||
      attachment.kind === 'sticker' ||
      attachment.kind === 'video',
  )
  const audio = visible.filter(
    (attachment) => attachment.kind === 'voice' || attachment.kind === 'audio',
  )
  const files = visible.filter(
    (attachment) =>
      !visual.includes(attachment) && !audio.includes(attachment),
  )

  return (
    <div className={cn('flex flex-col gap-1.5', visual.length && (audio.length || files.length) ? 'mb-1.5' : '')}>
      {visual.length ? (
        <div
          className={cn(
            'grid gap-1.5',
            visual.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
          )}
        >
          {visual.map((attachment) =>
            attachment.kind === 'video' ? (
              <VideoPlayer
                key={attachment.id}
                attachment={attachment}
                source={source}
                onOpen={onOpenMedia}
              />
            ) : (
              <MediaThumb
                key={attachment.id}
                attachment={attachment}
                source={source}
                onOpen={onOpenMedia}
                className={
                  attachment.kind === 'sticker'
                    ? 'max-w-[180px] border-0 bg-transparent'
                    : visual.length === 1
                      ? 'max-w-[420px]'
                      : ''
                }
              />
            ),
          )}
        </div>
      ) : null}
      {audio.map((attachment) => (
        <AudioPlayer key={attachment.id} attachment={attachment} source={source} />
      ))}
      {files.map((attachment) => (
        <FileCard key={attachment.id} attachment={attachment} source={source} />
      ))}
    </div>
  )
}
