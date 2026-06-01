# Changelog

## 0.11.0

- Publishes the account-first JavaScript SDK surface under `@persistlyapp/sdk`.
- Removes public profile compatibility exports and uses account, account session, slot, `slotInfo`, and data terminology throughout the package.
- Keeps the facade-first path for games with `saveData`, `loadData`, `forceSyncData`, named slot helpers, account-data helpers, explicit account session export, and account-first conflict helpers.
- Includes JavaScript templates for one-save, multi-slot, and account + slots game shapes.

## 0.10.2

- Recovers automatically when a remote slot already exists but local SDK state has lost its slot binding.
- Reconciles the remote account slot reference, loads the canonical slot save, and retries slot sync instead of surfacing a terminal `slot_already_exists` error.

## 0.10.1

- Fixes browser payload validation so the SDK does not require Node `Buffer`.
- Fixes exported account declaration types for strict TypeScript consumers.
- Preserves autosave drafts when remote sync returns a conflict.
- Adds a package-consumer smoke check for packed npm artifacts.

## 0.10.0

- Renames the npm package to `@persistlyapp/sdk`.
- Pins `persistly-contract-v0.4.0` and adds account creation, optional initial slots, account-data sync, slot archive, slot summaries, and typed slot/archive errors.
- Reworks `PersistlyGameSaves` as an account-backed, local-first facade with exported game-save status and target constants.

## 0.9.1

- Renames the optional public save reference field to `playerRef`.
- Adds `LocalStorageSaveCache` for browser games that persist save snapshots in `localStorage`.
- Pins `persistly-contract-v0.2.0` with the release-path `playerRef` contract.

## 0.9.0

- Release candidate for the first public JavaScript SDK repository.
- Keeps the runtime API focused on create, load, sync, typed sync status, structured errors, and local cache helpers.
- Documents `saveId` persistence and integer save `version` semantics through the pinned contract bundle.

## 0.1.0

- Initial JavaScript SDK candidate for Persistly create, load, sync, local cache, typed sync status, and structured runtime errors.
- Targets the production runtime API at `https://api.persistly.app`.
- Pins `persistly-contract-v0.1.0` for OpenAPI, examples, and runtime payload limits.
