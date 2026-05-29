# Multi-Slot JavaScript Template

Use this template when your game has manual saves, campaign files, character slots, or a slot-select screen. Each save uses a stable developer slot id such as `campaign-1` or `speedrun`.

## Files

- `persistly-save-service.ts` wraps named slot save, load, list, and sync calls.
- `usage.ts` shows a slot-select style flow.

## Slot Ids

Persist stable slot ids in your game UI or save menu. Do not use display names as ids if players can rename them.

