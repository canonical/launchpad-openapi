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

/** @note Impure — delays real worker replies at the browser messaging boundary, without faking search. */
async function openPage() {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    ignoreHTTPSErrors: true,
  });
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.holdSearchReplies = false;
    window.heldSearchReplies = [];
    window.searchMessages = [];
    window.revokedWorkerUrls = [];
    window.workerUrlReleasedBeforeReply = undefined;
    const nativeRevoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (blobUrl) => {
      window.revokedWorkerUrls.push(blobUrl);
      nativeRevoke(blobUrl);
    };
    window.releaseSearchReplies = () => {
      for (const reply of window.heldSearchReplies.splice(0)) reply.deliver();
    };
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        super.addEventListener(
          "message",
          () => {
            window.workerUrlReleasedBeforeReply =
              window.revokedWorkerUrls.includes(args[0]);
          },
          { once: true },
        );
      }
      addEventListener(type, listener, options) {
        if (type !== "message")
          return super.addEventListener(type, listener, options);
        return super.addEventListener(
          type,
          (event) => {
            if (event.data.type === "test-busy") window.workerBusySeen = true;
            if (window.holdSearchReplies && event.data.type === "results") {
              window.heldSearchReplies.push({
                data: event.data,
                deliver: () => listener.call(this, event),
              });
            } else listener.call(this, event);
          },
          options,
        );
      }
      postMessage(data, ...options) {
        window.searchMessages.push({
          type: data.type,
          environment: data.environment,
          keys: Object.keys(data),
        });
        return super.postMessage(data, ...options);
      }
    };
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Open Search", exact: true })
    .waitFor();
  return page;
}

/** @note Impure — opens the dialog and enters a query through its accessible input. */
async function search(page, query) {
  await page.getByRole("button", { name: "Open Search", exact: true }).click();
  const input = page
    .getByRole("dialog", { name: "Search", exact: true })
    .getByRole("combobox");
  await input.fill(query);
  return input;
}

/** @note Impure — waits for actual old results before issuing a newer interaction. */
async function holdReply(page) {
  await page.evaluate(() => {
    window.holdSearchReplies = true;
  });
  await search(page, "getPublishedSources");
  await page.waitForFunction(() => window.heldSearchReplies.length > 0);
  await page.evaluate(() => {
    window.holdSearchReplies = false;
  });
}

/** @note Impure — forces delayed replies to arrive after current results. */
async function releaseAndInspect(page) {
  await page.evaluate(() => window.releaseSearchReplies());
  return page
    .getByRole("dialog", { name: "Search", exact: true })
    .getByRole("option")
    .allTextContents();
}

