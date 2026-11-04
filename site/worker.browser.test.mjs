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
    timeout: 20_000,
  });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

/** @note Impure — loads a fresh full reference, optionally failing Worker creation. */
async function openReference(failWorker = false) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    ignoreHTTPSErrors: true,
  });
  page.setDefaultTimeout(15_000);
  if (failWorker) {
    await page.addInitScript(() => {
      window.Worker = new Proxy(window.Worker, {
        construct() {
          throw new DOMException(
            "Worker blocked by browser policy",
            "SecurityError",
          );
        },
      });
    });
  }
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Open Search/ }).waitFor();
  await page.locator("#loading").waitFor({ state: "hidden" });
  return page;
}

function searchDialog(page) {
  return page.getByRole("dialog", { name: "Search", exact: true });
}

/** @note Impure — opens search and enters a query through its accessible input. */
async function search(page, query) {
  await page.getByRole("button", { name: /Open Search/ }).click();
  const input = searchDialog(page).getByRole("combobox");
  await input.fill(query);
  return input;
}

/** @note Impure — verifies navigation and that the sidebar reveals its active entry. */
async function assertNavigation(page, id) {
  await page.waitForFunction(
    (targetId) => decodeURIComponent(location.hash.slice(1)) === targetId,
    id,
  );
  await page.waitForFunction(
    (targetId) => {
      const active = document.querySelector("#app aside [aria-current=page]");
      if (
        active
          ?.closest("[data-sidebar-id]")
          ?.getAttribute("data-sidebar-id") !== targetId
      )
        return false;
      let viewport = active.parentElement;
      while (
        viewport &&
        !/auto|scroll/.test(getComputedStyle(viewport).overflowY)
      )
        viewport = viewport.parentElement;
      if (!viewport) return false;
      const item = active.getBoundingClientRect();
      const bounds = viewport.getBoundingClientRect();
      return item.top >= bounds.top && item.bottom <= bounds.bottom;
    },
    id,
    { timeout: 5000 },
  );
  assert.equal(await page.locator("#error-overlay").isVisible(), false);
}

/** @note Impure — switches the reference source using the visible source selector. */
async function switchEnvironment(page, from, to) {
  await page.getByRole("button", { name: from, exact: true }).click();
  await page.getByRole("option", { name: to, exact: true }).click();
}

/** @note Impure — checks the accessible failure state and continued reference navigation. */
async function assertUnavailable(page) {
  await searchDialog(page)
    .getByText(/Search unavailable/i)
    .waitFor();
  const accessibleMessage = searchDialog(page)
    .locator(
      '[role="status"], [role="alert"], [aria-live="polite"], [aria-live="assertive"]',
    )
    .filter({ hasText: /Search unavailable/i });
  assert.ok(
    await accessibleMessage.count(),
    "Search failure must be announced accessibly",
  );
  assert.equal(await searchDialog(page).getByRole("option").count(), 0);
  await page.keyboard.press("Escape");
  await searchDialog(page).waitFor({ state: "hidden" });
  assert.equal(await page.locator("#error-overlay").isVisible(), false);
  await switchEnvironment(page, "Production", "QA staging");
  await page.getByRole("button", { name: "QA staging", exact: true }).waitFor();
  assert.ok(await page.locator("#app aside [data-sidebar-id]").count());
}

