# One-Save JavaScript Template

Use this template when your game has one current save, such as an idle, casual, or chapter-based game. It uses the default `autosave` slot through `saveData`, `loadData`, and `forceSyncData`.

## Files

- `persistly-save-service.ts` wraps the Persistly facade behind game-shaped functions.
- `usage.ts` shows where to call the service from your own game code.

## Setup

Install the SDK:

```bash
npm install @persistlyapp/sdk
```

Paste the service into your project, call `configurePersistly` once during startup, call `saveGame` whenever local gameplay state changes, and call `syncGame` from safe lifecycle moments such as manual save, checkpoint, pause, or app background.

