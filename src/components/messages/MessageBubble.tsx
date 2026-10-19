import { memo } from 'react'
import { Phone, Video, VolumeX } from 'lucide-react'
import type { ArchiveRecord, Attachment, Conversation, Message } from '../../types'
import type { MediaSource } from '../../lib/media/mediaResolver'
import { Avatar } from '../common/Avatar'
import { MessageText } from './MessageText'
import { AttachmentRenderer } from './Attachments'
import { ShareCard } from './ShareCard'
import {
  dateKey,
  dateSeparatorLabel,
  formatDuration,
  formatTime,
} from '../../lib/dates'
import { isPlaceholderAttachmentText } from '../../lib/text'
import { cn } from '../../lib/cn'

export function DateDivider({ label }: { label: string }) {
  return (
    <div className="flex select-none items-center gap-3 py-5" aria-hidden="true">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-white/[0.11]" />
      <span className="rounded-full border border-white/[0.07] bg-white/[0.035] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-fog-400">
        {label}
      </span>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-white/[0.11]" />
    </div>
  )
}

function CallEvent({ message, outgoing }: { message: Message; outgoing: boolean }) {
  const Icon = message.isVideoCall ? Video : Phone
  return (
    <div className="flex justify-center py-2.5">
      <div className="flex items-center gap-2.5 rounded-full border border-white/[0.07] bg-white/[0.03] px-3.5 py-2 text-[11px] text-fog-400">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/15 text-violet-300">
          <Icon size={12} />
        </span>
        <span>
          {message.isVideoCall ? 'Video call' : 'Audio call'}
          {message.callDurationSeconds !== null
            ? ` · ${formatDuration(message.callDurationSeconds)}`
            : ''}
        </span>
        <span className="text-fog-600">·</span>
        <span className="text-fog-500">{outgoing ? 'Outgoing' : 'Incoming'}</span>
        {message.timestampMs !== null ? (
          <span className="text-fog-600">{formatTime(message.timestampMs)}</span>
        ) : null}
      </div>
    </div>
  )
}

export interface MessageRowProps {
  message: Message
  conversation: Conversation
  archive: ArchiveRecord
  source: MediaSource
  ownerUsername: string
  isGroupStart: boolean
  isGroupEnd: boolean
  showDate: boolean
  searchQuery: string
  isCurrentHit: boolean
  onOpenMedia: (attachment: Attachment) => void
  onJumpToMessage?: (messageId: string) => void
}

