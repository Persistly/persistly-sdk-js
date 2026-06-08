# Auth-Required JavaScript Template

Use this template when your game shows sign-in before gameplay and should not create anonymous cloud accounts. Local saves still work after sign-in; cloud sync waits until the provider token is exchanged for a Persistly account session.

## Files

- `persistly-save-service.ts` wraps configuration, provider sign-in, local save/load, sync, and sign-out.
- `usage.ts` shows a Firebase Auth sign-in flow.

## Provider Tokens

Send Firebase ID tokens only to `signInWithFirebaseToken` or `signInWithProvider({ provider: "firebase", ... })`. Normal save, load, and sync calls use the Persistly account session returned by the SDK.

On sign-out, the SDK clears Persistly local account and slot data from this device.