describe("Worker-backed reference search", () => {
  it("uses a real browser Worker and stays responsive on first indexing and fuzzy queries", async () => {
    const page = await openReference();
    try {
      await page.evaluate(() => {
        window.searchTasks = [];
        new PerformanceObserver((list) => {
          window.searchTasks.push(
            ...list.getEntries().map((entry) => ({
              start: entry.startTime,
              duration: entry.duration,
            })),
          );
        }).observe({ type: "longtask" });
        // Mark the real click so unfinished initial rendering before it is
        // not attributed to search indexing.
        document.addEventListener(
          "click",
          (event) => {
            const button = event.target.closest("button");
            if (
              !button ||
              (!button.matches("#lp-open-search") &&
                !button.textContent.includes("Open Search"))
            )
              return;
            window.searchStart = performance.now();
          },
          true,
        );
      });
      const input = await search(page, "getPublshedSources");
      await searchDialog(page)
        .getByRole("option")
        .filter({ hasText: /getPublishedSources/ })
        .first()
        .waitFor();
      assert.ok(
        page.workers().length > 0,
        "Search must create an actual browser Worker",
      );
      assert.equal(await input.inputValue(), "getPublshedSources");
      const metrics = await page.evaluate(() => ({
        start: window.searchStart,
        end: performance.now(),
        tasks: window.searchTasks,
      }));
      assert.ok(
        Number.isFinite(metrics.start),
        "Search click must be recorded",
      );
      const tasks = metrics.tasks.filter(
        (task) =>
          task.start + task.duration > metrics.start &&
          task.start < metrics.end,
      );
      assert.ok(
        Math.max(0, ...tasks.map((task) => task.duration)) < 1000,
        `Search blocked the main thread: ${JSON.stringify(tasks)}`,
      );
    } finally {
      await page.close();
    }
  });

  it("selects only the latest rapidly replaced query and reveals mouse selection", async () => {
    const page = await openReference();
    try {
      const input = await search(page, "getPublishedSources");
      await searchDialog(page).getByRole("option").first().waitFor();
      for (const query of [
        "archive",
        "getPublishedSources",
        "getMergeProposals",
      ])
        await input.fill(query);
      const result = searchDialog(page)
        .getByRole("option")
        .filter({ hasText: /getMergeProposals/ })
        .first();
      await result.waitFor();
      const id = (await result.getAttribute("id")).replace(
        "search-result-",
        "",
      );
      await result.click();
      await assertNavigation(page, id);
      assert.match(
        decodeURIComponent(new URL(page.url()).hash),
        /getMergeProposals/,
      );
    } finally {
      await page.close();
    }
  });

  it("supports ArrowDown/Enter selection and restores opener focus on Escape", async () => {
    const page = await openReference();
    try {
      const input = await search(page, "getPublishedSources");
      await searchDialog(page).getByRole("option").first().waitFor();
      await input.press("ArrowDown");
      const selectedId = await input.getAttribute("aria-activedescendant");
      assert.ok(
        selectedId,
        "ArrowDown must expose the active result to assistive technology",
      );
      const result = page.locator(`[id="${selectedId}"]`);
      const id = (await result.getAttribute("id")).replace(
        "search-result-",
        "",
      );
      await input.press("Enter");
      await assertNavigation(page, id);
      await search(page, "archive");
      await page.keyboard.press("Escape");
      await searchDialog(page).waitFor({ state: "hidden" });
      assert.equal(
        await page
          .getByRole("button", { name: /Open Search/ })
          .evaluate((element) => element === document.activeElement),
        true,
      );
    } finally {
      await page.close();
    }
  });

  it("isolates source results when switching environments and returning to production", async () => {
    const page = await openReference();
    try {
      await search(page, "getMergeProposals");
      await searchDialog(page)
        .getByRole("option")
        .filter({ hasText: /getMergeProposals/ })
        .first()
        .waitFor();
      await page.keyboard.press("Escape");
      await switchEnvironment(page, "Production", "QA staging");
      const input = await search(page, "getMergeProposals");
      // Immediately replace the old-environment query while the new index may still be building.
      await input.fill("buildSourcePackageFromGitRef");
      const result = searchDialog(page)
        .getByRole("option")
        .filter({ hasText: /buildSourcePackageFromGitRef/ })
        .first();
      await result.waitFor();
      assert.equal(
        await searchDialog(page)
          .getByRole("option")
          .filter({ hasText: /getMergeProposals/ })
          .count(),
        0,
      );
      const id = (await result.getAttribute("id")).replace(
        "search-result-",
        "",
      );
      await result.click();
      await assertNavigation(page, id);
      await switchEnvironment(page, "QA staging", "Production");
      await search(page, "getMergeProposals");
      await searchDialog(page)
        .getByRole("option")
        .filter({ hasText: /getMergeProposals/ })
        .first()
        .waitFor();
      assert.equal(
        await searchDialog(page)
          .getByRole("option")
          .filter({ hasText: /buildSourcePackageFromGitRef/ })
          .count(),
        0,
      );
    } finally {
      await page.close();
    }
  });

  it("announces Worker creation failure without breaking the reference", async () => {
    const page = await openReference(true);
    try {
      await search(page, "archive");
      await assertUnavailable(page);
    } finally {
      await page.close();
    }
  });

  it("announces a real Worker runtime failure without breaking the reference", async () => {
    const page = await openReference();
    try {
      await search(page, "archive");
      await searchDialog(page).getByRole("option").first().waitFor();
      assert.ok(
        page.workers().length > 0,
        "Runtime failure requires an actual search Worker",
      );
      await page.workers()[0].evaluate(() => {
        setTimeout(() => {
          throw new Error("Browser test Worker runtime failure");
        }, 0);
      });
      await assertUnavailable(page);
    } finally {
      await page.close();
    }
  });
});
