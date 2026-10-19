import { useEffect, useState } from 'react'
import type { Attachment } from '../types'
import { resolveAttachmentFile, type MediaSource } from '../lib/media/mediaResolver'

export interface MediaFileState {
  url: string | null
  file: File | null
  status: 'idle' | 'loading' | 'ready' | 'missing' | 'error'
}

/**
 * Resolves one local attachment and owns the object URL lifecycle. URLs are
 * revoked when the row unmounts (Virtuoso unmounts offscreen rows), which
 * keeps memory bounded on long conversations.
 */
export function useMediaFile(
  attachment: Attachment | null,
  source: MediaSource,
  enabled = true,
): MediaFileState {
  const [state, setState] = useState<MediaFileState>({
    url: null,
    file: null,
    status: 'idle',
  })

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    if (!attachment || !enabled || attachment.external) {
      setState({ url: null, file: null, status: 'missing' })
      return () => undefined
    }
    if (!source) {
      setState({ url: null, file: null, status: 'missing' })
      return () => undefined
    }

    setState({ url: null, file: null, status: 'loading' })
    void resolveAttachmentFile(source, attachment)
      .then((file) => {
        if (cancelled) return
        if (!file) {
          setState({ url: null, file: null, status: 'missing' })
          return
        }
        try {
          objectUrl = URL.createObjectURL(file)
        } catch {
          setState({ url: null, file: null, status: 'error' })
          return
        }
        setState({ url: objectUrl, file, status: 'ready' })
      })
      .catch(() => {
        if (!cancelled) setState({ url: null, file: null, status: 'error' })
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [attachment, source, enabled])

  return state
}
