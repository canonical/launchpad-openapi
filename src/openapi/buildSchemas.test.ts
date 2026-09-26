/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { describe, expect, it } from "vitest";
import { generatorEdgeWadl, sampleWadl } from "../../testing/fixtures.js";
import { parseWadl } from "../wadl/index.js";
import buildSchemas from "./buildSchemas.js";

describe("buildSchemas", () => {
  describe("representation fields", () => {
    it("maps links, enums, descriptions, and required fields", () => {
      const model = parseWadl(sampleWadl).unwrap();
      const schemas = buildSchemas(model.representations);

      expect(schemas["service-root-json"]).toEqual({
        type: "object",
        properties: {
          people_collection_link: {
            type: "string",
            format: "uri",
            "x-lp-resource-type": "people",
          },
          me_link: {
            type: "string",
            format: "uri",
            "x-lp-resource-type": "person",
          },
        },
      });
      expect(schemas["person-full"]).toEqual({
        type: "object",
        properties: {
          self_link: {
            type: "string",
            format: "uri",
            "x-lp-resource-type": "person",
            description: "The canonical URL.",
          },
          name: {
            type: "string",
            description: "The name.",
            example: "ubuntu",
          },
          subscription_policy: {
            type: "string",
            enum: ["Open", "Moderated"],
            example: "Open",
          },
        },
        required: ["name", "subscription_policy"],
      });
    });

    it("maps pagination fields and resolves entry item references", () => {
      const model = parseWadl(sampleWadl).unwrap();
      const schema = buildSchemas(model.representations)["person-page"];

      expect(schema).toEqual({
        type: "object",
        properties: {
          total_size: { type: "integer", example: 1 },
          start: { type: "integer", example: 1 },
          entries: {
            type: "array",
            items: { $ref: "#/components/schemas/person-full" },
            example: [],
          },
        },
        required: ["total_size", "start", "entries"],
      });
    });
  });

  describe("edge cases", () => {
    it("keeps empty schemas and generic unresolved entry items", () => {
      const model = parseWadl(generatorEdgeWadl).unwrap();
      const schemas = buildSchemas(model.representations);

      expect(schemas["empty-json"]).toEqual({ type: "object" });
      expect(schemas["orphan-page"]).toEqual({
        type: "object",
        properties: {
          entries: { type: "array", items: { type: "object" }, example: [] },
        },
        required: ["entries"],
      });
    });

    it("returns an empty map for a document without representations", () => {
      expect(buildSchemas({})).toEqual({});
    });
  });
});
