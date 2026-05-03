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
  externalUserId: "player-184",
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

## Production API Origin

The client targets `https://api.persistly.app` by default. You only need to provide a runtime key in the common case.

## Public Runtime Scope

Supported public runtime operations:

- create save
- load save by `saveId`
- sync save by `saveId`

Unsupported public runtime operations:

- lookup by `externalUserId`
- broad save listing

## Contract Bundle

This repo pins `persistly-contract-v0.1.0` under `contracts/`.

The pinned bundle is treated as authoritative for request/response semantics and runtime payload limits.

## Configuration

- `runtimeKey` must be supplied by the caller
- the client always targets `https://api.persistly.app`
- `loadSave`, `syncSave`, and `getLocal` require a non-empty `saveId`
- `syncSave` can infer `baseVersion` from the configured cache when a canonical save is already loaded locally
- `PersistlySyncStatus.Accepted` and `PersistlySyncStatus.Conflict` are the exported status constants for sync results

## Payload Limits

- The SDK performs conservative client-side size checks for `metadata` and `state` using the pinned bundle limits in `contracts/persistly-contract-v0.1.0/limits/runtime-limits.json`
- These checks are a reference guard, not a replacement for server validation; the runtime API remains authoritative
- When a payload exceeds a pinned limit, the SDK throws `PersistlyPayloadTooLargeError` with the same `payload_too_large` code and `{ field, maxBytes }` details shape used by the runtime API

## Cache Helpers

- `MemorySaveCache` keeps canonical saves in memory
- `FileSaveCache` stores canonical saves as JSON files on disk for local development flows and is exported from the main package entrypoint
- `client.updateLocal(save)` writes a canonical save to the configured cache without making any runtime API call
- `client.getLocal(saveId)` reads the canonical save from the configured cache without making any runtime API call

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
