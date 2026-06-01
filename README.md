# Persistly JavaScript SDK

JavaScript SDK for Persistly cloud saves in browser games, JavaScript game clients, and JS-based engine wrappers.

Most games should start with `PersistlyGameSaves`: configure once, save data locally, load locally, and sync to Persistly at safe moments. Simple games can use `saveData` and `loadData`. Games with manual saves or multiple slots can use `saveSlot` and `loadSlot`.

This package is `0.11.0` and includes the account-first `persistly-contract-v0.4.0` bundle for release validation.

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
});

await PersistlyGameSaves.shared.saveData({
  level: 5,
  coins: 1200,
  checkpoint: "forest-gate",
}, {
  slotInfo: { characterName: "Astra", level: 5 },
});

const loaded = await PersistlyGameSaves.shared.loadData();
console.log("Loaded local data:", loaded.data);

const sync = await PersistlyGameSaves.shared.forceSyncData();

if (sync.status === PersistlyGameSaveStatus.Synced) {
  console.log("Synced to Persistly.");
}
```

## Account Sessions

Games with their own sign-in system should store the Persistly account session in a trusted backend so the same player can restore the same account on another device.

```ts
const session = await PersistlyGameSaves.shared.getAccountSession({
  includeToken: true,
});

console.log(session.accountId);
// Send session.accountSessionToken to your trusted backend over HTTPS.
// Do not log, expose, or publish the session token.
```

Explicit account flows:

```ts
await PersistlyGameSaves.shared.createAccount();

await PersistlyGameSaves.shared.attachAccount({
  accountId: "acc_replace_me",
  accountSessionToken: "pst_account_session",
});
```

Use `clearLocalAccount()` for local sign-out only. Use `deleteAccount()` for permanent remote erasure. Use `archiveSlot(slotId)` to retire an active slot and `deleteSlot(slotId)` to permanently erase one slot.

## Account Data

Use account data for account-wide gameplay values such as unlocked slots, settings, shared inventory, or premium balance after trusted purchase validation.

```ts
await PersistlyGameSaves.shared.saveAccountData({
  diamonds: 1200,
  unlockedSlots: 6,
});

await PersistlyGameSaves.shared.forceSyncAccount();
```

`patchAccountData` performs a shallow top-level merge. `null` removes a top-level key.

## Templates

- `templates/one-save` for idle, casual, and one-save games.
- `templates/multi-slot` for manual saves, campaigns, and slot select screens.
- `templates/account-slots` for games with sign-in or cross-device restore.

## Advanced Runtime Client

Use `PersistlyClient` directly only for custom wrappers or advanced integrations.

```ts
import { PersistlyClient } from "@persistlyapp/sdk";

const client = new PersistlyClient({
  runtimeKey: process.env.PERSISTLY_RUNTIME_KEY!,
});

const created = await client.createAccount({
  accountData: { diamonds: 0 },
  slot: {
    slotId: "autosave",
    slotInfo: { characterName: "Astra" },
    data: { level: 1, coins: 0 },
  },
});

await client.syncAccountSlot({
  accountId: created.accountId,
  accountSessionToken: created.accountSessionToken,
  slotId: "autosave",
  data: { level: 2, coins: 50 },
  slotInfo: { characterName: "Astra", level: 2 },
});
```

The SDK targets `https://api.persistly.app` by default. Normal game code only needs a runtime key.
