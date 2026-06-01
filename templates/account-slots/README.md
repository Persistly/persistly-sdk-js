# Account + Slots JavaScript Template

Use this template when your game has sign-in, cross-device restore, transfer codes, or a backend that stores the Persistly account session for the player.

The token export path is explicit. Send `accountId` and `accountSessionToken` to your trusted backend over HTTPS, and never log the session token.
Transfer codes are short-lived; show them only to the player who is moving their save.

## Files

- `persistly-save-service.ts` wraps account attach/export, transfer codes, and named slot save and sync.
- `usage.ts` shows first-device export, transfer-code display, and second-device attach.
