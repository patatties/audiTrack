// Uploaded files (evidence and pasted screenshots) on disk, in ATTACHMENTS_DIR
// (default: <data dir>/attachments). The database stores "local:<relative path>".
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "./db.js";

export const ATTACHMENTS_DIR = path.resolve(process.env.ATTACHMENTS_DIR || path.join(DATA_DIR, "attachments"));
const PREFIX = "local:";

function resolveStored(filePath) {
  if (!filePath?.startsWith(PREFIX)) {
    // e.g. an Azure Blob URL from a backup made with the former Azure version.
    throw Object.assign(new Error("This file is not stored in this audiTrack installation."), { status: 404 });
  }
  const full = path.resolve(ATTACHMENTS_DIR, filePath.slice(PREFIX.length));
  if (!full.startsWith(ATTACHMENTS_DIR + path.sep)) throw Object.assign(new Error("Invalid attachment path"), { status: 400 });
  return full;
}

/** Saves a file under a relative path and returns the value to store in attachments.file_path. */
export async function storeFile(relPath, buffer) {
  const clean = relPath.split("/").map((s) => s.replace(/[^\w.\-]+/g, "_")).filter((s) => s && s !== "." && s !== "..").join("/");
  const stored = PREFIX + clean;
  const full = resolveStored(stored);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, buffer);
  return stored;
}

export async function readStoredFile(filePath) {
  try {
    return await readFile(resolveStored(filePath));
  } catch (e) {
    if (e.code === "ENOENT") throw Object.assign(new Error("File not found"), { status: 404 });
    throw e;
  }
}

/** Deletes a stored file; missing files and non-local paths are ignored. */
export async function deleteStoredFile(filePath) {
  if (!filePath?.startsWith(PREFIX)) return;
  await rm(resolveStored(filePath), { force: true });
}

/** Removes every stored file (used by "Delete all data"). */
export async function deleteAllFiles() {
  const entries = await readdir(ATTACHMENTS_DIR).catch(() => []);
  await Promise.all(entries.map((e) => rm(path.join(ATTACHMENTS_DIR, e), { recursive: true, force: true })));
}
