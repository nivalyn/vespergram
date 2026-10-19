import { parseInstagramArchive, type ParseArchiveResult } from '../lib/instagram/parse'
import type { ArchiveInputFile } from '../types'

export interface ImportWorkerFile {
  path: string
  file: File
}

export interface ImportWorkerRequest {
  type: 'parse'
  archiveId: string
  files: ImportWorkerFile[]
}

export type ImportWorkerResponse =
  | { type: 'progress'; phase: 'reading' | 'parsing'; done: number; total: number }
  | { type: 'result'; result: ParseArchiveResult }
  | { type: 'error'; message: string }

const JSON_FILE_RE = /(?:^|\/)(?:message(?:[_-]?\d+)?|personal_information)\.json$/i

export function isImportJsonPath(path: string): boolean {
  return JSON_FILE_RE.test(path)
}

self.onmessage = async (event: MessageEvent<ImportWorkerRequest>) => {
  const request = event.data
  if (request.type !== 'parse') return

  try {
    const jsonFiles = request.files.filter((entry) => isImportJsonPath(entry.path))
    if (!jsonFiles.length) {
      self.postMessage({
        type: 'error',
        message: 'No Instagram message JSON files were found in this selection.',
      } satisfies ImportWorkerResponse)
      return
    }

    const inputs: ArchiveInputFile[] = []
    const total = jsonFiles.length
    for (let index = 0; index < jsonFiles.length; index++) {
      const entry = jsonFiles[index]
      if (!entry) continue
      try {
        inputs.push({ path: entry.path, text: await entry.file.text() })
      } catch {
        inputs.push({ path: entry.path, text: '' })
      }
      self.postMessage({
        type: 'progress',
        phase: 'reading',
        done: index + 1,
        total,
      } satisfies ImportWorkerResponse)
      if (index % 8 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
    }

    self.postMessage({ type: 'progress', phase: 'parsing', done: total, total } satisfies ImportWorkerResponse)
    const result = parseInstagramArchive(inputs, { archiveId: request.archiveId })
    self.postMessage({ type: 'result', result } satisfies ImportWorkerResponse)
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'The archive could not be parsed.',
    } satisfies ImportWorkerResponse)
  }
}
