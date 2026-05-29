import {
  attachPersistlyAccount,
  configurePersistly,
  exportPersistlyAccountForBackend,
  saveAccountSlot,
  syncAccountSlot,
  type AccountRestorePayload,
} from "./persistly-save-service.js";

await configurePersistly("ps_test_replace_me");

// First device: create or reuse the local Persistly account and send this
// payload to your trusted backend over HTTPS. Do not log the token.
const restorePayload = await exportPersistlyAccountForBackend();
await sendPersistlySessionToBackend(restorePayload);

await saveAccountSlot("campaign-1", { level: 7, coins: 1200 }, "Campaign 1");
await syncAccountSlot("campaign-1");

// Second device: fetch the stored payload after your own player sign-in.
const restored = await fetchPersistlySessionFromBackend();
await attachPersistlyAccount(restored);

async function sendPersistlySessionToBackend(_payload: AccountRestorePayload): Promise<void> {
  // Replace with your authenticated backend request.
}

async function fetchPersistlySessionFromBackend(): Promise<AccountRestorePayload> {
  // Replace with your authenticated backend request.
  return {
    accountId: "acc_replace_me",
    accountSessionToken: "pst_replace_me",
  };
}
