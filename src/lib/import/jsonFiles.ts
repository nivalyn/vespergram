export const IMPORT_JSON_FILE_RE =
  /(?:^|\/)(?:message(?:[_-]?\d+)?|personal_information)\.json$/i

export function isImportJsonPath(path: string): boolean {
  return IMPORT_JSON_FILE_RE.test(path)
}

export function jsonCandidates<T extends { path: string }>(files: T[]): T[] {
  return files.filter((entry) => isImportJsonPath(entry.path))
}
