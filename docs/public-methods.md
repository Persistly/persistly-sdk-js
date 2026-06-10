# Persistly JavaScript SDK Public Methods

## Facade

- `PersistlyGameSaves.configure(config)` configures the shared facade. `config` accepts `runtimeKey`, optional `playerRef`, optional `externalAccountRef`, optional `accountId` plus `accountSessionToken`, storage options, and `onSyncResult`.
- `saveData(data, { slotInfo })`, `loadData()`, and `forceSyncData()` are the one-save path. They use the default `autosave` slot.
- `saveSlot(slotId, data, { slotInfo })`, `loadSlot(slotId)`, `forceSync(slotId)`, `syncDueSlots()`, `listSlots()`, `inspectSlot(slotId)`, and `refreshSlot(slotId)` are the named-slot path.
- `createAccount()`, `attachAccount({ accountId, accountSessionToken })`, `ensureAccount()`, `getAccountSession({ includeToken })`, `getAccountInfo()`, `clearLocalAccount()`, and `deleteAccount()` manage the account session boundary.
- `signInWithFirebaseToken(token, { deviceLabel })`, `signInWithSupabaseToken(token, { deviceLabel })`, `signInWithProvider({ provider: "firebase" | "supabase", token, deviceLabel })`, `linkProvider({ provider: "firebase" | "supabase", token, deviceLabel })`, `listLinkedProviders()`, and `signOut()` manage Auth Bridge sessions. `accountMode: "authRequired"` keeps local saves available but prevents anonymous cloud account creation before sign-in.
- `getAccountData()`, `saveAccountData(accountData)`, `patchAccountData(accountDataPatch)`, `forceSyncAccount()`, and `syncDueAccount()` manage account-wide gameplay data.
- `archiveSlot(slotId)` retires an active remote slot. `deleteSlot(slotId)` permanently erases a slot. `clearLocalSlot(slotId)` only clears local state.

## Low-Level Client

`PersistlyClient` exposes account routes for advanced wrappers:

- `createAccount(payload)`
- `loadAccount({ accountId, accountSessionToken })`
- `syncAccountData({ accountId, accountSessionToken, baseVersion, accountData | accountDataPatch })`
- `createAccountSlot({ accountId, accountSessionToken, slotId, slotInfo, data })`
- `loadAccountSlot({ accountId, accountSessionToken, slotId })`
- `syncAccountSlot({ accountId, accountSessionToken, slotId, baseVersion, slotInfo, data })`
- `archiveAccountSlot({ accountId, accountSessionToken, slotId })`
- `deleteAccountSlot({ accountId, accountSessionToken, slotId })`
- `deleteAccount({ accountId, accountSessionToken })`
- `exchangeAccountAuthSession({ provider, token, deviceLabel, accountId?, accountSessionToken? })`
- `listLinkedAuthProviders({ accountId, accountSessionToken })`

Account and slot routes use `X-Persistly-Account-Session`.
Auth Bridge exchange uses the runtime key plus a provider token. When linking to the current account, it also sends `X-Persistly-Account-ID` and `X-Persistly-Account-Session`.
Linked provider listing uses the runtime key plus `X-Persistly-Account-ID` and `X-Persistly-Account-Session`.
