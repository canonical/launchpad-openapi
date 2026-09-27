/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import type { SchemasObject } from "openapi3-ts/oas30";
import { describe, expect, it } from "vitest";
import {
  generatorEdgeWadl,
  resourceFieldContractsWadl,
  sampleWadl,
} from "../../testing/fixtures.js";
import { parseWadl } from "../wadl/index.js";
import buildSchemas from "./buildSchemas.js";

function representationProperties(schemas: SchemasObject, id: string) {
  const schema = schemas[id];
  if (
    schema === undefined ||
    "$ref" in schema ||
    schema.properties === undefined
  ) {
    throw new Error(`Missing object representation ${id}`);
  }
  return schema.properties;
}

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
            description: "The name.",
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

  describe("reviewed resource contracts", () => {
    it("describes observed integer, boolean, and string-array values with compatible examples", () => {
      const schemas = buildSchemas(
        parseWadl(resourceFieldContractsWadl).unwrap().representations,
      );
      const bug = representationProperties(schemas, "bug-full");
      const project = representationProperties(schemas, "project-full");
      const archive = representationProperties(schemas, "archive-full");

      expect(bug.id).toEqual({ type: "integer", example: 1 });
      expect(bug.heat).toEqual({ type: "integer", example: 1 });
      expect(bug.private).toEqual({ type: "boolean", example: true });
      expect(bug.security_related).toEqual({ type: "boolean" });
      expect(bug.tags).toEqual({
        type: "array",
        items: { type: "string" },
        example: [],
      });
      expect(project.active).toEqual({ type: "boolean", example: true });
      expect(project.licenses).toEqual({
        type: "array",
        items: { type: "string" },
        example: [],
      });
      expect(archive.relative_build_score).toEqual({
        type: "integer",
        example: 1,
      });
    });

    it("describes project content_templates as an object without unobserved member constraints or a string example", () => {
      const schemas = buildSchemas(
        parseWadl(resourceFieldContractsWadl).unwrap().representations,
      );

      expect(
        representationProperties(schemas, "project-full").content_templates,
      ).toEqual({ type: "object" });
      expect(schemas["project-full"]).toMatchObject({
        required: ["active", "licenses", "content_templates"],
      });
    });

    it("keeps a required nullable URI link typed and required", () => {
      const schemas = buildSchemas(
        parseWadl(resourceFieldContractsWadl).unwrap().representations,
      );

      expect(
        representationProperties(schemas, "bug-full").duplicate_of_link,
      ).toEqual({
        type: "string",
        format: "uri",
        "x-lp-resource-type": "bug",
        nullable: true,
      });
      expect(schemas["bug-full"]).toMatchObject({
        required: expect.arrayContaining(["duplicate_of_link"]),
      });
    });

    it("leaves null-only and unreviewed resource fields unconstrained without invented examples", () => {
      const schemas = buildSchemas(
        parseWadl(resourceFieldContractsWadl).unwrap().representations,
      );

      expect(
        representationProperties(schemas, "archive-full").authorized_size,
      ).toEqual({});
      expect(
        representationProperties(schemas, "distribution-full")
          .content_templates,
      ).toEqual({});
      expect(
        representationProperties(schemas, "bug-full").opaque_payload,
      ).toEqual({});
      expect(schemas["archive-full"]).toMatchObject({
        required: expect.arrayContaining(["authorized_size"]),
      });
      expect(schemas["distribution-full"]).toMatchObject({
        required: expect.arrayContaining(["content_templates"]),
      });
      expect(schemas["bug-full"]).toMatchObject({
        required: expect.not.arrayContaining(["opaque_payload"]),
      });
    });

    it("does not copy full-resource annotations onto diff schemas or unrelated full schemas", () => {
      const schemas = buildSchemas(
        parseWadl(resourceFieldContractsWadl).unwrap().representations,
      );

      expect(representationProperties(schemas, "bug-diff").private).toEqual({
        type: "string",
      });
      expect(
        representationProperties(schemas, "project-diff").content_templates,
      ).toEqual({ type: "string" });
      expect(
        representationProperties(schemas, "distribution-full")
          .content_templates,
      ).toEqual({});
    });

    it("does not make collection start or entries nullable", () => {
      const schemas = buildSchemas(
        parseWadl(sampleWadl).unwrap().representations,
      );
      const collection = representationProperties(schemas, "person-page");

      expect(collection.start).toEqual({ type: "integer", example: 1 });
      expect(collection.entries).toEqual({
        type: "array",
        items: { $ref: "#/components/schemas/person-full" },
        example: [],
      });
      expect(schemas["person-page"]).toMatchObject({
        required: expect.arrayContaining(["start", "entries"]),
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
