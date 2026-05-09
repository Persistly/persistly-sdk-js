# Persistly JavaScript SDK

JavaScript SDK for the Persistly runtime API.

The JavaScript SDK is the reference Persistly client for web games, wrappers, launchers, and backend-adjacent tooling that needs direct access to the public runtime API.

## Install

```bash
npm install @persistly/sdk
```

## Quickstart

```ts
import {
  PersistlyGameSaveStatus,
  PersistlyGameSaves,
} from "@persistly/sdk";

await PersistlyGameSaves.configure({
  runtimeKey: "ps_test_replace_me",
  storage: "localStorage",
});

const result = await PersistlyGameSaves.shared.saveSlot("autosave", {
  level: 5,
  coins: 1200,
});

if (result.status === PersistlyGameSaveStatus.LocalSaved) {
  console.log("Saved locally.");
}
```

## Advanced Runtime Client

Use `PersistlyClient` directly when your game needs explicit profile/session handling, custom cache wiring, or direct access to the public runtime API.

```ts
import {
  LocalStorageSaveCache,
  PersistlyClient,
  PersistlySyncStatus,
} from "@persistly/sdk";

const runtimeKey = process.env.PERSISTLY_RUNTIME_KEY;

if (!runtimeKey) {
  throw new Error("Set PERSISTLY_RUNTIME_KEY before calling the Persistly runtime API.");
}

const client = new PersistlyClient({
  runtimeKey,
  cache: new LocalStorageSaveCache(),
});

const created = await client.createProfile({
  playerRef: "player-184",
  profileMetadata: { displayName: "Ayla" },
  accountData: { diamonds: 1200 },
  character: {
    metadata: { _persistly: { slotKey: "mage" }, characterName: "Ayla" },
    state: {
      checkpoint: "vault",
      coins: 418,
    },
  },
});

if (!created.character) {
  throw new Error("Expected profile creation to include an initial character.");
}

localStorage.setItem("my-game:profileSaveId", created.profileSaveId);
localStorage.setItem("my-game:profileSessionToken", created.profileSessionToken);

const syncResult = await client.syncProfileCharacter({
  profileSaveId: created.profileSaveId,
  profileSessionToken: created.profileSessionToken,
  characterSaveId: created.character.saveId,
  baseVersion: created.character.version,
  metadata: created.character.metadata,
  state: {
    checkpoint: "reactor",
    coins: 612,
  },
});

if (syncResult.status === PersistlySyncStatus.Conflict) {
  console.error("Conflict. Canonical server save:", syncResult.save);
}
```

## API Origin

The SDK uses the Persistly production runtime API by default. In normal game code, configure only your runtime key.

## Public Runtime Scope

Supported public runtime operations:

- create profile-only or create profile with an optional first character and profile session
- load profile by `profileSaveId` plus `profileSessionToken`
- create/load/sync profile-owned character saves
- sync profile account data
- archive profile-owned character saves
- read runtime sync policy
- lower-level raw create/load/sync by `saveId` for advanced direct-save integrations

Unsupported public runtime operations:

- lookup by `playerRef`
- lookup by `externalProfileRef`
- broad save listing
- link-code account transfer

`playerRef` and `externalProfileRef` are optional, non-secret developer references. They are not authentication identities, ownership proof, recovery keys, or public lookup inputs. Persist the returned `profileSaveId` and `profileSessionToken` in your game; use that session to load the profile and sync its character saves.

## Contract Bundle

This repo pins `persistly-contract-v0.3.0` under `contracts/`.

The pinned bundle is treated as authoritative for request/response semantics and runtime payload limits.

## Configuration

- `runtimeKey` must be supplied by the caller
- the client always targets `https://api.persistly.app`
- `loadSave`, `syncSave`, and `getLocal` require a non-empty `saveId`
- `loadProfile`, `syncProfileAccountData`, `createProfileCharacter`, `loadProfileCharacter`, `syncProfileCharacter`, and `archiveProfileCharacter` require `profileSaveId` and `profileSessionToken`
- `syncSave` can infer `baseVersion` from the configured cache when a canonical save is already loaded locally
- `syncProfileCharacter` can infer `baseVersion` from the configured cache when a canonical character save is already loaded locally
- `PersistlySyncStatus.Accepted` and `PersistlySyncStatus.Conflict` are the exported status constants for sync results

## Payload Limits

- The SDK performs conservative client-side size checks for `metadata` and `state` using the pinned bundle limits in `contracts/persistly-contract-v0.3.0/limits/runtime-limits.json`
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
import {
  LocalStorageAutosaveDraftStore,
  LocalStorageSaveCache,
  PersistlyAutosaveManager,
  PersistlyClient,
} from "@persistly/sdk";

