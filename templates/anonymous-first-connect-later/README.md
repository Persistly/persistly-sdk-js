# Anonymous-First Connect-Later JavaScript Template

Use this template when your game lets players start immediately, then offers Firebase, Supabase, or Auth0 account connection after progress exists.

Persistly anonymous-first is a Persistly account mode. It is not Firebase Anonymous Auth, Supabase anonymous sign-in, or an Auth0 guest user. The player can save locally and sync to an anonymous Persistly account before they ever open your provider login UI.

The flow is:

1. Configure Persistly in the default anonymous-first mode.
2. Save and load local progress immediately.
3. Sync at safe moments; Persistly creates an anonymous cloud account if needed.
4. When the player chooses account connection, get a provider token from your game's existing Firebase, Supabase, or Auth0 SDK.
5. Call `connectWithFirebaseToken`, `connectWithSupabaseToken`, or `connectWithAuth0Token`.
6. If the provider is already linked to another Persistly account, Persistly returns `account_auth_conflict`. The SDK keeps the current local progress; ask the player before clearing local data and switching accounts.

Persistly does not provide login UI in this phase. Your game owns the Firebase, Supabase, or Auth0 sign-in flow.

Provider tokens are only used for sign-in or connect calls. Normal `saveData`, `loadData`, and `forceSyncData` calls continue using the Persistly `accountId` plus `accountSessionToken`; do not store provider tokens in save data or send them with normal sync.
