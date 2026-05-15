# Persistly JavaScript SDK

JavaScript SDK for Persistly cloud saves in browser games, JavaScript game clients, and JS-based engine wrappers.

Most games should start with `PersistlyGameSaves`: configure once, save named slots locally, load named slots locally, and sync to Persistly at safe moments.

This package is `0.10.0` and pins `persistly-contract-v0.3.0`.

## Install

```bash
npm install @persistlyapp/sdk
```

## Quickstart

```ts
import {
  PersistlyGameSaveStatus,
  PersistlyGameSaves,
} from "@persistlyapp/sdk";

await PersistlyGameSaves.configure({
  runtimeKey: "ps_test_replace_me",
  storage: "localStorage",
});

await PersistlyGameSaves.shared.saveSlot("autosave", {
  level: 5,
  coins: 1200,
  checkpoint: "forest-gate",
});

const loaded = await PersistlyGameSaves.shared.loadSlot("autosave");
console.log("Loaded local state:", loaded.state);

const sync = await PersistlyGameSaves.shared.forceSync("autosave");

if (sync.status === PersistlyGameSaveStatus.Synced) {
  console.log("Synced to Persistly.");
}

if (sync.status === PersistlyGameSaveStatus.Conflict) {
  console.log("Local state and cloud state differ. Ask the player which one to keep.");
}
```

## How It Works

- `saveSlot` writes local gameplay state immediately. It does not need a network request.
- `loadSlot` reads the local slot so your game can boot quickly, even offline.
- The first `forceSync`, `syncDueSlots`, or `syncDue` call creates the remote Persistly profile and the matching character slot if needed.
- The SDK stores `profileSaveId`, `profileSessionToken`, and character slot references in the configured storage.
- Later syncs update the same remote character slot and keep local/cloud conflict state separate.

Named slots keep game code stable:

```ts
await PersistlyGameSaves.shared.saveSlot("autosave", state);
await PersistlyGameSaves.shared.saveSlot("slot-1", state);
await PersistlyGameSaves.shared.saveSlot("mage", state);
```

## Restore And Sessions

Anonymous browser games can use local storage only. Games with their own account system should also persist the profile session identifiers in their trusted backend so the same player can restore the same Persistly profile on another device.

```ts
const session = await PersistlyGameSaves.shared.getProfileSession({
  includeToken: true,
});

// Store these in your trusted backend if you support account login.
console.log(session.profileSaveId);
console.log(session.profileSessionToken);
```

`playerRef` and `externalProfileRef` are optional developer references. They are not authentication, ownership proof, public lookup inputs, or recovery keys.

## Account Data

Use profile account data for account-wide gameplay values such as unlocked slots, premium currency balance after trusted purchase validation, shared inventory, or account settings.

```ts
await PersistlyGameSaves.shared.saveAccountData({
  diamonds: 1200,
  unlockedSlots: 6,
});

await PersistlyGameSaves.shared.forceSyncProfile();
```

Do not store raw payment transactions, card data, receipts, invoices, or billing history in Persistly saves. Validate purchases through your trusted payment provider flow, then store only derived gameplay state.

## Conflicts

Persistly never overwrites local gameplay state automatically on conflict. When cloud state is newer, the SDK keeps both versions so your game can decide.

```ts
const sync = await PersistlyGameSaves.shared.forceSync("autosave");

if (sync.status === PersistlyGameSaveStatus.Conflict) {
  const slot = PersistlyGameSaves.shared.inspectSlot("autosave");

  // slot.state is local gameplay state.
  // slot.cloudState is the canonical cloud version.
  // Show a UI, merge intentionally, or keep local for later.
}
```

## Advanced Runtime Client

Use `PersistlyClient` directly only when you are building a custom wrapper, migration tool, or advanced integration that needs direct profile/session/runtime control.

```ts
import { LocalStorageSaveCache, PersistlyClient } from "@persistlyapp/sdk";

const client = new PersistlyClient({
  runtimeKey: process.env.PERSISTLY_RUNTIME_KEY!,
  cache: new LocalStorageSaveCache(),
});

const created = await client.createProfile({
  accountData: { diamonds: 0 },
  character: {
    metadata: { _persistly: { slotKey: "autosave" } },
    state: { level: 1, coins: 0 },
  },
});

const result = await client.syncProfileCharacter({
  profileSaveId: created.profileSaveId,
  profileSessionToken: created.profileSessionToken,
  characterSaveId: created.character!.saveId,
  metadata: created.character!.metadata,
  state: { level: 2, coins: 50 },
});
```

The direct client exposes `baseVersion`, profile sessions, profile character routes, raw save routes, runtime config, and typed runtime errors. Beginner game code should prefer `PersistlyGameSaves`.

## API Origin

The SDK targets `https://api.persistly.app` by default. Normal game code only needs a runtime key.

## Contract Bundle

This repo pins `persistly-contract-v0.3.0` under `contracts/`.

The pinned bundle is authoritative for request/response semantics and runtime payload limits.

## Cache Helpers

- `MemorySaveCache` keeps canonical saves in memory.
- `FileSaveCache` stores canonical saves as JSON files on disk for Node/local development flows.
- `LocalStorageSaveCache` stores canonical saves in browser `localStorage`.
- `client.updateLocal(save)` writes a canonical save to the configured cache without making an API call.
- `client.getLocal(saveId)` reads the canonical save from the configured cache without making an API call.

## Examples

- `examples/browser-basic.ts` shows the browser-first `PersistlyGameSaves` facade.
- `examples/basic.ts` creates a profile with one character and syncs that character through the direct client.
- `examples/conflict.ts` shows a profile-scoped character conflict.
- `examples/vite-basic.ts` shows Vite environment variable configuration.

Read the full JavaScript guide at `https://docs.persistly.app/sdk/javascript`.

## Errors

- Runtime API errors are surfaced as typed errors such as `PersistlyUnauthorizedError`, `PersistlyForbiddenError`, `PersistlyNotFoundError`, and `PersistlyPayloadTooLargeError`.
- Rate limits surface as `PersistlyRateLimitedError`.
- Network or non-JSON transport failures surface as `PersistlyTransportError`.
- Local misuse such as missing `runtimeKey` or empty IDs surfaces as `PersistlyConfigurationError`.

## Development

```bash
pnpm install
pnpm validate:contract
pnpm test
pnpm build
```
