import { useMemo, type ReactNode } from 'react'
import {
  CalendarRange,
  Database,
  FolderOpen,
  Image as ImageIcon,
  Link2,
  LockKeyhole,
  MessageSquare,
  Settings2,
  Users,
  X,
} from 'lucide-react'
import type { ArchiveRecord, Attachment, Conversation } from '../../types'
import type { MediaSource } from '../../lib/media/mediaResolver'
import { useApp } from '../../state/AppContext'
import { Avatar } from '../common/Avatar'
import { MediaThumb } from '../messages/Attachments'
import { formatBytes, formatCount, formatDate, formatDateTime } from '../../lib/dates'
import { cn } from '../../lib/cn'

export function DetailsPanel({
  conversation,
  archive,
  source,
  onClose,
  onOpenMedia,
  onOpenSettings,
  onLinkFolder,
  variant = 'panel',
}: {
  conversation: Conversation
  archive: ArchiveRecord
  source: MediaSource
  onClose: () => void
  onOpenMedia: (attachment: Attachment) => void
  onOpenSettings: () => void
  onLinkFolder: () => void
  variant?: 'panel' | 'overlay'
}) {
  const { messages, mediaStatus, settings } = useApp()

  const media = useMemo(
    () =>
      messages.flatMap((message) =>
        message.attachments.filter((attachment) => !attachment.thumbnail),
      ),
    [messages],
  )
  const visualMedia = useMemo(
    () =>
      media.filter(
        (attachment) =>
          attachment.kind === 'image' ||
          attachment.kind === 'gif' ||
          attachment.kind === 'sticker' ||
          attachment.kind === 'video',
      ),
    [media],
  )

  const senderCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const message of messages) {
      counts.set(message.senderName, (counts.get(message.senderName) ?? 0) + 1)
    }
    return counts
  }, [messages])

  const mediaSummary = {
    linked: 'Linked folder · files are read in place',
    session: 'Linked this session · not copied',
    'permission-required': 'Folder permission required',
    unavailable: 'Folder access unavailable',
    none: 'No media folder linked',
  }[mediaStatus]

  return (
    <aside
      className={cn(
        'h-full shrink-0 flex-col border-l border-white/[0.065] bg-ink-850',
        variant === 'panel'
          ? 'hidden w-[310px] xl:flex'
          : 'fixed inset-y-0 right-0 z-[75] flex w-[min(92vw,340px)] shadow-panel xl:hidden',
      )}
    >
      <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-white/[0.06] px-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-fog-400">
          Conversation details
        </h2>
        <button type="button" className="icon-btn h-8 w-8" onClick={onClose} aria-label="Close details">
          <X size={16} />
        </button>
      </header>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col items-center border-b border-white/[0.055] px-5 pb-5 pt-6 text-center">
          <Avatar name={conversation.title} size={68} isGroup={conversation.isGroup} ring />
          <h3 className="mt-3 max-w-full truncate font-display text-[15px] font-semibold tracking-[-0.02em] text-fog-100">
            {conversation.title}
          </h3>
          <p className="mt-1 text-[10.5px] text-fog-500">
            {conversation.isGroup
              ? `Group · ${conversation.participants.length} participants`
              : 'Direct conversation'}
            {conversation.isMessageRequest ? ' · message request' : ''}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <span className="rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[9px] text-fog-400">
              {formatCount(conversation.messageCount)} messages
            </span>
            {conversation.mediaCount ? (
              <span className="rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[9px] text-fog-400">
                {formatCount(conversation.mediaCount)} media
              </span>
            ) : null}
          </div>
        </div>

        <section className="border-b border-white/[0.055] px-4 py-4">
          <h4 className="section-label mb-3">Participants</h4>
          <div className="space-y-2">
            {conversation.participants.map((participant) => {
              const count = senderCounts.get(participant.name) ?? 0
              return (
                <div key={participant.name} className="flex items-center gap-2.5">
                  <Avatar name={participant.name} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-[11.5px] text-fog-200">
                      {participant.name}
                      {participant.isOwner ? (
                        <span className="rounded border border-violet-400/25 bg-violet-500/[0.1] px-1 py-0.5 text-[7.5px] font-semibold uppercase tracking-[0.1em] text-violet-300">
                          you
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-[9.5px] text-fog-500">
                      {formatCount(count)} message{count === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
          {!archive.ownerUsername ? (
            <button
              type="button"
              className="mt-3 w-full rounded-lg border border-sun-500/20 bg-sun-500/[0.05] px-2.5 py-2 text-left text-[10px] leading-relaxed text-sun-500/90 transition-colors hover:border-sun-500/35"
              onClick={onOpenSettings}
            >
              Authorship unknown. Set which participant is you so outgoing messages align right.
            </button>
          ) : null}
        </section>

        <section className="border-b border-white/[0.055] px-4 py-4">
          <h4 className="section-label mb-3">Archive range</h4>
          <div className="space-y-2.5">
            <StatRow
              icon={<CalendarRange size={13} />}
              label="First message"
              value={
                conversation.firstTimestampMs ? formatDate(conversation.firstTimestampMs) : 'Unknown'
              }
            />
            <StatRow
              icon={<CalendarRange size={13} />}
              label="Latest message"
              value={
                conversation.lastTimestampMs ? formatDate(conversation.lastTimestampMs) : 'Unknown'
              }
            />
            <StatRow
              icon={<MessageSquare size={13} />}
              label="Total messages"
              value={formatCount(conversation.messageCount)}
            />
            <StatRow
              icon={<Users size={13} />}
              label="Participants"
              value={String(conversation.participants.length)}
            />
            <StatRow
              icon={<Database size={13} />}
              label="Source shards"
              value={`${conversation.sourceFiles.length} JSON file${conversation.sourceFiles.length === 1 ? '' : 's'}`}
            />
            <StatRow
              icon={<ImageIcon size={13} />}
              label="Media references"
              value={formatCount(conversation.mediaCount)}
            />
          </div>
        </section>

        <section className="border-b border-white/[0.055] px-4 py-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="section-label">Media</h4>
            {visualMedia.length ? (
              <span className="text-[9px] text-fog-500">{formatCount(visualMedia.length)}</span>
            ) : null}
          </div>
          {visualMedia.length ? (
            <div className={cn('grid grid-cols-3 gap-1.5', !settings.showMediaGallery && 'hidden')}>
              {visualMedia.slice(0, 18).map((attachment) => (
                <MediaThumb
                  key={attachment.id}
                  attachment={attachment}
                  source={source}
                  onOpen={onOpenMedia}
                  compact
                  className="aspect-square min-h-0"
                />
              ))}
            </div>
          ) : (
            <p className="text-[10px] leading-relaxed text-fog-500">
              No photos or videos are referenced by this conversation’s messages.
            </p>
          )}
          {visualMedia.length > 18 ? (
            <p className="mt-2 text-[9px] text-fog-500">
              Showing 18 of {formatCount(visualMedia.length)} visual attachments.
            </p>
          ) : null}
        </section>

        <section className="border-b border-white/[0.055] px-4 py-4">
          <h4 className="section-label mb-3">Local files</h4>
          <div className="space-y-2.5">
            <StatRow
              icon={<FolderOpen size={13} />}
              label="Media access"
              value={mediaSummary}
              valueClassName={
                mediaStatus === 'linked' || mediaStatus === 'session' ? 'text-violet-300' : 'text-fog-300'
              }
            />
            <StatRow
              icon={<Link2 size={13} />}
              label="Matched at import"
              value={`${formatCount(archive.mediaMatchedCount)} of ${formatCount(archive.mediaCount)}`}
            />
            <StatRow
              icon={<Database size={13} />}
              label="Indexed locally"
              value={`${formatCount(archive.messageCount)} messages`}
            />
            <StatRow
              icon={<LockKeyhole size={13} />}
              label="Imported"
              value={formatDateTime(archive.importedAt)}
            />
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="btn-secondary flex-1 py-1.5 text-[10.5px]"
              onClick={onLinkFolder}
            >
              <FolderOpen size={12} />
              Link folder
            </button>
            <button
              type="button"
              className="btn-ghost flex-1 py-1.5 text-[10.5px]"
              onClick={onOpenSettings}
            >
              <Settings2 size={12} />
              Settings
            </button>
          </div>
        </section>

        <section className="px-4 py-4">
          <h4 className="section-label mb-2">Provenance</h4>
          <p className="break-all font-mono text-[9px] leading-relaxed text-fog-500">
            {conversation.threadPath}
          </p>
          <p className="mt-2 text-[9px] leading-relaxed text-fog-500">
            {archive.sourceKind === 'directory'
              ? 'Imported from a local folder. Messages were indexed in IndexedDB; media files remain in your folder.'
              : 'Imported from selected files. Messages were indexed in IndexedDB; media was available only during this session unless the folder is relinked.'}
          </p>
          {archive.warnings.length ? (
            <p className="mt-2 text-[9px] text-sun-500/80">
              {archive.warnings.length} import warning{archive.warnings.length === 1 ? '' : 's'} ·
              see settings.
            </p>
          ) : null}
          <p className="mt-2 flex items-center gap-1 text-[9px] text-fog-600">
            <LockKeyhole size={9} />
            {formatBytes(0)} sent to any server
          </p>
        </section>
      </div>
    </aside>
  )
}

function StatRow({
  icon,
  label,
  value,
  valueClassName,
}: {
  icon: ReactNode
  label: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-fog-500">
        <span className="text-fog-600">{icon}</span>
        {label}
      </span>
      <span className={cn('text-right text-[10px] text-fog-300', valueClassName)}>{value}</span>
    </div>
  )
}
