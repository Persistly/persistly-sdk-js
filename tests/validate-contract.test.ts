import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const sourceRoot = path.resolve(import.meta.dirname, "..");

test("validate-contract rejects unexpected extra files in the pinned bundle", async () => {
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), "persistly-sdk-js-validate-"));

  try {
    await cp(path.join(sourceRoot, "scripts"), path.join(sandboxRoot, "scripts"), { recursive: true });
    await cp(path.join(sourceRoot, "contracts"), path.join(sandboxRoot, "contracts"), { recursive: true });
    await writeFile(
      path.join(
        sandboxRoot,
        "contracts",
        "persistly-contract-v0.3.0",
        "examples",
        "unexpected.json",
      ),
      "{}\n",
      "utf8",
    );

    await assert.rejects(
      () => execFileAsync("node", [path.join(sandboxRoot, "scripts", "validate-contract.mjs")]),
      /unexpected files/i,
    );
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});

test("validate-contract asserts the pinned manifest metadata", async () => {
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), "persistly-sdk-js-validate-"));

  try {
    await cp(path.join(sourceRoot, "scripts"), path.join(sandboxRoot, "scripts"), { recursive: true });
    await cp(path.join(sourceRoot, "contracts"), path.join(sandboxRoot, "contracts"), { recursive: true });

    const manifestPath = path.join(
      sandboxRoot,
      "contracts",
      "persistly-contract-v0.3.0",
      "manifest.json",
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    manifest.schemaVersion = 2;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    await assert.rejects(
      () => execFileAsync("node", [path.join(sandboxRoot, "scripts", "validate-contract.mjs")]),
      /schemaVersion/i,
    );
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});
