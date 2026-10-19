export {}

declare global {
  interface FileSystemDirectoryHandle {
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>
  }

  interface Window {
    showDirectoryPicker?: (options?: {
      mode?: 'read' | 'readwrite'
      id?: string
      startIn?: string
    }) => Promise<FileSystemDirectoryHandle>
  }
}
