/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { createRequire } from "node:module";
import SwaggerParser from "@apidevtools/swagger-parser";
import type { SchemaObject } from "openapi3-ts/oas30";
import { assert, describe, expect, it } from "vitest";
import {
  metadataEnrichmentWadl,
  sampleWadl,
  serializerEntryBodies,
  serializerFieldsWadl,
  serviceRootLinks,
} from "../../../testing/fixtures.js";
import { generateOpenApi } from "../../openapi/index.js";
import { parseWadl } from "../../wadl/index.js";

// Reuse SwaggerParser's transitive validator, as the other response tests do.
const require = createRequire(import.meta.url);
const requireFromParser = createRequire(
  require.resolve("@apidevtools/swagger-parser"),
);
const Ajv = requireFromParser("ajv") as new (options: {
  strict: boolean;
  allErrors: boolean;
}) => {
  addFormat(name: string, validate: (value: string) => boolean): void;
  compile(schema: object): (body: unknown) => boolean;
};
const ajv = new Ajv({ strict: false, allErrors: true });
ajv.addFormat("uri", (value) => URL.canParse(value));

const document = generateOpenApi(parseWadl(serializerFieldsWadl).unwrap(), {
  serviceRootLinks,
}).unwrap();
const entryFields = [
  "self_link",
  "web_link",
  "resource_type_link",
  "http_etag",
] as const;

function getRepresentation(id: string): SchemaObject {
  const schema = document.components?.schemas?.[id];
  assert(
    schema !== undefined && !("$ref" in schema),
    `Missing representation ${id}`,
  );
  return schema;
}

function getSharedEntrySchema(): SchemaObject {
  const path = document.paths["/people/+me"];
  const response =
    path?.get?.responses["200"]?.content?.["application/json"]?.schema;
  const body = path?.put?.requestBody;
  assert(body !== undefined && !("$ref" in body));
  const input = body.content["application/json"]?.schema;
  expect(response).toEqual({ $ref: "#/components/schemas/person-full" });
  expect(input).toEqual(response);
  return getRepresentation("person-full");
}

