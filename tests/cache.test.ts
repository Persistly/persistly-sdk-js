import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { MemorySaveCache, type SaveSnapshot } from "../src/cache.js";
import { FileSaveCache } from "../src/file-cache.js";
import { LocalStorageSaveCache, type LocalStorageLike } from "../src/local-storage-cache.js";

const snapshot: SaveSnapshot = {
  saveId: "sv_cache",
  playerRef: "player-184",
  metadata: { slot: 1 },
  state: { level: 2 },
  version: 3,
  createdAt: "2026-04-09T10:00:00Z",
  updatedAt: "2026-04-09T10:05:00Z",
};

test("MemorySaveCache stores and clears snapshots", async () => {
  const cache = new MemorySaveCache();

  await cache.set(snapshot);
  assert.deepEqual(await cache.get(snapshot.saveId), snapshot);

  await cache.clear(snapshot.saveId);
  assert.equal(await cache.get(snapshot.saveId), null);
});

test("MemorySaveCache clones snapshots on set and get", async () => {
  const cache = new MemorySaveCache();
  const original: SaveSnapshot = {
    ...snapshot,
    metadata: { slot: 1, nested: { name: "Ayla" } },
    state: { inventory: ["sword"] },
  };

  await cache.set(original);
  original.metadata.slot = 99;
  (original.metadata.nested as { name: string }).name = "Mutated";
  (original.state.inventory as string[]).push("shield");

  const retrieved = await cache.get(original.saveId);
  assert.deepEqual(retrieved, {
    ...snapshot,
    metadata: { slot: 1, nested: { name: "Ayla" } },
    state: { inventory: ["sword"] },
  });

  assert.ok(retrieved);
  retrieved.metadata.slot = 42;
  (retrieved.metadata.nested as { name: string }).name = "Changed Again";

  assert.deepEqual(await cache.get(original.saveId), {
    ...snapshot,
    metadata: { slot: 1, nested: { name: "Ayla" } },
    state: { inventory: ["sword"] },
  });
});

test("FileSaveCache persists snapshots to disk", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "persistly-sdk-js-"));

  try {
    const cache = new FileSaveCache(directory);

    await cache.set(snapshot);

    const reloadedCache = new FileSaveCache(directory);
    assert.deepEqual(await reloadedCache.get(snapshot.saveId), snapshot);

    await reloadedCache.clear(snapshot.saveId);
    assert.equal(await reloadedCache.get(snapshot.saveId), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("FileSaveCache rejects invalid on-disk save snapshots", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "persistly-sdk-js-"));

  try {
    await writeFile(
      path.join(directory, `${encodeURIComponent("sv_invalid")}.json`),
      JSON.stringify({
        saveId: "sv_invalid",
        playerRef: null,
        metadata: {},
        state: {},
        version: 0,
        createdAt: "not-a-date",
        updatedAt: "2026-04-09T10:05:00Z",
      }),
      "utf8",
    );

    const cache = new FileSaveCache(directory);
    await assert.rejects(() => cache.get("sv_invalid"), /version must be an integer greater than or equal to 1/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("LocalStorageSaveCache stores snapshots in browser-compatible storage", () => {
  const storage = new MemoryStorage();
  const cache = new LocalStorageSaveCache({ storage });

  cache.set(snapshot);

  assert.deepEqual(cache.get(snapshot.saveId), snapshot);
  assert.equal(storage.getItem(`persistly:save:${encodeURIComponent(snapshot.saveId)}`), JSON.stringify(snapshot));

  cache.clear(snapshot.saveId);
  assert.equal(cache.get(snapshot.saveId), null);
});

test("LocalStorageSaveCache rejects invalid stored save snapshots", () => {
  const storage = new MemoryStorage();
  storage.setItem(
    `persistly:save:${encodeURIComponent("sv_invalid")}`,
    JSON.stringify({
      saveId: "sv_invalid",
      playerRef: null,
      metadata: {},
      state: {},
      version: 0,
      createdAt: "not-a-date",
      updatedAt: "2026-04-09T10:05:00Z",
    }),
  );

  const cache = new LocalStorageSaveCache({ storage });
  assert.throws(() => cache.get("sv_invalid"), /version must be an integer greater than or equal to 1/i);
});

class MemoryStorage implements LocalStorageLike {
  private readonly entries = new Map<string, string>();

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }
}
