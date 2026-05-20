# Persistly JavaScript SDK

JavaScript SDK for Persistly cloud saves in browser games, JavaScript game clients, and JS-based engine wrappers.

Most games should start with `PersistlyGameSaves`: configure once, save named slots locally, load named slots locally, and sync to Persistly at safe moments.

This package is `0.10.1` and pins `persistly-contract-v0.3.0`.

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
- `saveSlot` also guarantees a local profile envelope exists, even before the first remote sync.
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

For explicit profile-first flows:

```ts
await PersistlyGameSaves.shared.createProfile();

await PersistlyGameSaves.shared.attachProfile({
  profileSaveId: "sv_profile",
  profileSessionToken: "pst_profile_session",
});
```

Typical cross-browser flow:

1. Browser A signs in to your game account.
2. Browser A saves and force-syncs at least once.
3. Browser A exports `profileSaveId` and `profileSessionToken` with `getProfileSession({ includeToken: true })`.
4. Your trusted backend stores those values for the signed-in user.
5. Browser B signs in to the same game account.
6. Browser B asks your backend for the Persistly profile link, then calls `attachProfile(...)`.
7. Browser B calls `refreshSlot("autosave")` before continuing from that slot.

Anonymous localStorage saves cannot recover on a new browser if the profile session was never stored outside that browser.

Facade rules:

- `createProfile()` creates and stores one local facade profile, then syncs it to Persistly.
- `createProfile()` rejects if local profile or slot state already exists.
- `attachProfile()` loads an already existing Persistly profile into empty local state.
- `clearLocalProfile()` is local-only. It does not delete remote Persistly data.
- `archiveSlot()` retires a synced remote slot but keeps remote history/loadability.
- `deleteSlot()` permanently erases one slot. Unsynced local-only slots are removed locally without a runtime call.
- `deleteProfile()` permanently erases one profile and all synced slots under it. Unsynced local-only state falls back to a local clear.
- If you want to switch players on the same device, call `clearLocalProfile()` first.

To sign out locally or start fresh on the same device:

```ts
await PersistlyGameSaves.shared.clearLocalProfile();
```

That clears the local profile session and all local slots for the configured namespace. If your game supports real account switching, call `configure` again with the next player's `localProfileKey` or external identity after clearing local state.

To permanently erase remote player data:

```ts
await PersistlyGameSaves.shared.deleteSlot("autosave");
await PersistlyGameSaves.shared.deleteProfile();
```

## Account Data

Use profile account data for account-wide gameplay values such as unlocked slots, premium currency balance after trusted purchase validation, shared inventory, or account settings.

```ts
await PersistlyGameSaves.shared.saveAccountData({
  diamonds: 1200,
  unlockedSlots: 6,
});

await PersistlyGameSaves.shared.forceSyncProfile();
```

Use `saveAccountData` when replacing the whole account data object. Use `patchAccountData` for a shallow top-level merge:

```ts
await PersistlyGameSaves.shared.patchAccountData({
  diamonds: 1300,
  bundles: { starter: true },
  sharedInventory: [1, 25, 35],
});
```

Patch notes:

- top-level keys are merged
- `null` removes a top-level key
- arrays are replaced as values
- nested objects are replaced unless your game reads, merges, and writes them intentionally

Do not store raw payment transactions, card data, receipts, invoices, or billing history in Persistly saves. Validate purchases through your trusted payment provider flow, then store only derived gameplay state.

## Conflicts

Persistly never overwrites local gameplay state automatically on conflict. When cloud state is newer, the SDK keeps both versions so your game can decide.

```ts
const sync = await PersistlyGameSaves.shared.forceSync("autosave");

if (sync.status === PersistlyGameSaveStatus.Conflict) {
  const slot = await PersistlyGameSaves.shared.inspectSlot("autosave");

  // slot.state is local gameplay state.
  // slot.lastCloudState is the canonical cloud version.
  // Show a UI, merge intentionally, or keep local for later.
}
```

Safe recovery helpers:

```ts
await PersistlyGameSaves.shared.acceptCloudVersion("autosave");
await PersistlyGameSaves.shared.overwriteCloudVersion("autosave");
await PersistlyGameSaves.shared.keepLocalForLater("autosave");
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

await client.deleteProfileCharacter({
  profileSaveId: created.profileSaveId,
  profileSessionToken: created.profileSessionToken,
  characterSaveId: created.character!.saveId,
});
```

The direct client exposes `baseVersion`, profile sessions, profile character routes, profile delete routes, raw save routes, runtime config, and typed runtime errors. Beginner game code should prefer `PersistlyGameSaves`.

`PersistlyClient.createProfile()` is intentionally a low-level API call. It always attempts to create a new remote profile and does not inspect local facade state. Normal game code should prefer `PersistlyGameSaves.ensureProfile()` and slot sync methods instead.

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
