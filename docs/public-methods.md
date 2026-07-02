# Persistly JavaScript SDK Public Methods

## Facade

- `PersistlyGameSaves.configure(config)` configures the shared facade. `config` accepts `runtimeKey`, optional `playerRef`, optional `externalAccountRef`, optional `accountId` plus `accountSessionToken`, storage options, and `onSyncResult`.
- `saveData(data, { slotInfo })`, `loadData()`, and `forceSyncData()` are the one-save path. They use the default `autosave` slot.
- `saveSlot(slotId, data, { slotInfo })`, `loadSlot(slotId)`, `forceSync(slotId)`, `syncDueSlots()`, `listSlots()`, `inspectSlot(slotId)`, and `refreshSlot(slotId)` are the named-slot path.
- `createAccount()`, `attachAccount({ accountId, accountSessionToken })`, `ensureAccount()`, `getAccountSession({ includeToken })`, `getAccountInfo()`, `clearLocalAccount()`, and `deleteAccount()` manage the account session boundary.
- `signInWithFirebaseToken(token, { deviceLabel })`, `signInWithSupabaseToken(token, { deviceLabel })`, `signInWithAuth0Token(token, { deviceLabel })`, and `signInWithProvider({ provider: "firebase" | "supabase" | "auth0", token, deviceLabel })` exchange a provider token from your game's auth SDK for a Persistly account session.
- `connectWithFirebaseToken(token, { deviceLabel })`, `connectWithSupabaseToken(token, { deviceLabel })`, `connectWithAuth0Token(token, { deviceLabel })`, `connectProvider({ provider: "firebase" | "supabase" | "auth0", token, deviceLabel })`, `linkProvider({ provider: "firebase" | "supabase" | "auth0", token, deviceLabel })`, `listLinkedProviders()`, and `signOut()` manage connect-later Auth Bridge sessions. `accountMode: "authRequired"` keeps local saves available but prevents anonymous cloud account creation before sign-in. Default anonymous-first mode is a Persistly account mode, not Firebase Anonymous Auth or a provider guest account.
- `isPersistlyAccountAuthConflict(error)` identifies the safe Auth Bridge conflict path where the provider identity is already linked to another Persistly account and the current local progress remains active.
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
Auth Bridge exchange uses the runtime key plus a provider token. Provider tokens are only used for sign-in/connect exchange calls. Normal save/load/sync routes use the Persistly `accountId` plus `accountSessionToken`, never provider tokens.
When linking to the current account, Auth Bridge also sends `X-Persistly-Account-ID` and `X-Persistly-Account-Session`.
If connect-later returns `account_auth_conflict`, the current local anonymous progress remains intact. Games can keep local progress, ask the player to choose a different provider account and retry connect, or explicitly clear local Persistly state and sign into the provider-linked cloud account. Persistly does not copy anonymous progress into the provider-linked account in this flow.
Linked provider listing uses the runtime key plus `X-Persistly-Account-ID` and `X-Persistly-Account-Session`.
