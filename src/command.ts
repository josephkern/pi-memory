import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import {
  globalMemoryDir,
  listMemoryFiles,
  loadConfig,
  projectMemoryDir,
  readIndex,
  type IndexCache,
} from "./storage.ts";

export interface MemoryState {
  /** Session toggle; undefined until resolved from the --no-memory flag. */
  enabled: boolean | undefined;
}

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes}B` : `${(bytes / 1024).toFixed(1)}KB`;
}

function scopeReport(label: string, dir: string, cache: IndexCache, config: ReturnType<typeof loadConfig>): string[] {
  const lines = [`${label}: ${dir}/`];
  const files = listMemoryFiles(dir);
  if (files.length === 0) {
    lines.push("  (empty — nothing saved yet)");
    return lines;
  }
  const index = readIndex(join(dir, "MEMORY.md"), config, cache);
  for (const file of files) {
    if (file.name === "MEMORY.md" && index) {
      const cap = index.truncated
        ? ` — injected ${formatBytes(index.injectedBytes)} of ${formatBytes(index.totalBytes)} (over cap, trim it!)`
        : ` — injected in full (${formatBytes(index.injectedBytes)})`;
      lines.push(`  MEMORY.md${cap}`);
    } else {
      lines.push(`  ${file.name} (${formatBytes(file.bytes)}, read on demand)`);
    }
  }
  return lines;
}

export function registerMemoryCommand(pi: ExtensionAPI, state: MemoryState, cache: IndexCache): void {
  pi.registerCommand("memory", {
    description: "Show persistent memory status, or toggle with: /memory on|off",
    getArgumentCompletions: (prefix: string) => {
      const items = ["on", "off"]
        .filter((v) => v.startsWith(prefix))
        .map((v) => ({ value: v, label: v }));
      return items.length > 0 ? items : null;
    },
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const arg = args.trim().toLowerCase();
      if (arg === "on" || arg === "off") {
        state.enabled = arg === "on";
        emit(ctx, `Memory injection ${arg} for this session.`);
        return;
      }

      const trusted = ctx.isProjectTrusted();
      const globalDir = globalMemoryDir();
      const projectDir = trusted ? projectMemoryDir(ctx.cwd) : undefined;
      const config = loadConfig(globalDir, projectDir);

      const lines: string[] = [];
      const off = state.enabled === false || !config.enabled;
      lines.push(`Persistent memory: ${off ? "OFF" : "on"} (caps: ${config.maxInjectLines} lines / ${formatBytes(config.maxInjectBytes)} per scope)`);
      lines.push(...scopeReport("Global", globalDir, cache, config));
      if (projectDir) {
        lines.push(...scopeReport("Project", projectDir, cache, config));
      } else {
        lines.push("Project: (untrusted directory — project memory inactive)");
      }
      emit(ctx, lines.join("\n"));
    },
  });
}

function emit(ctx: ExtensionCommandContext, text: string): void {
  if (ctx.hasUI) {
    ctx.ui.notify(text, "info");
  } else {
    console.log(text);
  }
}
