# Changelog

## 1.3.0

- Exposes `isPersistlyAccountAuthConflict` so games can identify Auth Bridge account conflicts without string-matching error codes.
- Clarifies anonymous-first Auth Bridge conflict handling: local progress stays active when a provider identity already belongs to another Persistly account.
- Updates anonymous-first examples and docs to avoid implying automatic merge, copy, import, overwrite, or replacement of provider-linked account data.

## 1.2.0

- Adds explicit connect-later helpers for anonymous-first games: `connectWithFirebaseToken`, `connectWithSupabaseToken`, `connectWithAuth0Token`, and `connectProvider`.
- Adds an anonymous-first Auth Bridge template showing how to keep local/cloud progress before sign-in and connect Firebase later without silently overwriting saves.
- Clarifies Auth Bridge docs so provider tokens are used only for sign-in/connect exchanges while normal save/load/sync calls continue on Persistly account sessions.

## 1.1.0

- Adds Auth Bridge helpers for games that already sign players in with Firebase Auth, Supabase Auth, or Auth0.
- Adds `authRequired` account mode so games can keep local saves before sign-in while cloud sync waits for a provider token exchange.
- Adds provider sign-in, provider linking, linked-provider listing, and provider-specific error classes for safe setup diagnostics.
- Adds Auth Bridge templates and examples while keeping normal save/load/sync calls on Persistly account sessions, not provider tokens.

## 1.0.0

- Marks the JavaScript SDK as the first stable Persistly browser-game SDK release.
- Keeps the account-first public surface introduced in the `0.11.x` release line: `PersistlyGameSaves`, one-save helpers, named slots, account data, transfer codes, and conflict helpers.
- Ships the account/slot runtime contract bundle, local-first templates, public README examples, and SDK diagnostics version `1.0.0`.
- Publishes under `@persistlyapp/sdk` with npm provenance through GitHub Trusted Publishing.

## 0.11.5

- Fixes lower-level account/slot conflict parsing so current public conflict responses with top-level `slot` or `account` fields work without expecting legacy raw `save` payloads.
- Updates live examples to use the public package surface without importing internal cache helpers.
- Updates the SDK diagnostics version constant to match the published package version.

## 0.11.4

- Removes the remaining raw save compatibility exports from the public package surface so release builds stay on account, account session, slot, `slotInfo`, and data terminology.
- Updates the bundled account-first contract examples and payload-limit validation names to avoid profile-era `state`/`metadata` wording in public diagnostics.
- Adds public-surface regression coverage for removed compatibility subpath exports.
- Clarifies README examples so quickstart code uses game-facing render/status helpers and sends account sessions to a trusted backend without logging tokens.

## 0.11.3

- Fixes the lower-level account-data sync route so `saveAccountData`, `patchAccountData`, and `forceSyncAccount` call the public `/api/v1/accounts/{accountId}/data/sync` endpoint.
- Adds a route regression test for account-data sync.

## 0.11.2

- Adds short-lived account transfer-code helpers for moving anonymous saves between browsers/devices without public account lookup.
- Adds typed transfer-code runtime errors for invalid, expired, consumed, rate-limited, and disabled transfer-code flows.
- Documents browser-to-browser and cross-SDK transfer patterns through the public docs and resource center.

## 0.11.1

- Fixes the `PersistlyGameSaves` facade runtime result shape so `loadData()`, `loadSlot()`, and `inspectSlot()` return the public `data`, `slotInfo`, `slotId`, `lastCloudData`, and `lastCloudSlotInfo` fields promised by the TypeScript declarations and docs.
- Keeps `state`, `metadata`, `slotKey`, `lastCloudState`, and `lastCloudMetadata` as runtime compatibility aliases for callers that adopted the first `0.11.0` package before this patch.

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
