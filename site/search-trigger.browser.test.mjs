/*
 * Copyright 2026 Canonical Ltd. This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";
import { chromium } from "playwright";

let browser;
let server;
let url;
before(async () => {
  const html = await readFile(
    process.env.SITE_PAGE ?? new URL("./dist/index.html", import.meta.url),
    "utf8",
  );
  server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

/** @note Impure — exercises the generated reference with a browser platform at its navigator boundary. */
async function openPage(platform) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    ignoreHTTPSErrors: true,
  });
  await page.addInitScript((simulatedPlatform) => {
    Object.defineProperty(navigator, "platform", {
      value: simulatedPlatform,
      configurable: true,
    });
    Object.defineProperty(navigator, "userAgentData", {
      value: {
        platform:
          simulatedPlatform === "MacIntel" ? "macOS" : simulatedPlatform,
        brands: [],
        mobile: false,
      },
      configurable: true,
    });
  }, platform);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Open Search", exact: true })
    .waitFor();
  return page;
}

/** @note Impure — verifies the old sidebar position rather than a global-header control. */
async function assertSidebarTrigger(page, source) {
  const opener = page.getByRole("button", { name: "Open Search", exact: true });
  assert.equal(
    await opener.evaluate((element) => element.closest("#app aside") !== null),
    true,
    "Search must return to the Scalar sidebar",
  );
  assert.equal(await page.locator(".lp-header #lp-open-search").count(), 0);
  const control = await opener.boundingBox();
  const picker = await page
    .getByRole("button", { name: source, exact: true })
    .boundingBox();
  assert.ok(
    control.y >= picker.y + picker.height,
    "Search must sit below the source picker, as before",
  );
  const style = await opener.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    border: getComputedStyle(element).borderTopWidth,
  }));
  assert.notEqual(style.background, "rgba(0, 0, 0, 0)");
  assert.equal(style.border, "1px");
  assert.match(await opener.textContent(), /Search/);
  assert.equal(await opener.locator("svg[aria-hidden=true]").count(), 1);
}

describe("sidebar search trigger", () => {
  for (const [platform, modifier, shortcut] of [
    ["MacIntel", "⌘", "Meta+k"],
    ["Win32", "Ctrl", "Control+k"],
  ]) {
    it(`restores the input-like sidebar control with formatted ${modifier} K keys`, async () => {
      const page = await openPage(platform);
      try {
        await assertSidebarTrigger(page, "Production");
        const opener = page.getByRole("button", {
          name: "Open Search",
          exact: true,
        });
        assert.deepEqual(await opener.locator("kbd").allTextContents(), [
          modifier,
          "K",
        ]);
        await opener.click();
        const dialog = page.getByRole("dialog", {
          name: "Search",
          exact: true,
        });
        await dialog.getByRole("combobox").fill("getPublishedSources");
        await dialog
          .getByRole("option")
          .filter({ hasText: "getPublishedSources" })
          .first()
          .waitFor();
        assert.equal(page.workers().length, 1);
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        assert.equal(
          await opener.evaluate(
            (element) => element === document.activeElement,
          ),
          true,
        );
        await page.keyboard.press(shortcut);
        await dialog.waitFor();
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        await page
          .getByRole("button", { name: "Production", exact: true })
          .click();
        await page
          .getByRole("option", { name: "QA staging", exact: true })
          .click();
        await assertSidebarTrigger(page, "QA staging");
        assert.deepEqual(await opener.locator("kbd").allTextContents(), [
          modifier,
          "K",
        ]);
        await opener.click();
        await dialog.getByRole("combobox").fill("getPublishedSources");
        await dialog
          .getByRole("option")
          .filter({ hasText: "getPublishedSources" })
          .first()
          .waitFor();
      } finally {
        await page.close();
      }
    });
  }

  it("keeps a visible input-like search control on mobile and after resizing back", async () => {
    const page = await openPage("Win32");
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      const opener = page.getByRole("button", {
        name: "Open Search",
        exact: true,
      });
      await opener.click();
      const dialog = page.getByRole("dialog", { name: "Search", exact: true });
      await dialog.getByRole("combobox").fill("getPublishedSources");
      await dialog
        .getByRole("option")
        .filter({ hasText: "getPublishedSources" })
        .first()
        .waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await assertSidebarTrigger(page, "Production");
    } finally {
      await page.close();
    }
  });
});
