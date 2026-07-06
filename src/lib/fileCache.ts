const fileCache = new Map<string, File>()

export function cacheFile(fileId: string, file: File) {
  fileCache.set(fileId, file)
}

export function getCachedFile(fileId: string): File | undefined {
  return fileCache.get(fileId)
}

export function removeCachedFile(fileId: string) {
  fileCache.delete(fileId)
}
