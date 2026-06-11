import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  DEFAULT_CONFIG,
  capContent,
  createIndexCache,
  listMemoryFiles,
  loadConfig,
  readIndex,
} from "../src/storage.ts";
import { buildMemoryBlock } from "../src/inject.ts";

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "pi-memory-test-"));
  process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("capContent keeps content under both caps unchanged", () => {
  const raw = "line one\nline two";
  const result = capContent(raw, { maxInjectLines: 10, maxInjectBytes: 1024 });
  assert.equal(result.content, raw);
  assert.equal(result.truncated, false);
});

test("capContent enforces the line cap", () => {
  const raw = ["a", "b", "c", "d"].join("\n");
  const result = capContent(raw, { maxInjectLines: 2, maxInjectBytes: 1024 });
  assert.equal(result.content, "a\nb");
  assert.equal(result.truncated, true);
});

test("capContent enforces the byte cap at line boundaries", () => {
  const raw = "12345\n67890\nabcde";
  const result = capContent(raw, { maxInjectLines: 100, maxInjectBytes: 11 });
  assert.equal(result.content, "12345\n67890");
  assert.equal(result.truncated, true);
});

test("capContent never splits multi-byte characters", () => {
  const raw = "ééééé\nxxxxx"; // first line is 10 bytes in UTF-8
  const result = capContent(raw, { maxInjectLines: 100, maxInjectBytes: 12 });
  assert.equal(result.content, "ééééé");
  assert.equal(result.truncated, true);
});

test("readIndex returns undefined for a missing file", () => {
  const dir = tempDir();
  assert.equal(readIndex(join(dir, "MEMORY.md"), DEFAULT_CONFIG), undefined);
});

test("readIndex reports totals and truncation", () => {
  const dir = tempDir();
  const path = join(dir, "MEMORY.md");
  writeFileSync(path, "a\nb\nc");
  const snapshot = readIndex(path, { ...DEFAULT_CONFIG, maxInjectLines: 2 });
  assert.ok(snapshot);
  assert.equal(snapshot.content, "a\nb");
  assert.equal(snapshot.truncated, true);
  assert.equal(snapshot.totalLines, 3);
  assert.equal(snapshot.totalBytes, 5);
  assert.equal(snapshot.injectedBytes, 3);
});

test("readIndex cache invalidates when the file changes", () => {
  const dir = tempDir();
  const path = join(dir, "MEMORY.md");
  const cache = createIndexCache();
  writeFileSync(path, "old");
  utimesSync(path, new Date(1000000), new Date(1000000));
  assert.equal(readIndex(path, DEFAULT_CONFIG, cache)?.content, "old");

  writeFileSync(path, "new!");
  utimesSync(path, new Date(2000000), new Date(2000000));
  assert.equal(readIndex(path, DEFAULT_CONFIG, cache)?.content, "new!");
});

test("readIndex cache is bypassed when caps change", () => {
  const dir = tempDir();
  const path = join(dir, "MEMORY.md");
  const cache = createIndexCache();
  writeFileSync(path, "a\nb\nc");
  assert.equal(readIndex(path, DEFAULT_CONFIG, cache)?.truncated, false);
  const capped = readIndex(path, { ...DEFAULT_CONFIG, maxInjectLines: 1 }, cache);
  assert.equal(capped?.content, "a");
  assert.equal(capped?.truncated, true);
});

test("loadConfig: project overrides global, invalid JSON ignored", () => {
  const globalDir = tempDir();
  const projectDir = tempDir();
  writeFileSync(join(globalDir, "config.json"), JSON.stringify({ maxInjectLines: 50, maxInjectBytes: 4096 }));
  writeFileSync(join(projectDir, "config.json"), JSON.stringify({ maxInjectLines: 10 }));

  const merged = loadConfig(globalDir, projectDir);
  assert.equal(merged.maxInjectLines, 10);
  assert.equal(merged.maxInjectBytes, 4096);
  assert.equal(merged.enabled, true);

  writeFileSync(join(projectDir, "config.json"), "not json");
  const fallback = loadConfig(globalDir, projectDir);
  assert.equal(fallback.maxInjectLines, 50);
});

test("loadConfig ignores invalid cap values", () => {
  const globalDir = tempDir();
  writeFileSync(join(globalDir, "config.json"), JSON.stringify({ maxInjectLines: -5, enabled: false }));
  const config = loadConfig(globalDir);
  assert.equal(config.maxInjectLines, DEFAULT_CONFIG.maxInjectLines);
  assert.equal(config.enabled, false);
});

test("listMemoryFiles lists top-level markdown only, sorted", () => {
  const dir = tempDir();
  writeFileSync(join(dir, "MEMORY.md"), "x");
  writeFileSync(join(dir, "build.md"), "y");
  writeFileSync(join(dir, "config.json"), "{}");
  mkdirSync(join(dir, "archive"));
  writeFileSync(join(dir, "archive", "old.md"), "z");

  assert.deepEqual(
    listMemoryFiles(dir).map((f) => f.name),
    ["MEMORY.md", "build.md"],
  );
});

test("buildMemoryBlock omits the project scope entirely when untrusted", () => {
  const block = buildMemoryBlock({ globalDir: "/home/u/.pi/agent/memory" });
  assert.ok(block.includes("Global memory"));
  assert.ok(!block.toLowerCase().includes("project memory"));
  assert.ok(block.includes("no entries yet"));
});

test("buildMemoryBlock includes both scopes and truncation notice", () => {
  const block = buildMemoryBlock({
    globalDir: "/g",
    projectDir: "/p/.pi/memory",
    globalIndex: {
      path: "/g/MEMORY.md",
      content: "- global fact",
      truncated: false,
      totalLines: 1,
      totalBytes: 13,
      injectedBytes: 13,
    },
    projectIndex: {
      path: "/p/.pi/memory/MEMORY.md",
      content: "- project fact",
      truncated: true,
      totalLines: 300,
      totalBytes: 9000,
      injectedBytes: 8000,
    },
  });
  assert.ok(block.includes("- global fact"));
  assert.ok(block.includes("- project fact"));
  assert.ok(block.includes("Index truncated: showing 8000 of 9000 bytes"));
  assert.ok(block.includes("shared with the team"));
});

test("buildMemoryBlock is deterministic for identical inputs", () => {
  const opts = { globalDir: "/g", projectDir: "/p/.pi/memory" };
  assert.equal(buildMemoryBlock(opts), buildMemoryBlock(opts));
});