const client = new PersistlyClient({
  runtimeKey: process.env.NEXT_PUBLIC_PERSISTLY_RUNTIME_KEY,
  cache: new LocalStorageSaveCache(),
});

let profileSaveId = localStorage.getItem("my-game:profileSaveId");
let profileSessionToken = localStorage.getItem("my-game:profileSessionToken");
let characterSaveId = localStorage.getItem("my-game:characterSaveId");

if (!profileSaveId || !profileSessionToken || !characterSaveId) {
  const created = await client.createProfile({
    playerRef: "player-184",
    accountData: { diamonds: 0 },
    character: {
      metadata: { _persistly: { slotKey: "main" } },
      state: { checkpoint: "intro", coins: 0 },
    },
  });

  if (!created.character) {
    throw new Error("Expected profile creation to include an initial character.");
  }

  profileSaveId = created.profileSaveId;
  profileSessionToken = created.profileSessionToken;
  characterSaveId = created.character.saveId;

  localStorage.setItem("my-game:profileSaveId", profileSaveId);
  localStorage.setItem("my-game:profileSessionToken", profileSessionToken);
  localStorage.setItem("my-game:characterSaveId", characterSaveId);
}

const config = await client.getRuntimeConfig();
const autosave = new PersistlyAutosaveManager({
  client,
  profileSaveId,
  profileSessionToken,
  characterSaveId,
  syncPolicy: config.syncPolicy,
  draftStore: new LocalStorageAutosaveDraftStore(),
});

await autosave.recordLocalChange({
  metadata: { _persistly: { slotKey: "main" } },
  state: { checkpoint: "forest", coins: 25 },
});
```

## Examples

- `examples/basic.ts` creates a profile with one character and syncs that character.
- `examples/browser-basic.ts` shows the browser-first `PersistlyGameSaves` facade.
- `examples/conflict.ts` shows a profile-scoped character conflict.
- `examples/vite-basic.ts` shows Vite environment variable configuration.

These examples use lightweight local persistence so they can be read as small game-flow references. Browser games should persist `profileSaveId`, `profileSessionToken`, and the active character `saveId` in localStorage, IndexedDB, or their own save-file layer.

## Profile Sessions

Profiles are the default model for games. A profile save contains account-wide data and references to one or more character saves. A simple game can always use the first character. If the game later adds multiple characters or external auth, the profile shape is already in place.

```ts
import {
  LocalStorageSaveCache,
  PersistlyClient,
  isPersistlyProfileState,
} from "@persistly/sdk";

const client = new PersistlyClient({
  runtimeKey: process.env.NEXT_PUBLIC_PERSISTLY_RUNTIME_KEY!,
  cache: new LocalStorageSaveCache(),
});

const created = await client.createProfile({
  playerRef: "player-184",
  externalProfileRef: {
    provider: "auth0",
    subject: "auth0|user_123",
  },
  profileMetadata: { displayName: "Ayla" },
  accountData: { diamonds: 1200 },
  character: {
    metadata: { _persistly: { slotKey: "mage" }, characterName: "Ayla" },
    state: { checkpoint: "vault", level: 5 },
  },
});

localStorage.setItem("my-game:profileSaveId", created.profileSaveId);
localStorage.setItem("my-game:profileSessionToken", created.profileSessionToken);

const profile = await client.loadProfile({
  profileSaveId: created.profileSaveId,
  profileSessionToken: created.profileSessionToken,
});

if (isPersistlyProfileState(profile.state)) {
  const characterSaves = await Promise.all(
    profile.state.characterSlots.map((character) =>
      client.loadProfileCharacter({
        profileSaveId: created.profileSaveId,
        profileSessionToken: created.profileSessionToken,
        characterSaveId: character.characterSaveId,
      }),
    ),
  );
  console.log(characterSaves);
}
```

Profile `accountData` is client-writable gameplay state, not a trusted payment ledger. Persistly can store derived gameplay state such as `{ diamonds: 1200 }`, but purchase validation must happen through the game owner's trusted payment provider flow. Do not store raw payment transactions, card data, receipts, or invoice history in profile saves.

## Conflict Handling

Persistly uses optimistic concurrency. If another device has already advanced the canonical character save, `syncProfileCharacter` returns `PersistlySyncStatus.Conflict` and `result.save` contains the server save to keep locally.

```ts
const result = await client.syncProfileCharacter({
  profileSaveId,
  profileSessionToken,
  characterSaveId,
  baseVersion: character.version,
  metadata: character.metadata,
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
