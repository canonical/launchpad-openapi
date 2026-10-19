/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { assert, describe, expect, it } from "vitest";
import { sampleWadl } from "../../../testing/fixtures.js";
import { parseWadl } from "../../wadl/index.js";
import buildParamSchema from "./buildParamSchema.js";

const typedWadl = `<application xmlns="http://wadl.dev.java.net/2009/02"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:alias="http://www.w3.org/2001/XMLSchema"
  xmlns:foreign="urn:example:not-xml-schema">
  <representation id="typed-json" mediaType="application/json">
    <param name="custom_counter" type="xsd:int" required="true"/>
    <param name="enabled_flag" type="xsd:boolean" required="true"/>
    <param name="label" type="xsd:string" required="true"/>
    <param name="created_on" type="xsd:date" required="true"/>
    <param name="created_at" type="xsd:dateTime" required="true"/>
    <param name="alias_counter" type="alias:int" required="true"/>
    <param name="foreign_counter" type="foreign:int"/>
    <param name="urls" type="xsd:string" repeating="true" required="true">
      <doc>URLs to check.</doc>
    </param>
    <param name="policies" type="xsd:string" repeating="true" required="true">
      <doc>Allowed policies.</doc>
      <option value="Open"/><option value="Closed"/>
    </param>
    <param name="related_links" type="xsd:string" repeating="true" required="true">
      <doc>Related people.</doc>
      <link resource_type="#person"/>
    </param>
    <param name="binary_link" type="xsd:base64Binary">
      <link resource_type="#person"/>
    </param>
    <param name="id" type="xsd:int" required="true"/>
    <param name="name" type="xsd:boolean" required="true"/>
    <param name="url" type="xsd:string" repeating="true" required="true"/>
  </representation>
</application>`;

function typedSchemas() {
  const fields =
    parseWadl(typedWadl).unwrap().representations["typed-json"]?.fields;
  assert(fields !== undefined);
  return Object.fromEntries(
    fields.map((field) => [field.name, buildParamSchema(field)]),
  );
}

