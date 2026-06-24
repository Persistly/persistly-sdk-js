<p align="center">
  <img src="./assets/persistly-js-sdk-banner.png" alt="Persistly JavaScript SDK - Cloud saves for browser games" />
</p>

# Persistly JavaScript SDK

[![CI](https://github.com/Persistly/persistly-sdk-js/actions/workflows/ci.yml/badge.svg)](https://github.com/Persistly/persistly-sdk-js/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@persistlyapp/sdk.svg)](https://www.npmjs.com/package/@persistlyapp/sdk)
[![npm provenance](https://img.shields.io/badge/npm%20provenance-ready-2ea44f)](https://docs.npmjs.com/trusted-publishers)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![docs](https://img.shields.io/badge/docs-persistly.app-6467f2)](https://docs.persistly.app/sdk/javascript)

JavaScript SDK for Persistly cloud saves in browser games, JavaScript game clients, and JS-based engine wrappers.

Most games should start with `PersistlyGameSaves`: configure once, save data locally, load locally, and sync to Persistly at safe moments. Simple games can use `saveData` and `loadData`. Games with manual saves or multiple slots can use `saveSlot` and `loadSlot`.

This package is `1.1.0` and includes the account-first `persistly-contract-v0.4.0` bundle for release validation.

## Install

```bash
npm install @persistlyapp/sdk
```

### Browser Module CDN

For prototypes, plain HTML demos, and quick playgrounds, you can import the ESM build through jsDelivr:

```html
<script type="module">
  import {
    PersistlyGameSaveStatus,
    PersistlyGameSaves,
  } from "https://cdn.jsdelivr.net/npm/@persistlyapp/sdk@1/+esm";

  await PersistlyGameSaves.configure({
    runtimeKey: "ps_test_replace_me",
  });

  await PersistlyGameSaves.shared.saveData({
    level: 1,
    coins: 50,
  });

  const sync = await PersistlyGameSaves.shared.forceSyncData();

  if (sync.status === PersistlyGameSaveStatus.Synced) {
    console.log("Synced to Persistly.");
  }
</script>
```

Use npm for production apps when possible. Use jsDelivr for small demos, no-build examples, or environments where adding a bundler is unnecessary.

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
renderGameFromSave(loaded.data);

const sync = await PersistlyGameSaves.shared.forceSyncData();

if (sync.status === PersistlyGameSaveStatus.Synced) {
  showSaveStatus("synced");
}
```

## Account Sessions

Games with their own sign-in system should store the Persistly account session in a trusted backend so the same player can restore the same account on another device.

```ts
const session = await PersistlyGameSaves.shared.getAccountSession({
  includeToken: true,
});

// Send session.accountId and session.accountSessionToken to your trusted backend over HTTPS.
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

Anonymous transfer flow:

```ts
const transfer = await PersistlyGameSaves.shared.createTransferCode({
  deviceLabel: "Browser",
});

// Show transfer.transferCode to the player. It expires soon.
// On the new device, call this before local progress exists.
await PersistlyGameSaves.shared.attachWithTransferCode(transfer.transferCode);
```

Use `clearLocalAccount()` for local sign-out only. Use `deleteAccount()` for permanent remote erasure. Use `archiveSlot(slotId)` to retire an active slot and `deleteSlot(slotId)` to permanently erase one slot.

## Auth Bridge

Use Auth Bridge when your game already signs players in with Firebase Auth, Supabase Auth, or Auth0. Persistly verifies the provider token once, then returns a normal Persistly account session. Save, load, and sync calls do not send provider tokens.

```ts
await PersistlyGameSaves.configure({
  runtimeKey: "ps_test_replace_me",
  accountMode: "authRequired",
});

// Get this ID token from Firebase Auth in your game client.
const firebaseIdToken = await firebaseUser.getIdToken();

await PersistlyGameSaves.shared.signInWithFirebaseToken(firebaseIdToken, {
  deviceLabel: "Browser",
});

await PersistlyGameSaves.shared.saveData({
  level: 5,
  coins: 1200,
});

await PersistlyGameSaves.shared.forceSyncData();
```

For Supabase Auth, configure the Supabase project URL for the Persistly environment in the dashboard, then send the access token returned by your Supabase game login flow. Do not paste Supabase service role keys or JWT secrets into game code or Persistly setup.

```ts
const { data, error } = await supabase.auth.signInWithPassword({
  email,
  password,
});
if (error) throw error;

const supabaseAccessToken = data.session.access_token;

await PersistlyGameSaves.shared.signInWithSupabaseToken(supabaseAccessToken, {
  deviceLabel: "Browser",
});
```

For Auth0, configure the Auth0 tenant domain for the Persistly environment in the dashboard, then send an Auth0 ID token or a configured-audience access token from your game login flow.

```ts
const auth0Token = await auth0Client.getTokenSilently();

await PersistlyGameSaves.shared.signInWithAuth0Token(auth0Token, {
  deviceLabel: "Browser",
});
```

The lower-level provider helper is available for wrappers that prefer an explicit provider key. Supported provider keys are `"firebase"`, `"supabase"`, and `"auth0"`:

```ts
await PersistlyGameSaves.shared.signInWithProvider({
  provider: "firebase",
  token: firebaseIdToken,
  deviceLabel: "Browser",
});

await PersistlyGameSaves.shared.signInWithProvider({
  provider: "supabase",
  token: supabaseAccessToken,
  deviceLabel: "Browser",
});

await PersistlyGameSaves.shared.signInWithProvider({
  provider: "auth0",
  token: auth0Token,
  deviceLabel: "Browser",
});
```

To attach an additional provider to the current Persistly account:

```ts
await PersistlyGameSaves.shared.linkProvider({
  provider: "firebase",
  token: firebaseIdToken,
});

await PersistlyGameSaves.shared.linkProvider({
  provider: "supabase",
  token: supabaseAccessToken,
});

await PersistlyGameSaves.shared.linkProvider({
  provider: "auth0",
  token: auth0Token,
});
```

To show already-linked providers in an account settings screen:

```ts
const providers = await PersistlyGameSaves.shared.listLinkedProviders();
```

Use `signOut()` to clear Persistly local account and slot data from the current device.

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
- `templates/auth-required` for games that require provider sign-in before cloud sync.

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

const transfer = await client.createTransferCode({
  accountId: created.accountId,
  accountSessionToken: created.accountSessionToken,
});
```

The SDK targets `https://api.persistly.app` by default. Normal game code only needs a runtime key.
