/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import type { SchemasObject } from "openapi3-ts/oas30";
import { describe, expect, it } from "vitest";
import {
  branchLookupWadl,
  generatorEdgeWadl,
  metadataEnrichmentWadl,
  sampleWadl,
} from "../../../testing/fixtures.js";
import { parseWadl } from "../../wadl/index.js";
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
      expect(schemas["person-full"]).toMatchObject({
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

  describe("response field contracts", () => {
    it("keeps a required nullable URI link typed and required", () => {
      const schemas = buildSchemas(
        parseWadl(metadataEnrichmentWadl).unwrap().representations,
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

    it("keeps observed branch links nullable in full and generated nullable schemas", () => {
      const wadl = branchLookupWadl.replace(
        '    <wadl:param name="unique_name" required="true" type="xsd:string"/>',
        `    <wadl:param name="code_import_link" required="true"><wadl:link resource_type="#code_import"/></wadl:param>
    <wadl:param name="sourcepackage_link" required="true"><wadl:link resource_type="#source_package"/></wadl:param>
    <wadl:param name="unique_name" required="true" type="xsd:string"/>`,
      );
      const schemas = buildSchemas(parseWadl(wadl).unwrap().representations);

      for (const id of ["branch-full", "branch-full-nullable"]) {
        const properties = representationProperties(schemas, id);
        expect(properties.code_import_link).toEqual({
          type: "string",
          format: "uri",
          "x-lp-resource-type": "code_import",
          nullable: true,
        });
        expect(properties.sourcepackage_link).toEqual({
          type: "string",
          format: "uri",
          "x-lp-resource-type": "source_package",
          nullable: true,
        });
        expect(schemas[id]).toMatchObject({
          required: expect.arrayContaining([
            "code_import_link",
            "sourcepackage_link",
          ]),
        });
      }
      expect(schemas["branch-full"]).not.toHaveProperty("nullable");
      expect(schemas["branch-full-nullable"]).toMatchObject({ nullable: true });
    });

    it("keeps branch format enum wire strings exact in full and nullable schemas without changing other options or representations", () => {
      const formats = [
        ["branch_format", "Bazaar Branch Format 7 (needs bzr 1.6)\n"],
        ["control_format", "Bazaar-NG meta directory, format 1\n"],
        [
          "repository_format",
          "Bazaar repository format 2a (needs bzr 1.16 or later)\n",
        ],
      ] as const;
      const formatFields = formats
        .map(
          ([name, value]) =>
            `<wadl:param name="${name}" required="true" type="xsd:string">
      <wadl:option value="${value}"/>
      <wadl:option value="another format"/>
      <wadl:option value="already&#10;escaped"/>
    </wadl:param>`,
        )
        .join("\n    ");
      const wadl = branchLookupWadl
        .replace(
          '    <wadl:param name="unique_name" required="true" type="xsd:string"/>',
          `${formatFields}
    <wadl:param name="unique_name" required="true" type="xsd:string"/>`,
        )
        .replace(
          '  <wadl:representation mediaType="application/json" id="project-full">',
          `<wadl:representation mediaType="application/json" id="branch-diff">
    <wadl:param name="branch_format" type="xsd:string"><wadl:option value="Bazaar Branch Format 7 (needs bzr 1.6) "/></wadl:param>
  </wadl:representation>
  <wadl:representation mediaType="application/json" id="branch-write">
    <wadl:param name="branch_format" type="xsd:string"><wadl:option value="Bazaar Branch Format 7 (needs bzr 1.6) "/></wadl:param>
  </wadl:representation>
  <wadl:representation mediaType="application/json" id="project-full">
    <wadl:param name="branch_format" type="xsd:string"><wadl:option value="Bazaar Branch Format 7 (needs bzr 1.6) "/></wadl:param>`,
        );
      const schemas = buildSchemas(parseWadl(wadl).unwrap().representations);

      for (const id of ["branch-full", "branch-full-nullable"]) {
        const properties = representationProperties(schemas, id);
        for (const [name, wireValue] of formats) {
          const field = properties[name];
          expect(field).toMatchObject({
            type: "string",
            enum: [wireValue, "another format", "already\nescaped", null],
            example: wireValue,
          });
        }
      }
      for (const id of ["branch-diff", "branch-write", "project-full"]) {
        expect(
          representationProperties(schemas, id).branch_format,
        ).toMatchObject({
          enum: id.startsWith("branch-")
            ? ["Bazaar Branch Format 7 (needs bzr 1.6) ", null]
            : ["Bazaar Branch Format 7 (needs bzr 1.6) "],
        });
      }
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
