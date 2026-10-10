/*
 * Copyright 2026 Canonical Ltd. This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

/* oxlint-disable unicorn/require-post-message-target-origin -- Worker messaging has no Window targetOrigin. */

import createSearchIndex from "./createSearchIndex.mjs";

const indexes = new Map();
let pendingSearch;
let scheduled;

/** @note Impure — returns results from the latest queued query to the page. */
function searchLatest() {
  scheduled = undefined;
  const request = pendingSearch;
  pendingSearch = undefined;
  if (!request) return;
  try {
    const index = indexes.get(request.environment);
    if (!index) throw new Error("Search index is not ready");
    self.postMessage({
      type: "results",
      environment: request.environment,
      requestId: request.requestId,
      results: index.search(request.query),
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      environment: request.environment,
      requestId: request.requestId,
      message: error.message,
    });
  }
}

self.addEventListener("message", ({ data }) => {
  if (data.type === "init") {
    try {
      if (!indexes.has(data.environment)) {
        indexes.set(
          data.environment,
          createSearchIndex(JSON.parse(data.json), data.environment),
        );
      }
      self.postMessage({ type: "ready", environment: data.environment });
    } catch (error) {
      self.postMessage({
        type: "error",
        environment: data.environment,
        message: error.message,
      });
    }
  } else if (data.type === "search") {
    pendingSearch = data;
    // Yield between queries so queued messages can supersede stale searches.
    if (scheduled === undefined) scheduled = setTimeout(searchLatest, 0);
  }
});