export const MessageRow = memo(function MessageRow({
  message,
  conversation,
  archive,
  source,
  ownerUsername,
  isGroupStart,
  isGroupEnd,
  showDate,
  searchQuery,
  isCurrentHit,
  onOpenMedia,
}: MessageRowProps) {
  const ownerKey = ownerUsername.toLocaleLowerCase('en')
  const outgoing = Boolean(ownerKey) && message.senderName.toLocaleLowerCase('en') === ownerKey

  if (message.kind === 'call') {
    return (
      <div id={`message-${message.id}`} data-message-id={message.id}>
        {showDate ? (
          <DateDivider
            label={
              message.timestampMs === null
                ? 'Unknown date'
                : dateSeparatorLabel(message.timestampMs)
            }
          />
        ) : null}
        <CallEvent message={message} outgoing={outgoing} />
      </div>
    )
  }

  const attachments = message.attachments.filter((attachment) => !attachment.thumbnail)
  const thumbnail = message.attachments.find((attachment) => attachment.thumbnail)
  const placeholder = attachments.length > 0 || message.share
  const text =
    message.isUnsent
      ? 'Message unsent'
      : message.isDeleted
        ? 'Message unavailable'
        : isPlaceholderAttachmentText(message.text) && placeholder
          ? ''
          : message.text
  const hasBody = Boolean(text || attachments.length || message.share)
  const onlyMedia = !text && !message.share && attachments.length > 0
  const isUnavailable = message.kind === 'unavailable' || message.isDeleted
  const displayText = isUnavailable ? (message.isGeoBlocked ? 'Message unavailable in this region' : 'Message unavailable') : text
  const showSender = conversation.isGroup && !outgoing && isGroupStart
  const avatarName = message.senderName
  const timeVisible = isGroupEnd || isCurrentHit

  return (
    <div
      id={`message-${message.id}`}
      data-message-id={message.id}
      className={cn('group/msg', isGroupStart && !showDate ? 'mt-3.5' : '', 'pt-0.5')}
    >
      {showDate ? (
        <DateDivider
          label={
            message.timestampMs === null ? 'Unknown date' : dateSeparatorLabel(message.timestampMs)
          }
        />
      ) : null}
      <div
        className={cn(
          'flex w-full items-end gap-2.5',
          outgoing ? 'justify-end' : 'justify-start',
          isGroupEnd ? 'mb-2' : 'mb-0.5',
        )}
      >
        {!outgoing ? (
          <div className={cn('w-7 shrink-0 self-end pb-0.5', !conversation.isGroup && 'hidden')}>
            {isGroupEnd ? (
              <Avatar name={avatarName} size={28} />
            ) : (
              <span className="block h-7 w-7" />
            )}
          </div>
        ) : null}
        <div
          className={cn(
            'flex min-w-0 max-w-[min(78%,680px)] flex-col',
            outgoing ? 'items-end' : 'items-start',
            conversation.isGroup ? 'max-w-[min(70%,620px)]' : '',
          )}
        >
          {showSender ? (
            <span className="mb-1 ml-1 text-[10.5px] font-medium text-violet-300/90">
              {message.senderName}
            </span>
          ) : null}
          {hasBody ? (
            <div
              className={cn(
                'message-bubble relative max-w-full rounded-[18px]',
                outgoing ? 'message-bubble-out' : 'message-bubble-in',
                isGroupEnd && outgoing ? 'rounded-br-[6px]' : '',
                isGroupEnd && !outgoing ? 'rounded-bl-[6px]' : '',
                onlyMedia ? 'p-1.5' : 'px-3.5 py-2.5',
                isCurrentHit ? 'message-bubble-selected' : '',
                message.isUnsent || isUnavailable ? 'opacity-85' : '',
              )}
            >
              {displayText ? (
                <MessageText
                  text={displayText}
                  query={searchQuery}
                  className={cn(
                    message.isUnsent || isUnavailable ? 'italic text-fog-300/80' : '',
                  )}
                />
              ) : null}
              {attachments.length ? (
                <div className={cn(displayText ? 'mt-1.5' : '')}>
                  <AttachmentRenderer
                    attachments={attachments}
                    source={source}
                    onOpenMedia={onOpenMedia}
                  />
                </div>
              ) : null}
              {message.share ? (
                <ShareCard share={message.share} thumbnail={thumbnail} source={source} />
              ) : null}
              {message.isGeoBlocked && message.kind !== 'unavailable' ? (
                <p className="mt-1.5 flex items-center gap-1 text-[10px] text-fog-500">
                  <VolumeX size={10} /> Media may be unavailable in this region
                </p>
              ) : null}
              {message.reactions.length ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {message.reactions.map((reaction, index) => (
                    <span
                      key={`${reaction.actor}-${index}`}
                      className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-black/30 px-1.5 py-0.5 text-[11px] text-fog-200"
                      title={
                        reaction.actor.toLocaleLowerCase('en') === ownerKey
                          ? 'You reacted'
                          : `${reaction.actor} reacted`
                      }
                    >
                      <span>{reaction.emoji}</span>
                      <span className="text-[8.5px] text-fog-400">
                        {reaction.actor.toLocaleLowerCase('en') === ownerKey ? 'You' : reaction.actor}
                      </span>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-[12px] italic text-fog-500">
              Message unavailable
            </div>
          )}
          <div
            className={cn(
              'mt-1 flex items-center gap-1.5 px-1 text-[9.5px] text-fog-500 transition-opacity duration-150',
              timeVisible ? 'opacity-100' : 'opacity-0 group-hover/msg:opacity-100',
              outgoing ? 'flex-row-reverse' : '',
            )}
          >
            <span>{message.timestampMs === null ? 'Unknown time' : formatTime(message.timestampMs)}</span>
            {message.kind === 'unsent' ? <span>· unsent</span> : null}
            {message.source.fileNumber > 1 ? (
              <span className="text-fog-600" title={message.source.file}>
                shard {message.source.fileNumber}
              </span>
            ) : null}
          </div>
        </div>
        {outgoing ? <span className="hidden w-7 shrink-0 sm:block" /> : null}
      </div>
      {showDate ? null : null}
      {/* Keep source file order and date boundaries visible in the DOM for debugging. */}
      <span
        className="sr-only"
        data-source-file={message.source.file}
        data-source-index={message.source.index}
      >
        {message.senderName} · {archive.name} · {conversation.title}
      </span>
    </div>
  )
})

export function isSameDay(a: Message, b: Message): boolean {
  return (
    a.timestampMs !== null && b.timestampMs !== null && dateKey(a.timestampMs) === dateKey(b.timestampMs)
  )
}

export function shouldGroup(a: Message | undefined, b: Message, maxGapMs = 5 * 60_000): boolean {
  if (!a) return false
  if (a.senderName !== b.senderName) return false
  if (!isSameDay(a, b)) return false
  if (a.timestampMs === null || b.timestampMs === null) return false
  return Math.abs(b.timestampMs - a.timestampMs) <= maxGapMs
}
