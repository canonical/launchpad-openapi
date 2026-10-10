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

/** @note Impure — opens a fresh browser page and loads the full API reference. */
async function openReference() {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    ignoreHTTPSErrors: true,
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Open Search/ }).waitFor();
  await page.locator("#loading").waitFor({ state: "hidden" });
  return page;
}

/** @note Impure — inspects the selected sidebar entry and its scroll viewport. */
async function readSidebarSelection(page) {
  return page
    .locator("#app aside")
    .first()
    .evaluate((sidebar) => {
      const active = sidebar.querySelector("[aria-current=page]");
      if (!active) return undefined;
      let viewport = active.parentElement;
      while (viewport && viewport !== sidebar) {
        if (/auto|scroll/.test(getComputedStyle(viewport).overflowY)) break;
        viewport = viewport.parentElement;
      }
      const item = active.getBoundingClientRect();
      const container = (viewport ?? sidebar).getBoundingClientRect();
      return {
        id: active
          .closest("[data-sidebar-id]")
          ?.getAttribute("data-sidebar-id"),
        visible: item.top >= container.top && item.bottom <= container.bottom,
      };
    });
}

describe("API reference search", () => {
  for (const environment of ["Production", "QA staging"]) {
    it(`avoids second-long stalls on the first ${environment} searches`, async () => {
      const page = await openReference();
      try {
        if (environment !== "Production") {
          await page
            .getByRole("button", { name: "Production", exact: true })
            .click();
          await page
            .getByRole("option", { name: environment, exact: true })
            .click();
        }
        await page.evaluate(() => {
          window.searchMeasurements = [];
          window.searchLongTasks = [];
          new PerformanceObserver((list) => {
            for (const task of list.getEntries()) {
              window.searchLongTasks.push({
                start: task.startTime,
                duration: task.duration,
              });
            }
          }).observe({ type: "longtask" });

          // Mark real browser events, not automation calls: an unfinished page
          // render before the click must not be misreported as search indexing.
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
              const measurement = { start: performance.now() };
              window.searchMeasurements.push(measurement);
              const waitForInput = () => {
                const input = document.querySelector(
                  '[aria-label="Search"]:is(dialog, [role="dialog"]) [role="combobox"]',
                );
                if (input && input === document.activeElement) {
                  measurement.openMs = performance.now() - measurement.start;
                } else requestAnimationFrame(waitForInput);
              };
              requestAnimationFrame(waitForInput);
            },
            true,
          );
          document.addEventListener(
            "input",
            (event) => {
              if (event.target.getAttribute("role") !== "combobox") return;
              const measurement = window.searchMeasurements.at(-1);
              const queryStart = performance.now();
              const waitForResults = () => {
                const result = document.querySelector(
                  '[role="option"][id^="search-result-"]',
                );
                if (result?.id.includes(event.target.value)) {
                  measurement.queryMs = performance.now() - queryStart;
                  measurement.end = performance.now();
                } else requestAnimationFrame(waitForResults);
              };
              requestAnimationFrame(waitForResults);
            },
            true,
          );
        });
        for (let attempt = 0; attempt < 3; attempt++) {
          await page.getByRole("button", { name: /Open Search/ }).click();
          const input = page
            .getByRole("dialog", { name: "Search", exact: true })
            .getByRole("combobox");
          await page.waitForFunction(
            () => window.searchMeasurements.at(-1)?.openMs !== undefined,
          );
          await input.fill("getPublishedSources");
          await page.waitForFunction(
            () => window.searchMeasurements.at(-1)?.queryMs !== undefined,
          );
          await page.keyboard.press("Escape");
          await input.waitFor({ state: "hidden" });
        }
        const metrics = await page.evaluate(() => ({
          searches: window.searchMeasurements,
          tasks: window.searchLongTasks,
        }));
        console.log(
          `${environment} search timings: ${JSON.stringify(metrics)}`,
        );
        assert.equal(metrics.searches.length, 3);
        for (const measurement of metrics.searches) {
          assert.ok(
            measurement.openMs < 1000,
            `Opening search took ${measurement.openMs}ms`,
          );
          assert.ok(
            measurement.queryMs < 1000,
            `Search results took ${measurement.queryMs}ms`,
          );
          const tasks = metrics.tasks.filter(
            (task) =>
              task.start >= measurement.start && task.start < measurement.end,
          );
          assert.ok(
            Math.max(0, ...tasks.map((task) => task.duration)) < 1000,
            `Search blocked the main thread: ${JSON.stringify(tasks)}`,
          );
        }
      } finally {
        await page.close();
      }
    });
    it(`keeps the focused result visible in the ${environment} sidebar`, async () => {
      const page = await openReference();
      try {
        if (environment !== "Production") {
          await page
            .getByRole("button", { name: "Production", exact: true })
            .click();
          await page
            .getByRole("option", { name: environment, exact: true })
            .click();
        }
        await page.getByRole("button", { name: /Open Search/ }).click();
        await page
          .getByRole("dialog", { name: "Search", exact: true })
          .getByRole("combobox")
          .fill("getPublishedSources");
        const result = page.getByRole("option").nth(1);
        await result.waitFor();
        const id = (await result.getAttribute("id")).replace(
          "search-result-",
          "",
        );
        await result.click();
        await page.waitForFunction(
          (targetId) => decodeURIComponent(location.hash.slice(1)) === targetId,
          id,
        );
        await page.waitForFunction(
          (targetId) => {
            const active = document.querySelector(
              "#app aside [aria-current=page]",
            );
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
            ) {
              viewport = viewport.parentElement;
            }
            if (!viewport) return false;
            const item = active.getBoundingClientRect();
            const container = viewport.getBoundingClientRect();
            return item.top >= container.top && item.bottom <= container.bottom;
          },
          id,
          { timeout: 5000 },
        );
        assert.deepEqual(await readSidebarSelection(page), {
          id,
          visible: true,
        });
        const top = await page.evaluate(
          (targetId) =>
            document.getElementById(targetId)?.getBoundingClientRect().top,
          id,
        );
        assert.ok(top >= 40 && top < 120, `Focused content moved to ${top}px`);
        assert.equal(await page.locator("#error-overlay").isVisible(), false);
      } finally {
        await page.close();
      }
    });
  }
});