describe("buildParamSchema", () => {
  describe("WADL parameter kinds", () => {
    it("maps links, enums, pagination values, arrays, and strings", () => {
      const model = parseWadl(sampleWadl).unwrap();
      const fullFields = model.representations["person-full"]?.fields;
      const pageFields = model.representations["person-page"]?.fields;
      assert(fullFields !== undefined);
      assert(pageFields !== undefined);

      expect(buildParamSchema(fullFields[0])).toEqual({
        type: "string",
        format: "uri",
        "x-lp-resource-type": "person",
        description: "The canonical URL.",
      });
      expect(buildParamSchema(fullFields[2])).toEqual({
        type: "string",
        enum: ["Open", "Moderated"],
        example: "Open",
      });
      expect(buildParamSchema(pageFields[0])).toEqual({
        type: "integer",
        example: 1,
      });
      expect(buildParamSchema(pageFields[2])).toEqual({
        type: "array",
        items: { type: "object" },
        example: [],
      });
      expect(buildParamSchema(fullFields[1])).toEqual({
        type: "string",
        description: "The name.",
        example: "ubuntu",
      });
    });
  });

  describe("reviewed repetition", () => {
    it("builds an array and array example without rewriting WADL", () => {
      const fields =
        parseWadl(sampleWadl).unwrap().representations["person-full"]?.fields;
      assert(fields !== undefined);
      const name = fields.find((field) => field.name === "name");
      assert(name !== undefined);
      expect(name.repeating).toBe(false);
      expect(buildParamSchema(name, undefined, true)).toEqual({
        type: "array",
        items: { type: "string" },
        description: "The name.",
        example: [],
      });
    });
  });

  describe("resource-field fallback", () => {
    it("leaves unobserved fields unconstrained without guessing from their names", () => {
      const fields =
        parseWadl(sampleWadl).unwrap().representations["person-full"]?.fields;
      assert(fields !== undefined);
      const name = fields.find((field) => field.name === "name");
      assert(name !== undefined);

      expect(buildParamSchema(name, {})).toEqual({
        description: "The name.",
      });
      expect(buildParamSchema({ ...name, name: "id" }, {})).toEqual({
        description: "The name.",
      });
    });

    it("keeps explicit WADL types ahead of reviewed fallback evidence", () => {
      const fields =
        parseWadl(typedWadl).unwrap().representations["typed-json"]?.fields;
      assert(fields !== undefined);
      const id = fields.find((field) => field.name === "id");
      assert(id !== undefined);
      expect(buildParamSchema(id, { type: "boolean" })).toEqual({
        type: "integer",
        example: 1,
      });
    });
  });
  describe("additional scalar and enum contracts", () => {
    it.each(["decimal", "double", "float", "base64Binary"])(
      "maps XSD %s with a type-compatible required example",
      (type) => {
        const fields = parseWadl(
          `<application xmlns="http://wadl.dev.java.net/2009/02"
            xmlns:xsd="http://www.w3.org/2001/XMLSchema">
            <representation id="scalar" mediaType="application/json">
              <param name="value" type="xsd:${type}" required="true"/>
            </representation>
          </application>`,
        ).unwrap().representations.scalar?.fields;
        assert(fields !== undefined);

        expect(buildParamSchema(fields[0])).toEqual(
          type === "base64Binary"
            ? { type: "string", format: "byte", example: "YQ==" }
            : { type: "number", example: 1 },
        );
      },
    );

    it.each([
      {
        type: "int",
        options: ["-2", "3"],
        schemaType: "integer",
        values: [-2, 3],
      },
      {
        type: "double",
        options: ["1.5", "2e2"],
        schemaType: "number",
        values: [1.5, 200],
      },
      {
        type: "int",
        options: ["1", "2.5"],
        schemaType: "string",
        values: ["1", "2.5"],
      },
      {
        type: "double",
        options: ["1", "Infinity"],
        schemaType: "string",
        values: ["1", "Infinity"],
      },
      {
        type: "boolean",
        options: ["false", "true"],
        schemaType: "boolean",
        values: [false, true],
      },
      {
        type: "boolean",
        options: ["true", "unknown"],
        schemaType: "string",
        values: ["true", "unknown"],
      },
      {
        type: "string",
        options: ["Open", "Closed"],
        schemaType: "string",
        values: ["Open", "Closed"],
      },
    ])(
      "converts $type options $options without losing unrepresentable wire values",
      ({ type, options, schemaType, values }) => {
        const fields = parseWadl(
          `<application xmlns="http://wadl.dev.java.net/2009/02"
            xmlns:xsd="http://www.w3.org/2001/XMLSchema">
            <representation id="choice" mediaType="application/json">
              <param name="value" type="xsd:${type}" required="true">
                ${options.map((value) => `<option value="${value}"/>`).join("")}
              </param>
            </representation>
          </application>`,
        ).unwrap().representations.choice?.fields;
        assert(fields !== undefined);

        expect(buildParamSchema(fields[0])).toEqual({
          type: schemaType,
          enum: values,
          example: values[0],
        });
      },
    );

    it("keeps unknown XSD types unconstrained by their names while retaining options", () => {
      const fields = parseWadl(
        `<application xmlns="http://wadl.dev.java.net/2009/02"
          xmlns:xsd="http://www.w3.org/2001/XMLSchema">
          <representation id="unknown" mediaType="application/json">
            <param name="value" type="xsd:unsupported" required="true"/>
            <param name="choice" type="xsd:unsupported" required="true">
              <option value="custom"/>
            </param>
          </representation>
        </application>`,
      ).unwrap().representations.unknown?.fields;
      assert(fields !== undefined);

      expect(buildParamSchema(fields[0])).toEqual({
        type: "string",
        example: "value",
      });
      expect(buildParamSchema(fields[1])).toEqual({
        type: "string",
        enum: ["custom"],
        example: "custom",
      });
    });
  });

  describe("required example compatibility", () => {
    it.each([{}, { type: "object" as const }])(
      "omits scalar examples for fallback schema %j",
      (fallback) => {
        const fields =
          parseWadl(sampleWadl).unwrap().representations["person-full"]?.fields;
        assert(fields !== undefined);
        const name = fields.find((field) => field.name === "name");
        assert(name !== undefined);

        expect(buildParamSchema(name, fallback)).toEqual({
          ...fallback,
          description: "The name.",
        });
      },
    );

    it.each([
      { name: "url", example: "https://git.launchpad.net/launchpad" },
      { name: "owner", example: undefined },
      { name: "unrecognized_uri", example: undefined },
    ])(
      "uses a curated URI only with a real scheme for $name",
      ({ name, example }) => {
        const fields = parseWadl(
          `<application xmlns="http://wadl.dev.java.net/2009/02"
          xmlns:xsd="http://www.w3.org/2001/XMLSchema">
          <representation id="uri" mediaType="application/json">
            <param name="${name}" type="xsd:anyURI" required="true"/>
          </representation>
        </application>`,
        ).unwrap().representations.uri?.fields;
        assert(fields !== undefined);

        expect(buildParamSchema(fields[0])).toEqual({
          type: "string",
          format: "uri",
          ...(example === undefined ? {} : { example }),
        });
      },
    );
  });

  describe("explicit WADL types and repetition", () => {
    it("maps scalar XML Schema types and required examples", () => {
      const schemas = typedSchemas();
      expect(schemas["custom_counter"]).toEqual({
        type: "integer",
        example: expect.any(Number),
      });
      expect(schemas["enabled_flag"]).toEqual({
        type: "boolean",
        example: expect.any(Boolean),
      });
      expect(schemas["label"]).toEqual({
        type: "string",
        example: expect.any(String),
      });
      expect(schemas["created_on"]).toEqual({
        type: "string",
        format: "date",
        example: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
      expect(schemas["created_at"]).toEqual({
        type: "string",
        format: "date-time",
        example: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
        ),
      });
    });

    it("resolves a namespace alias inherited from the application", () => {
      expect(typedSchemas()["alias_counter"]).toEqual({
        type: "integer",
        example: expect.any(Number),
      });
    });

    it("does not interpret a different namespace's int as XSD", () => {
      expect(typedSchemas()["foreign_counter"]).toEqual({ type: "string" });
    });

    it("represents repeated strings as arrays with outer descriptions", () => {
      const schema = typedSchemas()["urls"];
      expect(schema).toEqual({
        type: "array",
        items: { type: "string" },
        description: "URLs to check.",
        example: expect.any(Array),
      });
      const example = schema?.example;
      assert(Array.isArray(example));
      for (const value of example) expect(typeof value).toBe("string");
    });

    it("keeps repeated enum constraints on the items", () => {
      const schema = typedSchemas()["policies"];
      expect(schema).toEqual({
        type: "array",
        items: { type: "string", enum: ["Open", "Closed"] },
        description: "Allowed policies.",
        example: expect.any(Array),
      });
      const example = schema?.example;
      assert(Array.isArray(example));
      for (const value of example) expect(["Open", "Closed"]).toContain(value);
    });

    it("keeps repeated link constraints on the items", () => {
      const schema = typedSchemas()["related_links"];
      expect(schema).toEqual({
        type: "array",
        items: {
          type: "string",
          format: "uri",
          "x-lp-resource-type": "person",
        },
        description: "Related people.",
        example: expect.any(Array),
      });
      const example = schema?.example;
      assert(Array.isArray(example));
      for (const value of example) {
        expect(value).toEqual(expect.stringMatching(/^[a-z][a-z\d+.-]*:/i));
      }
    });

    it("keeps a link as a URI despite a binary datatype", () => {
      expect(typedSchemas()["binary_link"]).toEqual({
        type: "string",
        format: "uri",
        "x-lp-resource-type": "person",
      });
    });

    it("does not use curated scalar examples for typed or repeated fields", () => {
      const schemas = typedSchemas();
      expect(schemas["id"]).toEqual({
        type: "integer",
        example: expect.any(Number),
      });
      expect(schemas["name"]).toEqual({
        type: "boolean",
        example: expect.any(Boolean),
      });
      expect(schemas["url"]).toEqual({
        type: "array",
        items: { type: "string" },
        example: expect.any(Array),
      });
      const example = schemas["url"]?.example;
      assert(Array.isArray(example));
      for (const value of example) expect(typeof value).toBe("string");
    });
  });
});
