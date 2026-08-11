/**
 * Share-link verification.
 *
 * Covers the feature *and* its security properties: a token only unlocks its
 * own notebook, grants read access only, and dies the moment it is revoked.
 * Run against a dev server: `pnpm dev` then `node scripts/e2e-share.mjs`.
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const OWNER = { email: "rahul@test.dev", password: "notebook123" };
const FOREIGN_PAGE_ID = process.argv[2];

const log = (...a) => console.log(...a);
let failed = false;
const check = (ok, msg) => {
  log(`    ${ok ? "PASS" : "FAIL"}  ${msg}`);
  if (!ok) failed = true;
};


/**
 * Wait for a client-side navigation.
 *
 * `page.waitForURL` defaults to waiting for a `load` event, which Next never
 * fires on a soft navigation — making it pass or hang depending on timing.
 * Polling the pathname is deterministic.
 */
async function waitForPath(page, pattern, timeout = 30000) {
  await page.waitForFunction(
    (source) => new RegExp(source).test(location.pathname),
    pattern.source,
    { timeout, polling: 100 },
  );
}

const browser = await chromium.launch({ headless: true, channel: "chrome" });

/* ---------------------------------------------------- owner turns on sharing */
log("\n[1] Owner enables sharing");
const ownerCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const owner = await ownerCtx.newPage();
await owner.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await owner.fill("#email", OWNER.email);
await owner.fill("#password", OWNER.password);
await owner.click('button[type="submit"]');
await waitForPath(owner, /^\/dashboard$/, 40000);

await owner.getByText("System Design").first().click();
await waitForPath(owner, /\/n\/[0-9a-f-]{36}$/);
const notebookUrl = owner.url();

await owner.getByRole("button", { name: "Share this notebook" }).click();
await owner.waitForSelector('[role="switch"]', { timeout: 10000 });

// Normalise: the notebook may already be shared from an earlier run. Start
// from private so the "turning it on" path is what actually gets exercised.
const alreadyShared =
  (await owner.getByRole("switch", { name: /Share with anyone/ }).getAttribute("aria-checked")) ===
  "true";
if (alreadyShared) {
  await owner.getByRole("switch", { name: /Share with anyone/ }).click();
  await owner.waitForSelector("text=Only you", { timeout: 15000 });
}
check(
  await owner.getByText("Only you").first().isVisible(),
  "dialog shows the notebook is private",
);

await owner.getByRole("switch", { name: /Share with anyone/ }).click();
await owner.waitForSelector("text=Anyone with the link", { timeout: 15000 });
const shareUrl = await owner.locator('input[aria-label="Share link"]').inputValue();
log(`    link: ${shareUrl.replace(BASE, "")}`);
check(/\/share\/[A-Za-z0-9_-]{20,}$/.test(shareUrl), "link uses a high-entropy token, not the notebook id");
check(!shareUrl.includes(notebookUrl.split("/n/")[1]), "link does not contain the notebook UUID");

/* -------------------------------------------------- recipient, no account */
log("\n[2] Recipient opens the link with no account");
const guestCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const guest = await guestCtx.newPage();
const res = await guest.goto(shareUrl, { waitUntil: "domcontentloaded" });
check(res.status() === 200, `share page loads signed-out (${res.status()})`);
await guest.waitForSelector("text=System Design", { timeout: 15000 });
check(await guest.getByText("Shared notebook").first().isVisible(), "marked read-only");

const html = await guest.content();
check(!html.includes(OWNER.email), "owner email is not exposed");
check(!html.includes("Personal Notes"), "other notebooks are not exposed");
check(!html.includes("this must never leak"), "other notebooks' page text is not exposed");

/* ------------------------------------------------------- read a page */
log("\n[3] Recipient reads a page");
await guest.getByText("Kafka").first().click();
await waitForPath(guest, /\/share\/[^/]+\/p\/[0-9a-f-]{36}$/);
await guest.waitForSelector(".excalidraw", { timeout: 30000 });
await guest.waitForTimeout(1500);
check(true, "read-only canvas mounts");
check(await guest.getByText("Read only").first().isVisible(), "read-only badge shown");
const hasInkRail = await guest.getByRole("button", { name: "Highlighter" }).count();
check(hasInkRail === 0, "no authoring toolbar is rendered");

/* --------------------------------------------------- writes are impossible */
log("\n[4] Recipient cannot write");
const guestPageId = guest.url().split("/p/")[1];
const writeStatus = await guest.evaluate(async (pid) => {
  const r = await fetch(`/api/pages/${pid}/document`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ elements: [], appState: {}, baseVersion: 0 }),
  });
  return r.status;
}, guestPageId);
check(writeStatus === 401, `autosave endpoint rejects the guest (${writeStatus})`);

const readStatus = await guest.evaluate(async (pid) => {
  const r = await fetch(`/api/pages/${pid}/document`);
  return r.status;
}, guestPageId);
check(readStatus === 401, `private document endpoint rejects the guest (${readStatus})`);

/* ------------------------------------- token cannot reach another notebook */
log("\n[5] Token is scoped to its own notebook");
if (FOREIGN_PAGE_ID) {
  const foreign = await guest.goto(`${shareUrl}/p/${FOREIGN_PAGE_ID}`, {
    waitUntil: "domcontentloaded",
  });
  check(foreign.status() === 404, `page from a different notebook 404s (${foreign.status()})`);
} else {
  log("    (skipped — no foreign page id passed)");
}

const bogus = await guest.goto(`${BASE}/share/totallymadeuptoken123456`, {
  waitUntil: "domcontentloaded",
});
check(bogus.status() === 404, `bogus token 404s (${bogus.status()})`);

/* ------------------------------------------------------------- revocation */
log("\n[6] Revoking kills the link");
await owner.getByRole("switch", { name: /Share with anyone/ }).click();
await owner.waitForSelector("text=Only you", { timeout: 15000 });
await guest.waitForTimeout(500);
const afterRevoke = await guest.goto(shareUrl, { waitUntil: "domcontentloaded" });
check(afterRevoke.status() === 404, `revoked link 404s (${afterRevoke.status()})`);

/* --------------------------------------------------------- rotation */
log("\n[7] Re-share, then rotate");
await owner.getByRole("switch", { name: /Share with anyone/ }).click();
await owner.waitForSelector("text=Anyone with the link", { timeout: 15000 });
const link2 = await owner.locator('input[aria-label="Share link"]').inputValue();
check(link2 !== shareUrl, "re-enabling after revoke mints a NEW token (old link stays dead)");

const live2 = await guest.goto(link2, { waitUntil: "domcontentloaded" });
check(live2.status() === 200, "new link works");

await owner.getByRole("button", { name: /Create a new link/ }).click();
await owner.waitForTimeout(1500);
const link3 = await owner.locator('input[aria-label="Share link"]').inputValue();
check(link3 !== link2, "rotate mints another token");
const afterRotate = await guest.goto(link2, { waitUntil: "domcontentloaded" });
check(afterRotate.status() === 404, `rotated-away link 404s (${afterRotate.status()})`);

await browser.close();
log(`\n${failed ? "SOME CHECKS FAILED" : "ALL SHARE CHECKS PASSED"}`);
process.exitCode = failed ? 1 : 0;
