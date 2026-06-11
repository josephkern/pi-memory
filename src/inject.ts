import { join } from "node:path";
import type { IndexSnapshot } from "./storage.ts";

export interface InjectOptions {
  globalDir: string;
  /** Undefined when the project is untrusted: the scope is then fully omitted. */
  projectDir?: string;
  globalIndex?: IndexSnapshot;
  projectIndex?: IndexSnapshot;
}

function section(title: string, dir: string, index: IndexSnapshot | undefined): string {
  const header = `### ${title}  (${join(dir, "MEMORY.md")})`;
  if (!index) {
    return `${header}\n\n(no entries yet — create the file with \`write\` when you have something to save)`;
  }
  const note = index.truncated
    ? `\n\n[Index truncated: showing ${index.injectedBytes} of ${index.totalBytes} bytes. Keep MEMORY.md concise; move detail to topic files.]`
    : "";
  return `${header}\n\n${index.content.trimEnd()}${note}`;
}

/**
 * Build the memory block appended to the system prompt. Deterministic for
 * unchanged inputs so the provider prompt cache stays warm.
 */
export function buildMemoryBlock(opts: InjectOptions): string {
  const scopeLines = [`- Global memory (this user, all projects): ${opts.globalDir}/`];
  if (opts.projectDir) {
    scopeLines.push(
      `- Project memory (committed to the repo, shared with the team): ${opts.projectDir}/`,
    );
  }

  const rules = [
    "- Check the index first: update an existing entry rather than adding a duplicate.",
    "- Delete entries that turn out to be wrong; move merely-stale content to the scope's archive/ directory.",
    "- Keep MEMORY.md a concise index (one line per fact, grouped under ## topic headers); put detail in topic files and leave a one-line pointer.",
  ];
  if (opts.projectDir) {
    rules.push(
      "- Project memory is read by the user's teammates: keep it factual and professional, never store secrets.",
    );
  }
  rules.push("- Don't save what the repo already records (code, git history, AGENTS.md).");

  const parts = [
    "## Persistent memory",
    "",
    "You have file-based persistent memory, separate from AGENTS.md (which is user-authored — never write memory there).",
    "",
    ...scopeLines,
    "",
    "Each scope has a MEMORY.md index (shown below) plus topic files you can read with `read` when relevant.",
    "",
    "When you learn something durable — a correction from the user, a build/test command, a non-obvious constraint, a decision and its rationale — save it by editing the appropriate MEMORY.md or topic file with `edit`/`write`. When the user says \"remember ...\", that is an instruction to save: write the fact to the appropriate MEMORY.md immediately, in the same turn. Rules:",
    ...rules,
    "",
    section("Global MEMORY.md", opts.globalDir, opts.globalIndex),
  ];
  if (opts.projectDir) {
    parts.push("", section("Project MEMORY.md", opts.projectDir, opts.projectIndex));
  }
  return parts.join("\n");
}
