import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

test("public facade source uses data terms and marks raw save compatibility fields internal", async () => {
  const source = await readFile("src/game-saves.ts", "utf8");

  assert.match(source, /saveData\(data: JsonObject/);
  assert.match(source, /saveSlot\(slotId: string, data: JsonObject/);
  assert.doesNotMatch(source, /saveData\(state: JsonObject/);
  assert.doesNotMatch(source, /saveSlot\(slotId: string, state: JsonObject/);
  assert.doesNotMatch(source, /(?<!\/\*\* @internal \*\/\n\s*)cloudSave: Save/);
  assert.doesNotMatch(source, /(?<!\/\*\* @internal \*\/\n\s*)save\?: Save/);
  assert.doesNotMatch(source, /(?<!\/\*\* @internal \*\/\n\s*)account\?: Save/);
});

test("public client source does not expose raw save route compatibility", async () => {
  const source = await readFile("src/client.ts", "utf8");

  assert.doesNotMatch(source, /\/api\/v1\/saves/);
  assert.doesNotMatch(source, /\bcreateSave\s*\(/);
  assert.doesNotMatch(source, /\bloadSave\s*\(/);
  assert.doesNotMatch(source, /\bsyncSave\s*\(/);
  assert.doesNotMatch(source, /export interface CreateSaveInput/);
  assert.doesNotMatch(source, /export interface SyncSaveInput/);
});

test("package root and exported subpaths do not expose raw cache schema modules", async () => {
  const indexSource = await readFile("src/index.ts", "utf8");
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { exports: Record<string, unknown> };

  assert.doesNotMatch(indexSource, /cache\.js/);
  assert.doesNotMatch(indexSource, /schema\.js/);
  assert.doesNotMatch(indexSource, /file-cache\.js/);
  assert.doesNotMatch(indexSource, /local-storage-cache\.js/);

  for (const privateSubpath of ["./cache", "./schema", "./file-cache", "./local-storage-cache"]) {
    assert.equal(packageJson.exports[privateSubpath], undefined);
  }
});

test("public auth bridge surface is Firebase and Supabase only", async () => {
  const [
    readme,
    publicMethods,
    authRequiredReadme,
    authRequiredService,
    authRequiredUsage,
    examples,
  ] = await Promise.all([
    readFile("README.md", "utf8"),
    readFile("docs/public-methods.md", "utf8"),
    readFile("templates/auth-required/README.md", "utf8"),
    readFile("templates/auth-required/persistly-save-service.ts", "utf8"),
    readFile("templates/auth-required/usage.ts", "utf8"),
    readdir("examples"),
  ]);
  const publicText = [
    readme,
    publicMethods,
    authRequiredReadme,
    authRequiredService,
    authRequiredUsage,
  ].join("\n");

  assert.equal(examples.includes("auth-google.ts"), false);
  assert.equal(examples.includes("auth-oidc.ts"), false);
  assert.equal(examples.includes("auth-supabase.ts"), true);
  assert.match(publicText, /signInWithFirebaseToken/);
  assert.match(publicText, /signInWithSupabaseToken/);
  assert.match(publicText, /provider: "firebase" \| "supabase"/);
  assert.doesNotMatch(publicText, /signInWithGoogleIdToken/);
  assert.doesNotMatch(publicText, /auth-google/);
  assert.doesNotMatch(publicText, /auth-oidc/);
  assert.doesNotMatch(publicText, /\boidc_jwt\b/i);
  assert.doesNotMatch(publicText, /\bOIDC\b/);
  assert.doesNotMatch(publicText, /\bGoogle\b/);
});
