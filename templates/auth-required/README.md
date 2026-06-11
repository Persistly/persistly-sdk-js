# Auth-Required JavaScript Template

Use this template when your game shows sign-in before gameplay and should not create anonymous cloud accounts. Local saves still work after sign-in; cloud sync waits until the provider token is exchanged for a Persistly account session.

## Files

- `persistly-save-service.ts` wraps configuration, provider sign-in, local save/load, sync, and sign-out.
- `usage.ts` shows provider sign-in flows. Use `signInWithFirebaseToken`, `signInWithSupabaseToken`, or `signInWithAuth0Token` for the provider configured in the Persistly dashboard.

## Provider Tokens

Send Firebase ID tokens only to `signInWithFirebaseToken` or `signInWithProvider({ provider: "firebase", ... })`. Send Supabase access tokens only to `signInWithSupabaseToken` or `signInWithProvider({ provider: "supabase", ... })`. Send Auth0 tokens only to `signInWithAuth0Token` or `signInWithProvider({ provider: "auth0", ... })`. Normal save, load, and sync calls use the Persistly account session returned by the SDK.

On sign-out, the SDK clears Persistly local account and slot data from this device.
