"use server"

import {
  createEntryImpl,
  deleteEntryImpl,
  listFolderImpl,
  moveEntryImpl,
  type FileOpResult,
  type FolderEntry,
} from "./file-ops-impl"

export async function createEntry(
  parentPath: string,
  name: string,
  kind: "file" | "folder"
): Promise<FileOpResult> {
  return createEntryImpl(parentPath, name, kind)
}

export async function moveEntry(fromPath: string, toRelativePath: string): Promise<FileOpResult> {
  return moveEntryImpl(fromPath, toRelativePath)
}

export async function deleteEntry(targetPath: string): Promise<FileOpResult> {
  return deleteEntryImpl(targetPath)
}

export async function listFolder(dirPath: string): Promise<{ entries: FolderEntry[] } | { error: string }> {
  return listFolderImpl(dirPath)
}
