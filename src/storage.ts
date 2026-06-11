import { readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface MemoryConfig {
  /** Master switch, settable from config.json in either scope. */
  enabled: boolean;
  /** Max lines of MEMORY.md injected per scope. */
  maxInjectLines: number;
  /** Max bytes of MEMORY.md injected per scope. */
  maxInjectBytes: number;
}

export const DEFAULT_CONFIG: MemoryConfig = {
  enabled: true,
  maxInjectLines: 200,
  maxInjectBytes: 8192,
};

/** A capped read of a MEMORY.md index file. */
export interface IndexSnapshot {
  path: string;
  /** Content up to the line/byte caps, cut at line boundaries. */
  content: string;
  truncated: boolean;
  totalLines: number;
  totalBytes: number;
  injectedBytes: number;
}

export function globalMemoryDir(): string {
  return join(homedir(), ".pi", "agent", "memory");
}

export function projectMemoryDir(cwd: string): string {
  return join(cwd, ".pi", "memory");
}

/**
 * Cap content at whichever of maxInjectLines/maxInjectBytes is hit first,
 * cutting only at line boundaries so multi-byte characters are never split.
 */
export function capContent(
  raw: string,
  config: Pick<MemoryConfig, "maxInjectLines" | "maxInjectBytes">,
): { content: string; truncated: boolean } {
  const lines = raw.split("\n");
  const kept: string[] = [];
  let bytes = 0;
  for (const line of lines) {
    if (kept.length >= config.maxInjectLines) break;
    const lineBytes = Buffer.byteLength(line, "utf8") + (kept.length > 0 ? 1 : 0);
    if (bytes + lineBytes > config.maxInjectBytes) break;
    kept.push(line);
    bytes += lineBytes;
  }
  const truncated = kept.length < lines.length;
  return { content: kept.join("\n"), truncated };
}

interface CacheEntry {
  mtimeMs: number;
  size: number;
  maxInjectLines: number;
  maxInjectBytes: number;
  snapshot: IndexSnapshot;
}

export type IndexCache = Map<string, CacheEntry>;

export function createIndexCache(): IndexCache {
  return new Map();
}

/**
 * Read and cap a MEMORY.md index. Returns undefined when the file does not
 * exist (or is unreadable). Results are cached by mtime+size so the per-prompt
 * read is a stat() in the common case.
 */
export function readIndex(
  path: string,
  config: MemoryConfig,
  cache?: IndexCache,
): IndexSnapshot | undefined {
  let stat;
  try {
    stat = statSync(path);
  } catch {
    cache?.delete(path);
    return undefined;
  }

  const cached = cache?.get(path);
  if (
    cached &&
    cached.mtimeMs === stat.mtimeMs &&
    cached.size === stat.size &&
    cached.maxInjectLines === config.maxInjectLines &&
    cached.maxInjectBytes === config.maxInjectBytes
  ) {
    return cached.snapshot;
  }

  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    cache?.delete(path);
    return undefined;
  }

  const { content, truncated } = capContent(raw, config);
  const snapshot: IndexSnapshot = {
    path,
    content,
    truncated,
    totalLines: raw.length === 0 ? 0 : raw.split("\n").length,
    totalBytes: Buffer.byteLength(raw, "utf8"),
    injectedBytes: Buffer.byteLength(content, "utf8"),
  };
  cache?.set(path, {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    maxInjectLines: config.maxInjectLines,
    maxInjectBytes: config.maxInjectBytes,
    snapshot,
  });
  return snapshot;
}

/**
 * Load config.json from the global dir, then the project dir (when given),
 * with project keys overriding global keys — mirroring pi's settings merge.
 * Missing or invalid files are ignored.
 */
export function loadConfig(globalDir: string, projectDir?: string): MemoryConfig {
  const config = { ...DEFAULT_CONFIG };
  for (const dir of [globalDir, projectDir]) {
    if (!dir) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(dir, "config.json"), "utf8"));
    } catch {
      continue;
    }
    if (typeof parsed !== "object" || parsed === null) continue;
    const candidate = parsed as Partial<MemoryConfig>;
    if (typeof candidate.enabled === "boolean") config.enabled = candidate.enabled;
    if (typeof candidate.maxInjectLines === "number" && candidate.maxInjectLines > 0) {
      config.maxInjectLines = candidate.maxInjectLines;
    }
    if (typeof candidate.maxInjectBytes === "number" && candidate.maxInjectBytes > 0) {
      config.maxInjectBytes = candidate.maxInjectBytes;
    }
  }
  return config;
}

export interface MemoryFile {
  name: string;
  bytes: number;
}

/** List markdown files in a memory dir (top level; archive/ excluded). */
export function listMemoryFiles(dir: string): MemoryFile[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: MemoryFile[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    try {
      files.push({ name: entry.name, bytes: statSync(join(dir, entry.name)).size });
    } catch {
      // file vanished between readdir and stat; skip
    }
  }
  return files.sort((a, b) => {
    if (a.name === "MEMORY.md") return -1;
    if (b.name === "MEMORY.md") return 1;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}
