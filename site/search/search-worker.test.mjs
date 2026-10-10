/*
 * Copyright 2026 Canonical Ltd. This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

/* oxlint-disable unicorn/require-post-message-target-origin -- Worker messaging has no Window targetOrigin. */

import assert from "node:assert/strict";
import { once } from "node:events";
import { describe, it } from "node:test";
import { Worker } from "node:worker_threads";
import { siteSearchOpenApi } from "../../testing/fixtures.ts";

/** @note Impure — runs the browser worker module in a real isolated Node worker thread. */
function startWorker() {
  const moduleUrl = new URL("./search-worker.mjs", import.meta.url).href;
  return new Worker(
    new URL(
      "data:text/javascript," +
        encodeURIComponent(`
      import { parentPort } from "node:worker_threads";
      globalThis.self = {
        addEventListener: (_type, handler) => parentPort.on("message", data => handler({ data })),
        postMessage: data => parentPort.postMessage(data),
      };
      await import(${JSON.stringify(moduleUrl)});
    `),
    ),
  );
}

/** @note Impure — waits for a worker response with a bounded timeout. */
async function receive(worker) {
  return (
    await once(worker, "message", { signal: AbortSignal.timeout(5000) })
  )[0];
}

describe("search worker protocol", () => {
  it("builds each environment once, caches indexes and returns only matching request summaries", async () => {
    const worker = startWorker();
    try {
      worker.postMessage({
        type: "init",
        environment: "production",
        json: JSON.stringify(siteSearchOpenApi),
      });
      assert.deepEqual(await receive(worker), {
        type: "ready",
        environment: "production",
      });
      // A cached source must not parse or rebuild even if its duplicate payload is invalid.
      worker.postMessage({
        type: "init",
        environment: "production",
        json: "not JSON",
      });
      assert.deepEqual(await receive(worker), {
        type: "ready",
        environment: "production",
      });
      worker.postMessage({
        type: "init",
        environment: "qastaging",
        json: JSON.stringify(siteSearchOpenApi),
      });
      assert.deepEqual(await receive(worker), {
        type: "ready",
        environment: "qastaging",
      });
      worker.postMessage({
        type: "search",
        environment: "qastaging",
        requestId: 42,
        query: "getPublshedSources",
      });
      const reply = await receive(worker);
      assert.equal(reply.type, "results");
      assert.equal(reply.requestId, 42);
      assert.equal(reply.environment, "qastaging");
      assert.ok(reply.results.length > 0);
      assert.ok(
        reply.results.every((result) => result.id.startsWith("qastaging/")),
      );
      assert.ok(
        reply.results.every(
          (result) => !("body" in result) && !("description" in result),
        ),
      );
    } finally {
      await worker.terminate();
    }
  });

  it("reports malformed initialization and missing indexes without killing the worker", async () => {
    const worker = startWorker();
    try {
      worker.postMessage({
        type: "init",
        environment: "production",
        json: "not JSON",
      });
      assert.equal((await receive(worker)).type, "error");
      worker.postMessage({
        type: "search",
        environment: "production",
        requestId: 1,
        query: "archive",
      });
      const error = await receive(worker);
      assert.equal(error.type, "error");
      assert.equal(error.requestId, 1);
      worker.postMessage({
        type: "init",
        environment: "production",
        json: JSON.stringify(siteSearchOpenApi),
      });
      assert.equal((await receive(worker)).type, "ready");
    } finally {
      await worker.terminate();
    }
  });
});
