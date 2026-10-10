/*
 * Copyright 2026 Canonical Ltd. This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  siteSearchOpenApi,
  siteHiddenSearchOpenApi,
} from "../../testing/fixtures.ts";
import createSearchIndex from "./createSearchIndex.mjs";

describe("createSearchIndex", () => {
  it("fuzzy-matches operations and retains distinct canonical routes and source prefixes", () => {
    const production = createSearchIndex(siteSearchOpenApi, "production");
    const results = production.search("getPublshedSources");
    const operations = results.filter((result) => result.type === "operation");
    assert.equal(operations.length, 2);
    assert.equal(
      operations[0].id,
      "production/tag/archive/GET/{distribution}/+archive/{archive}?ws.op=getPublishedSources",
    );
    assert.equal(
      operations[1].id,
      "production/tag/archive/GET/{owner}/+archive/{distribution}/{archive}?ws.op=getPublishedSources",
    );
    assert.ok(
      createSearchIndex(siteSearchOpenApi, "qastaging")
        .search("getPublishedSources")
        .every((result) => result.id.startsWith("qastaging/")),
    );
  });

  it("searches inherited parameters, overrides, descriptions and response examples", () => {
    const index = createSearchIndex(siteSearchOpenApi, "production");
    assert.ok(
      index
        .search("inheritedToken")
        .some((result) => result.path?.includes("{distribution}/+archive")),
    );
    assert.ok(
      index
        .search("replacementNeedle")
        .some((result) => result.path === "/submit"),
    );
    assert.equal(index.search("obsoleteNeedle").length, 0);
    assert.ok(
      index
        .search("exampleNeedle")
        .some((result) => result.type === "operation"),
    );
    assert.ok(
      index
        .search("source publications")
        .some((result) => result.type === "operation"),
    );
  });

  it("resolves request/model fields, escaped JSON pointers and recursive composition without mutation", () => {
    const original = structuredClone(siteSearchOpenApi);
    const index = createSearchIndex(siteSearchOpenApi, "production");
    assert.ok(
      index.search("metadata_flag").some((result) => result.path === "/submit"),
    );
    assert.ok(
      index
        .search("bodyDescriptionNeedle")
        .some((result) => result.type === "model"),
    );
    assert.ok(
      index.search("nestedFlag").some((result) => result.path === "/submit"),
    );
    assert.ok(
      index
        .search("Envelope")
        .some((result) => result.id === "production/models/Envelope"),
    );
    assert.deepEqual(siteSearchOpenApi, original);
  });

  it("excludes hidden entries and returns bounded summaries rather than index payloads", () => {
    const index = createSearchIndex(siteSearchOpenApi, "production");
    assert.equal(index.search("hiddenOperationNeedle").length, 0);
    assert.equal(index.search("hiddenModelNeedle").length, 0);
    assert.equal(
      createSearchIndex(siteHiddenSearchOpenApi, "production").search("Models")
        .length,
      0,
    );
    const results = index.search("", 2);
    assert.equal(results.length, 2);
    assert.deepEqual(Object.keys(results[0]), [
      "id",
      "title",
      "type",
      "method",
      "path",
    ]);
    assert.equal(index.search("zzzzzzzzzzzz").length, 0);
  });
});
