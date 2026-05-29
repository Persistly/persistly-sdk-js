# Persistly JavaScript SDK Public Methods

## Facade

- `PersistlyGameSaves.configure(config)` configures the shared facade. `config` accepts `runtimeKey`, optional `playerRef`, optional `externalAccountRef`, optional `accountId` plus `accountSessionToken`, storage options, and `onSyncResult`.
- `saveData(data, { slotInfo })`, `loadData()`, and `forceSyncData()` are the one-save path. They use the default `autosave` slot.
- `saveSlot(slotId, data, { slotInfo })`, `loadSlot(slotId)`, `forceSync(slotId)`, `syncDueSlots()`, `listSlots()`, `inspectSlot(slotId)`, and `refreshSlot(slotId)` are the named-slot path.
- `createAccount()`, `attachAccount({ accountId, accountSessionToken })`, `ensureAccount()`, `getAccountSession({ includeToken })`, `getAccountInfo()`, `clearLocalAccount()`, and `deleteAccount()` manage the account session boundary.
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

Account and slot routes use `X-Persistly-Account-Session`.
