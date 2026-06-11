import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { registerMemoryCommand, type MemoryState } from "./command.ts";
import { buildMemoryBlock } from "./inject.ts";
import {
  createIndexCache,
  globalMemoryDir,
  loadConfig,
  projectMemoryDir,
  readIndex,
} from "./storage.ts";

export default function (pi: ExtensionAPI) {
  pi.registerFlag("no-memory", {
    description: "Disable persistent memory injection (pi-memory)",
    type: "boolean",
    default: false,
  });

  const state: MemoryState = { enabled: undefined };
  const cache = createIndexCache();

  pi.on("before_agent_start", (event, ctx) => {
    state.enabled ??= pi.getFlag("no-memory") !== true;
    if (!state.enabled) return;

    const globalDir = globalMemoryDir();
    const projectDir = ctx.isProjectTrusted() ? projectMemoryDir(ctx.cwd) : undefined;
    const config = loadConfig(globalDir, projectDir);
    if (!config.enabled) return;

    const block = buildMemoryBlock({
      globalDir,
      projectDir,
      globalIndex: readIndex(join(globalDir, "MEMORY.md"), config, cache),
      projectIndex: projectDir
        ? readIndex(join(projectDir, "MEMORY.md"), config, cache)
        : undefined,
    });
    return { systemPrompt: `${event.systemPrompt}\n\n${block}` };
  });

  registerMemoryCommand(pi, state, cache);
}