describe("serializer-owned response fields", () => {
  it.each(["person-full", "imaginary-full"])(
    "requires only declared entry headers on %s",
    (id) => {
      const schema = getRepresentation(id);
      for (const name of entryFields) {
        expect.soft(schema.required, `${id}.${name} presence`).toContain(name);
        expect
          .soft(schema.properties?.[name], `${id}.${name} ownership`)
          .toMatchObject({ readOnly: true });
        expect.soft(schema.properties?.[name]).not.toHaveProperty("nullable");
      }
      expect(schema.required).toEqual([...new Set(schema.required)]);
      expect(
        schema.required?.every((name) =>
          Object.hasOwn(schema.properties ?? {}, name),
        ),
      ).toBe(true);
    },
  );

  it("preserves non-null URI domains, descriptions and the self-link target", () => {
    expect(getRepresentation("person-full").properties?.self_link).toEqual({
      type: "string",
      format: "uri",
      description: "The canonical URL.",
      "x-lp-resource-type": "person",
      readOnly: true,
    });
    expect(getRepresentation("person-full").properties?.web_link).toEqual({
      type: "string",
      format: "uri",
      description: "The browser URL.",
      readOnly: true,
    });
    expect(getRepresentation("imaginary-full").properties?.self_link).toEqual({
      type: "string",
      format: "uri",
      "x-lp-resource-type": "imaginary",
      readOnly: true,
    });
  });

  it.each(entryFields)(
    "rejects a GET response missing %s but permits the PUT input without serializer fields",
    (name) => {
      const schema = getSharedEntrySchema();
      const validateResponse = ajv.compile(schema);
      expect(validateResponse(serializerEntryBodies.response)).toBe(true);
      const missingField: Record<string, unknown> = {
        ...serializerEntryBodies.response,
      };
      delete missingField[name];
      expect.soft(validateResponse(missingField)).toBe(false);
      expect
        .soft(
          validateResponse({ ...serializerEntryBodies.response, [name]: null }),
        )
        .toBe(false);

      // OpenAPI 3.0.3: readOnly + required applies only to responses. AJV's
      // JSON Schema validator needs a request projection for that OAS rule.
      const inputSchema = structuredClone(schema);
      inputSchema.required = schema.required?.filter((field) => {
        const property = schema.properties?.[field];
        return (
          property === undefined ||
          "$ref" in property ||
          property.readOnly !== true
        );
      });
      expect(inputSchema.required?.slice().sort()).toEqual([
        "name",
        "subscription_policy",
      ]);
      const validateInput = ajv.compile(inputSchema);
      expect(validateInput(serializerEntryBodies.input)).toBe(true);
      expect(validateInput({ subscription_policy: "Open" })).toBe(false);
      expect(validateInput({ name: "tester" })).toBe(false);
      expect.soft(schema.properties?.[name]).toMatchObject({ readOnly: true });
    },
  );

  it("requires only the type link on pages and the service root, leaving pagination optionality unchanged", () => {
    const page = getRepresentation("person-page");
    const root = getRepresentation("service-root-json");
    expect
      .soft(page.required?.slice().sort())
      .toEqual(["entries", "resource_type_link", "start"]);
    expect.soft(root.required).toEqual(["resource_type_link"]);
    for (const schema of [page, root]) {
      expect
        .soft(schema.properties?.resource_type_link)
        .toEqual({ type: "string", format: "uri", readOnly: true });
    }
    for (const name of [
      "total_size",
      "total_size_link",
      "next_collection_link",
      "prev_collection_link",
    ]) {
      expect(page.required).not.toContain(name);
      expect(page.properties?.[name]).not.toHaveProperty("readOnly");
    }
    for (const name of ["start", "entries"]) {
      expect(page.properties?.[name]).not.toHaveProperty("readOnly");
    }
    for (const name of ["self_link", "web_link", "http_etag"]) {
      expect(page.properties).not.toHaveProperty(name);
      expect(root.properties?.[name]).toEqual({});
    }
    const validatePage = ajv.compile({
      ...page,
      components: document.components,
    });
    expect(
      validatePage({
        resource_type_link: "https://api.launchpad.test/1.0/#people",
        start: 0,
        entries: [],
      }),
    ).toBe(true);
    expect.soft(validatePage({ start: 0, entries: [] })).toBe(false);
    const validateRoot = ajv.compile(root);
    expect(
      validateRoot({
        resource_type_link: "https://api.launchpad.test/1.0/#service-root",
      }),
    ).toBe(true);
    expect.soft(validateRoot({})).toBe(false);
  });

  it("keeps synthetic diff/write serializer names and unknown representations unchanged", () => {
    for (const id of ["imaginary-diff", "imaginary-write"]) {
      const schema = getRepresentation(id);
      for (const name of entryFields) {
        expect(schema.properties?.[name]).toEqual(
          name === "http_etag"
            ? {
                type: "string",
                ...(id === "imaginary-write" ? { example: "http_etag" } : {}),
              }
            : { type: "string", format: "uri" },
        );
      }
      expect(schema.required).toEqual(
        id.endsWith("diff") ? ["ordinary"] : ["http_etag"],
      );
    }
    const unknown = getRepresentation("unrecognized-json");
    expect(unknown.required).toEqual(["http_etag"]);
    for (const name of entryFields)
      expect(unknown.properties?.[name]).toEqual({});
    for (const name of ["web_link_alias", "self_linked"]) {
      expect(getRepresentation("person-full").properties?.[name]).toEqual({});
      expect(getRepresentation("person-full").required).not.toContain(name);
    }
  });

  it("never synthesizes absent entry, page or root properties or required names", () => {
    for (const wadl of [sampleWadl, metadataEnrichmentWadl]) {
      const schemas = generateOpenApi(parseWadl(wadl).unwrap()).unwrap()
        .components?.schemas;
      assert(schemas !== undefined);
      for (const schema of Object.values(schemas)) {
        assert(!("$ref" in schema));
        for (const name of schema.required ?? [])
          expect(schema.properties).toHaveProperty(name);
      }
      const person = schemas["person-full"];
      assert(person !== undefined && !("$ref" in person));
      expect(person.properties).not.toHaveProperty("web_link");
      expect(person.required).not.toContain("web_link");
    }
    const absent = generateOpenApi(parseWadl(sampleWadl).unwrap()).unwrap()
      .components?.schemas;
    for (const id of ["person-page", "service-root-json"]) {
      const schema = absent?.[id];
      assert(schema !== undefined && !("$ref" in schema));
      expect(schema.properties).not.toHaveProperty("resource_type_link");
      expect(schema.required ?? []).not.toContain("resource_type_link");
    }
  });

  it("validates the generated OpenAPI 3.0.3 document without dereferencing the original", async () => {
    const validated = await SwaggerParser.validate(
      JSON.parse(JSON.stringify(document)),
    );
    assert("openapi" in validated);
    expect(validated.openapi).toBe("3.0.3");
    getSharedEntrySchema();
  });
});