describe("search worker races and responsiveness", () => {
  it("retains the Blob URL until the worker has loaded, then releases it", async () => {
    const page = await openPage();
    try {
      await search(page, "getPublishedSources");
      await page
        .getByRole("option")
        .filter({ hasText: "getPublishedSources" })
        .first()
        .waitFor();
      assert.equal(
        await page.evaluate(() => window.workerUrlReleasedBeforeReply),
        false,
      );
      assert.equal(
        await page.evaluate(() => window.revokedWorkerUrls.length),
        1,
      );
    } finally {
      await page.close();
    }
  });

  it("preserves search when pagehide retains the page for back/forward cache", async () => {
    const page = await openPage();
    try {
      await search(page, "getPublishedSources");
      await page
        .getByRole("option")
        .filter({ hasText: "getPublishedSources" })
        .first()
        .waitFor();
      await page.keyboard.press("Escape");
      await page.evaluate(() =>
        window.dispatchEvent(
          new PageTransitionEvent("pagehide", { persisted: true }),
        ),
      );
      await page
        .getByRole("button", { name: "Open Search", exact: true })
        .click();
      const dialog = page.getByRole("dialog", { name: "Search", exact: true });
      await dialog.waitFor({ timeout: 3000 });
      await dialog.getByRole("combobox").fill("revokeWebAuthnRegistration");
      await dialog
        .getByRole("option")
        .filter({ hasText: "revokeWebAuthnRegistration" })
        .first()
        .waitFor();
      assert.equal(page.workers().length, 1);
    } finally {
      await page.close();
    }
  });

  for (const replacement of ["query", "close/reopen", "source"]) {
    it(`rejects delayed results after ${replacement} replacement`, async () => {
      const page = await openPage();
      try {
        await holdReply(page);
        let query = "revokeWebAuthnRegistration";
        if (replacement !== "query") {
          await page.keyboard.press("Escape");
          if (replacement === "source") {
            await page
              .getByRole("button", { name: "Production", exact: true })
              .click();
            await page
              .getByRole("option", { name: "QA staging", exact: true })
              .click();
            query = "buildSourcePackageFromGitRef";
          }
          await search(page, query);
        } else {
          await page
            .getByRole("dialog", { name: "Search", exact: true })
            .getByRole("combobox")
            .fill(query);
        }
        const options = page
          .getByRole("dialog", { name: "Search", exact: true })
          .getByRole("option");
        await options.filter({ hasText: query }).first().waitFor();
        const beforeRelease = await options.allTextContents();
        assert.deepEqual(await releaseAndInspect(page), beforeRelease);
        assert.ok(
          beforeRelease.every((text) => !text.includes("getPublishedSources")),
        );
        if (replacement === "source") {
          assert.ok(
            (
              await options.evaluateAll((items) => items.map((item) => item.id))
            ).every((id) => id.startsWith("search-result-qastaging/")),
          );
        }
      } finally {
        await page.close();
      }
    });
  }

  it("keeps the main thread responsive while the actual worker is blocked", async () => {
    const page = await openPage();
    try {
      const input = await search(page, "getPublishedSources");
      await page.getByRole("option").first().waitFor();
      assert.equal(page.workers().length, 1);
      const blocked = page.workers()[0].evaluate(() => {
        self.postMessage({ type: "test-busy" }, []);
        const end = performance.now() + 600;
        while (performance.now() < end) {
          /* Deliberately block only the test worker. */
        }
      });
      await page.waitForFunction(() => window.workerBusySeen === true);
      await input.fill("archive");
      const frameMs = await page.evaluate(
        () =>
          new Promise((resolve) => {
            const start = performance.now();
            requestAnimationFrame(() => resolve(performance.now() - start));
          }),
      );
      assert.ok(frameMs < 150, `Main-thread animation frame took ${frameMs}ms`);
      await blocked;
      await page
        .getByRole("option")
        .filter({ hasText: /archive/ })
        .first()
        .waitFor();
    } finally {
      await page.close();
    }
  });

  it("copies each source only once and sends no spec/index payload with queries", async () => {
    const page = await openPage();
    try {
      for (const [source, next] of [
        ["Production", "QA staging"],
        ["QA staging", "Production"],
        ["Production", undefined],
      ]) {
        await search(page, "getPublishedSources");
        await page.getByRole("option").first().waitFor();
        await page.keyboard.press("Escape");
        if (next) {
          await page.getByRole("button", { name: source, exact: true }).click();
          await page.getByRole("option", { name: next, exact: true }).click();
        }
      }
      const messages = await page.evaluate(() => window.searchMessages);
      assert.equal(
        messages.filter(
          (message) =>
            message.type === "init" && message.environment === "production",
        ).length,
        1,
      );
      assert.equal(
        messages.filter(
          (message) =>
            message.type === "init" && message.environment === "qastaging",
        ).length,
        1,
      );
      assert.ok(
        messages
          .filter((message) => message.type === "search")
          .every(
            (message) =>
              !message.keys.includes("json") && !message.keys.includes("index"),
          ),
      );
      assert.equal(page.workers().length, 1);
    } finally {
      await page.close();
    }
  });
});
