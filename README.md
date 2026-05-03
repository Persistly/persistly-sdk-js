# Persistly JavaScript SDK

JavaScript SDK for the Persistly runtime API.

The JavaScript SDK is the reference Persistly client for web games, wrappers, launchers, and backend-adjacent tooling that needs direct access to the public runtime API.

## Install

```bash
npm install @persistly/sdk-js
```

## Quickstart

```ts
import { PersistlyClient, PersistlySyncStatus } from "@persistly/sdk-js";

const runtimeKey = process.env.PERSISTLY_RUNTIME_KEY;

if (!runtimeKey) {
  throw new Error("Set PERSISTLY_RUNTIME_KEY before calling the Persistly runtime API.");
}

const client = new PersistlyClient({
  runtimeKey,
});

const created = await client.createSave({
  playerRef: "player-184",
  metadata: {
    characterName: "Ayla",
    slotLabel: "Mage",
  },
  state: {
    checkpoint: "vault",
    coins: 418,
  },
});

const loaded = await client.loadSave(created.saveId);

const result = await client.syncSave(created.saveId, {
  baseVersion: loaded.version,
  metadata: loaded.metadata,
  state: {
    checkpoint: "reactor",
    coins: 612,
  },
});

if (result.status === PersistlySyncStatus.Conflict) {
  console.error("Conflict. Canonical server save:", result.save);
}
```

## API Origin

The SDK uses the Persistly production runtime API by default. In normal game code, configure only your runtime key.

## Public Runtime Scope

Supported public runtime operations:

- create save
- load save by `saveId`
- sync save by `saveId`

Unsupported public runtime operations:

- lookup by `playerRef`
- broad save listing

`playerRef` is an optional, non-secret developer reference. It is not an authentication identity and it is not queryable through the public runtime API. Persist the returned `saveId` in your game and load/sync by `saveId`.

## Contract Bundle

This repo pins `persistly-contract-v0.2.0` under `contracts/`.

The pinned bundle is treated as authoritative for request/response semantics and runtime payload limits.

## Configuration

- `runtimeKey` must be supplied by the caller
- the client always targets `https://api.persistly.app`
- `loadSave`, `syncSave`, and `getLocal` require a non-empty `saveId`
- `syncSave` can infer `baseVersion` from the configured cache when a canonical save is already loaded locally
- `PersistlySyncStatus.Accepted` and `PersistlySyncStatus.Conflict` are the exported status constants for sync results

## Payload Limits

- The SDK performs conservative client-side size checks for `metadata` and `state` using the pinned bundle limits in `contracts/persistly-contract-v0.2.0/limits/runtime-limits.json`
- These checks are a reference guard, not a replacement for server validation; the runtime API remains authoritative
- When a payload exceeds a pinned limit, the SDK throws `PersistlyPayloadTooLargeError` with the same `payload_too_large` code and `{ field, maxBytes }` details shape used by the runtime API

## Cache Helpers

- `MemorySaveCache` keeps canonical saves in memory
- `FileSaveCache` stores canonical saves as JSON files on disk for local development flows and is exported from the main package entrypoint
- `LocalStorageSaveCache` stores canonical saves in browser `localStorage` for web games that need to persist `saveId` and the last canonical `version`
- `client.updateLocal(save)` writes a canonical save to the configured cache without making any runtime API call
- `client.getLocal(saveId)` reads the canonical save from the configured cache without making any runtime API call

## Browser Persistence

```ts
import { LocalStorageSaveCache, PersistlyClient } from "@persistly/sdk-js";

const client = new PersistlyClient({
  runtimeKey: process.env.NEXT_PUBLIC_PERSISTLY_RUNTIME_KEY,
  cache: new LocalStorageSaveCache(),
});

const saveId = localStorage.getItem("my-game:saveId");
const localSave = saveId ? await client.getLocal(saveId) : null;

const save =
  localSave ??
  (await client.createSave({
    playerRef: "player-184",
    metadata: { slot: "main" },
    state: { checkpoint: "intro", coins: 0 },
  }));

localStorage.setItem("my-game:saveId", save.saveId);

const result = await client.syncSave(save.saveId, {
  state: { checkpoint: "forest", coins: 25 },
});
```

## Conflict Handling

Persistly uses optimistic concurrency. If another device has already advanced the canonical save, `syncSave` returns `PersistlySyncStatus.Conflict` and `result.save` contains the server save to keep locally.

```ts
const result = await client.syncSave(save.saveId, {
  baseVersion: save.version,
  state: nextLocalState,
});

if (result.status === PersistlySyncStatus.Conflict) {
  await client.updateLocal(result.save);
  // Reapply unsynced local edits or ask the player which state to keep.
  return;
}

await client.updateLocal(result.save);
```

## Errors

- Runtime API errors are surfaced as typed errors such as `PersistlyUnauthorizedError`, `PersistlyNotFoundError`, and `PersistlyPayloadTooLargeError`
- Network or non-JSON transport failures surface as `PersistlyTransportError`
- Local misuse such as missing `runtimeKey` or empty `saveId` surfaces as `PersistlyConfigurationError`

## Release Workflow

- validate the pinned contract bundle before publishing
- run tests and build from a clean checkout
- update the README and examples when runtime behavior changes
- keep the package aligned with `https://api.persistly.app` and the public OpenAPI contract

## Development

```bash
pnpm install
pnpm validate:contract
pnpm test
pnpm build
```
