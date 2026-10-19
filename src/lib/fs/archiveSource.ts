import { ArchiveFileIndex, normalizeArchivePath, pathKey } from '../paths'

export interface ArchiveFile {
  path: string
  file: File
}

export interface ArchiveSource {
  kind: 'directory' | 'files'
  rootLabel: string
  directoryHandle: FileSystemDirectoryHandle | null
  files: ArchiveFile[]
}

const MAX_FILES = 250_000
const JSON_NAME_RE = /\.json$/i

function shouldSkipPath(path: string): boolean {
  return (
    path.split('/').some((part) => part === '__MACOSX' || part.startsWith('._')) ||
    path.endsWith('/.DS_Store')
  )
}

export function filesFromFileList(list: FileList | File[]): ArchiveFile[] {
  const files = Array.from(list)
  const output: ArchiveFile[] = []
  for (const file of files) {
    const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath
    const path = normalizeArchivePath(relative || file.name)
    if (!path || shouldSkipPath(path)) continue
    // The media cap must never hide message JSON. Large archives usually have
    // far more photos than shards, so keep indexing JSON past the media limit.
    if (output.length >= MAX_FILES && !JSON_NAME_RE.test(path)) continue
    output.push({ path, file })
  }
  return output
}

export function rootLabelForFiles(files: ArchiveFile[]): string {
  const first = files.find((file) => file.path.includes('/'))
  if (!first) return 'Selected files'
  return first.path.split('/')[0] ?? 'Selected files'
}

export async function collectDirectoryHandle(
  handle: FileSystemDirectoryHandle,
  prefix = '',
  output: ArchiveFile[] = [],
): Promise<ArchiveFile[]> {
  for await (const [name, child] of handle.entries()) {
    if (name === '__MACOSX' || name.startsWith('._') || name === '.DS_Store') continue
    const path = prefix ? `${prefix}/${name}` : name
    if (child.kind === 'file') {
      if (output.length >= MAX_FILES && !JSON_NAME_RE.test(name)) continue
      const fileHandle = child as FileSystemFileHandle
      try {
        const file = await fileHandle.getFile()
        output.push({ path, file })
      } catch {
        // A file can disappear while the directory is being read. Skip it and
        // let the import report missing media rather than abort the archive.
      }
    } else {
      await collectDirectoryHandle(child as FileSystemDirectoryHandle, path, output)
    }
  }
  return output
}

export function supportsDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

export async function pickArchiveDirectory(): Promise<ArchiveSource | null> {
  const picker = window.showDirectoryPicker
  if (!picker) return null
  try {
    const handle = await picker.call(window, { mode: 'read', id: 'vesper-archive' })
    const files = await collectDirectoryHandle(handle)
    return {
      kind: 'directory',
      rootLabel: handle.name,
      directoryHandle: handle,
      files,
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null
    throw error
  }
}

interface FileSystemEntryLike {
  isFile: boolean
  isDirectory: boolean
  name: string
  fullPath: string
  file?: (callback: (file: File) => void, error?: (error: DOMException) => void) => void
  createReader?: () => {
    readEntries: (
      callback: (entries: FileSystemEntryLike[]) => void,
      error?: (error: DOMException) => void,
    ) => void
  }
}

async function readFileEntry(entry: FileSystemEntryLike): Promise<File | null> {
  if (!entry.file) return null
  return new Promise((resolve) => {
    entry.file?.(
      (file) => resolve(file),
      () => resolve(null),
    )
  })
}

async function readDirectoryEntries(entry: FileSystemEntryLike): Promise<FileSystemEntryLike[]> {
  const reader = entry.createReader?.()
  if (!reader) return []
  const all: FileSystemEntryLike[] = []
  // readEntries returns batches and must be called until it returns [].
  for (let guard = 0; guard < 10_000; guard++) {
    const batch = await new Promise<FileSystemEntryLike[]>((resolve) => {
      reader.readEntries(
        (entries) => resolve(entries),
        () => resolve([]),
      )
    })
    if (!batch.length) break
    all.push(...batch)
  }
  return all
}

async function walkEntry(entry: FileSystemEntryLike, output: ArchiveFile[]): Promise<void> {
  if (entry.isFile) {
    if (output.length >= MAX_FILES && !JSON_NAME_RE.test(entry.name)) return
    const file = await readFileEntry(entry)
    const path = normalizeArchivePath(entry.fullPath || entry.name)
    if (file && path && !shouldSkipPath(path)) output.push({ path, file })
    return
  }
  if (!entry.isDirectory) return
  const children = await readDirectoryEntries(entry)
  for (const child of children) await walkEntry(child, output)
}

export async function filesFromDataTransfer(dataTransfer: DataTransfer): Promise<ArchiveFile[]> {
  const items = Array.from(dataTransfer.items)
  const entries: FileSystemEntryLike[] = []
  for (const item of items) {
    const withEntry = item as DataTransferItem & {
      webkitGetAsEntry?: () => FileSystemEntryLike | null
    }
    const entry = withEntry.webkitGetAsEntry?.()
    if (entry) entries.push(entry)
  }
  if (!entries.length) return filesFromFileList(dataTransfer.files)

  const output: ArchiveFile[] = []
  for (const entry of entries) await walkEntry(entry, output)
  return output
}

export function makeFileIndex(files: ArchiveFile[]): ArchiveFileIndex {
  return new ArchiveFileIndex(files)
}

export async function readLinkedFile(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<File | null> {
  const normalized = normalizeArchivePath(path)
  if (!normalized) return null
  const parts = normalized.split('/')
  let directory = root
  try {
    for (let index = 0; index < parts.length - 1; index++) {
      const part = parts[index]
      if (!part) return null
      directory = await directory.getDirectoryHandle(part)
    }
    const filename = parts[parts.length - 1]
    if (!filename) return null
    const fileHandle = await directory.getFileHandle(filename)
    return await fileHandle.getFile()
  } catch {
    return null
  }
}

export async function fileIndexForHandle(root: FileSystemDirectoryHandle): Promise<ArchiveFileIndex> {
  const files = await collectDirectoryHandle(root)
  return makeFileIndex(files)
}

export async function permissionState(
  handle: FileSystemDirectoryHandle,
  request = false,
): Promise<'granted' | 'prompt' | 'denied'> {
  try {
    const withPermission = handle as FileSystemDirectoryHandle & {
      queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>
      requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>
    }
    if (!withPermission.queryPermission) return 'granted'
    const current = await withPermission.queryPermission({ mode: 'read' })
    if (current === 'granted') return 'granted'
    if (!request || !withPermission.requestPermission) return current
    const requested = await withPermission.requestPermission({ mode: 'read' })
    return requested
  } catch {
    return 'denied'
  }
}

export function exactSessionPath(index: ArchiveFileIndex, path: string): File | null {
  const entry = index.resolve(path)
  return entry?.file ?? null
}

export { pathKey }
