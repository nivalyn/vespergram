const longDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const monthYear = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
})

const weekdayDate = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const time = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
})

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function formatDate(timestampMs: number): string {
  return longDate.format(new Date(timestampMs))
}

export function formatWeekdayDate(timestampMs: number): string {
  return weekdayDate.format(new Date(timestampMs))
}

export function formatMonthYear(timestampMs: number): string {
  return monthYear.format(new Date(timestampMs))
}

export function formatTime(timestampMs: number): string {
  return time.format(new Date(timestampMs))
}

export function formatDateTime(timestampMs: number): string {
  return `${formatDate(timestampMs)} · ${formatTime(timestampMs)}`
}

export function formatCompactTime(timestampMs: number): string {
  const now = Date.now()
  const date = new Date(timestampMs)
  const today = new Date(now)
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const dayDiff = Math.round((startOfToday - startOfDate) / 86_400_000)

  if (dayDiff === 0) return formatTime(timestampMs)
  if (dayDiff === 1) return 'Yesterday'
  if (dayDiff > 1 && dayDiff < 7) return relative.format(-dayDiff, 'day')
  if (date.getFullYear() === today.getFullYear()) {
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(date)
  }
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }).format(
    date,
  )
}

export function dateKey(timestampMs: number): string {
  const date = new Date(timestampMs)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function startOfDay(timestampMs: number): number {
  const date = new Date(timestampMs)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function dateSeparatorLabel(timestampMs: number): string {
  const start = startOfDay(timestampMs)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const diff = Math.round((today - start) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return formatDate(timestampMs)
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return ''
  const whole = Math.round(seconds)
  const minutes = Math.floor(whole / 60)
  const remainder = whole % 60
  if (minutes === 0) return `${remainder}s`
  return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat().format(value)
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`
}
