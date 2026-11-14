import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

const origin = new URL(process.argv[2] ?? "https://omnimail.io.vn");
const builtHtml = await readFile(
  new URL("../apps/web/dist/index.html", import.meta.url),
  "utf8",
);
const entry = builtHtml.match(/<script[^>]+src="([^"]+\.js)"/u)?.[1];
assert.ok(entry, "The build must contain an entry script");

async function check(path, checkBody) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const response = await fetch(new URL(path, origin), {
        headers: { "Cache-Control": "no-cache" },
        signal: AbortSignal.timeout(20_000),
      });
      assert.equal(response.status, 200, `${path} must return HTTP 200`);
      await checkBody(response);
      console.log(`Verified ${new URL(path, origin)}`);
      return;
    } catch (error) {
      if (attempt === 6) throw error;
      console.log(`Waiting for ${path} to serve the deployment (${attempt}/6)`);
      await setTimeout(5_000);
    }
  }
}

for (const path of [
  "/",
  "/security",
  "/privacy",
  "/login",
  "/app/mailboxes",
  "/app/connect",
  "/app/temp-mail",
  "/app/mail-sharing",
]) {
  await check(path, async (response) => {
    assert.match(response.headers.get("content-type") ?? "", /text\/html/u);
    assert.ok(
      (await response.text()).includes(entry),
      `${path} must serve the tested build (${entry})`,
    );
  });
}
await check(entry, async (response) => {
  assert.match(response.headers.get("content-type") ?? "", /javascript/u);
  const localEntry = await readFile(
    new URL(`../apps/web/dist${entry}`, import.meta.url),
    "utf8",
  );
  assert.equal(
    await response.text(),
    localEntry,
    "Deployed JavaScript must match the tested artifact",
  );
});
