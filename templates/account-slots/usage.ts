import {
  attachPersistlyAccountWithTransferCode,
  attachPersistlyAccount,
  configurePersistly,
  exportPersistlyAccountForBackend,
  createPersistlyTransferCode,
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

// Optional anonymous transfer: show this short-lived code to the player.
const transfer = await createPersistlyTransferCode("First device");
showTransferCodeToPlayer(transfer.transferCode, transfer.expiresAt);

// Second device option A: fetch the stored payload after your own player sign-in.
async function restoreFromBackend(): Promise<void> {
  const restored = await fetchPersistlySessionFromBackend();
  await attachPersistlyAccount(restored);
}

// Or, on a fresh second device with no local progress, attach with the code.
async function restoreFromTransferCode(transferCode: string): Promise<void> {
  await attachPersistlyAccountWithTransferCode(transferCode, "Second device");
}

void restoreFromBackend;
void restoreFromTransferCode;

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

function showTransferCodeToPlayer(_transferCode: string, _expiresAt: string): void {
  // Render this in your transfer screen with an expiry countdown.
}
