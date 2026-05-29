# Account + Slots JavaScript Template

Use this template when your game has sign-in, cross-device restore, or a backend that stores the Persistly account session for the player.

The token export path is explicit. Send `accountId` and `accountSessionToken` to your trusted backend over HTTPS, and never log the session token.

## Files

- `persistly-save-service.ts` wraps account attach/export plus named slot save and sync.
- `usage.ts` shows first-device export and second-device attach.

