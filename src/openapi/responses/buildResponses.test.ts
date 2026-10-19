/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { describe, expect, it } from "vitest";
import { buildResponses, buildStandardResponses } from "./buildResponses.js";

describe("buildStandardResponses", () => {
  it("uses the first documented statusless response instead of the legacy description", () => {
    const responses = buildStandardResponses(
      [
        { statusCodes: [], doc: undefined, representations: [] },
        { statusCodes: [], doc: "", representations: [] },
        {
          statusCodes: [],
          doc: "The requested widget.",
          representations: [{ id: "widget" }],
        },
        { statusCodes: [], doc: "Later documentation.", representations: [] },
      ],
      { widget: { type: "object" } },
      "get",
    );

    expect(responses).toEqual({
      "200": {
        description: "The requested widget.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/widget" },
          },
        },
      },
    });
  });

  it("adds fallback media and documentation to an otherwise empty explicit 200", () => {
    const responses = buildStandardResponses(
      [
        { statusCodes: ["200"], doc: undefined, representations: [] },
        {
          statusCodes: [],
          doc: "The requested widget.",
          representations: [{ id: "widget" }],
        },
      ],
      { widget: { type: "object" } },
      "get",
    );

    expect(responses).toEqual({
      "200": {
        description: "The requested widget.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/widget" },
          },
        },
      },
    });
  });

  it("fills a missing JSON schema without replacing explicit documentation or other media", () => {
    const responses = buildStandardResponses(
      [
        {
          statusCodes: ["200"],
          doc: "Explicit success details.",
          representations: [
            { mediaType: "application/json" },
            { mediaType: "text/csv" },
          ],
        },
        {
          statusCodes: [],
          doc: "Legacy details.",
          representations: [{ id: "widget" }],
        },
      ],
      { widget: { type: "object" } },
      "get",
    );

    expect(responses).toEqual({
      "200": {
        description: "Explicit success details.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/widget" },
          },
          "text/csv": {},
        },
      },
    });
  });

  it("merges a different statusless schema as an alternative to the explicit schema", () => {
    const responses = buildStandardResponses(
      [
        {
          statusCodes: ["200"],
          doc: "Explicit widget.",
          representations: [{ id: "widget" }],
        },
        {
          statusCodes: [],
          doc: undefined,
          representations: [{ id: "legacy-widget" }],
        },
      ],
      { widget: { type: "object" }, "legacy-widget": { type: "object" } },
      "get",
    );

    expect(responses).toEqual({
      "200": {
        description: "Explicit widget.",
        content: {
          "application/json": {
            schema: {
              anyOf: [
                { $ref: "#/components/schemas/widget" },
                { $ref: "#/components/schemas/legacy-widget" },
              ],
            },
          },
        },
      },
    });
  });

  it("merges a bodyless delete fallback without inventing content", () => {
    const responses = buildStandardResponses(
      [
        { statusCodes: ["200"], doc: undefined, representations: [] },
        { statusCodes: [], doc: undefined, representations: [] },
      ],
      {},
      "delete",
    );

    expect(responses).toEqual({ "200": { description: "Resource deleted." } });
  });
});

describe("buildResponses", () => {
  it("promotes duplicate-status documentation only while the description is generic", () => {
    const responses = buildResponses(
      [
        { statusCodes: ["404"], doc: undefined, representations: [] },
        {
          statusCodes: ["404"],
          doc: "The widget was not found.",
          representations: [{ mediaType: "application/json" }],
        },
        {
          statusCodes: ["404"],
          doc: "Later documentation must not replace the first description.",
          representations: [{ mediaType: "text/plain" }],
        },
      ],
      {},
      () => ({ description: "Successful response" }),
    );

    expect(responses).toEqual({
      "404": {
        description: "The widget was not found.",
        content: { "application/json": {}, "text/plain": {} },
      },
    });
  });

  it.each([
    { representation: {}, reason: "neither media nor schema identity" },
    {
      representation: { id: "unknown" },
      reason: "an unresolved schema identity",
    },
  ])(
    "omits a representation with $reason and no media",
    ({ representation }) => {
      const responses = buildResponses(
        [
          {
            statusCodes: ["200"],
            doc: "Opaque response.",
            representations: [representation],
          },
        ],
        {},
        () => ({ description: "Successful response" }),
      );

      expect(responses).toEqual({ "200": { description: "Opaque response." } });
    },
  );

  it("retains advertised JSON media without inventing a schema for an unknown identity", () => {
    const responses = buildResponses(
      [
        {
          statusCodes: ["200"],
          doc: "Opaque JSON response.",
          representations: [{ id: "unknown", mediaType: "application/json" }],
        },
      ],
      {},
      () => ({ description: "Successful response" }),
    );

    expect(responses).toEqual({
      "200": {
        description: "Opaque JSON response.",
        content: { "application/json": {} },
      },
    });
  });
});
