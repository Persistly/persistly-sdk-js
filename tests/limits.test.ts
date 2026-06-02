import test from "node:test";
import assert from "node:assert/strict";

import { PersistlyPayloadTooLargeError } from "../src/errors.js";
import { validatePayloadLimits } from "../src/limits.js";

const largeValue = "x".repeat(3_000_000);

test("validatePayloadLimits reports accountData with public facade terms", () => {
  assert.throws(
    () => validatePayloadLimits({ accountData: { largeValue } }),
    (error) => {
      assert.ok(error instanceof PersistlyPayloadTooLargeError);
      assert.match(error.message, /Account data exceeds/i);
      assert.equal(error.details?.field, "accountData");
      return true;
    },
  );
});

test("validatePayloadLimits reports slotInfo and data with public facade terms", () => {
  assert.throws(
    () => validatePayloadLimits({ slotInfo: { largeValue } }),
    (error) => {
      assert.ok(error instanceof PersistlyPayloadTooLargeError);
      assert.match(error.message, /Slot info exceeds/i);
      assert.equal(error.details?.field, "slotInfo");
      return true;
    },
  );

  assert.throws(
    () => validatePayloadLimits({ data: { largeValue } }),
    (error) => {
      assert.ok(error instanceof PersistlyPayloadTooLargeError);
      assert.match(error.message, /Data exceeds/i);
      assert.equal(error.details?.field, "data");
      return true;
    },
  );
});
