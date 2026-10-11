/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { createRequire } from "node:module";
import SwaggerParser from "@apidevtools/swagger-parser";
import type {
  OpenAPIObject,
  OperationObject,
  ReferenceObject,
  SchemaObject,
} from "openapi3-ts/oas30";
import { assert, describe, expect, it } from "vitest";
import {
  observedBinaryFileMetadata,
  publicationFileResponsesWadl,
  sourceFileMetadata,
} from "../../../testing/fixtures.js";
import { generateOpenApi } from "../../openapi/index.js";
import { parseWadl } from "../../wadl/index.js";

// Resolve the existing transitive validator, without adding a package dependency.
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
// ajv-formats is not installed; Node's URL parser validates the URI format.
ajv.addFormat("uri", (value) => URL.canParse(value));

const publicationKinds = [
  {
    kind: "binary",
    resource: "binary_package_publishing_history",
    subject: "binaryPackagePublishingHistory",
    operation: "binaryFileUrls",
    segment: "+binarypub",
    metadata: observedBinaryFileMetadata,
    keys: ["url", "size", "sha1", "sha256"],
  },
  {
    kind: "source",
    resource: "source_package_publishing_history",
    subject: "sourcePackagePublishingHistory",
    operation: "sourceFileUrls",
    segment: "+sourcepub",
    metadata: sourceFileMetadata,
    keys: ["url", "size", "sha256"],
  },
] as const;
const routes = [
  { label: "distribution", prefix: "/{distribution}/+archive/{archive}" },
  { label: "ppa", prefix: "/{owner}/+archive/{distribution}/{archive}" },
] as const;
const document = convertWadl();

function convertWadl(wadl = publicationFileResponsesWadl): OpenAPIObject {
  return generateOpenApi(parseWadl(wadl).unwrap()).unwrap();
}

function findOperation(generated: OpenAPIObject, id: string): OperationObject {
  const operation = Object.values(generated.paths)
    .map((path) => path?.get)
    .find((candidate) => candidate?.operationId === id);
  assert(operation !== undefined, `Missing generated operation ${id}`);
  return operation;
}

function resolveSchema(
  generated: OpenAPIObject,
  schema: SchemaObject | ReferenceObject | undefined,
): SchemaObject {
  assert(schema !== undefined, "Missing generated response schema");
  if (!("$ref" in schema)) return schema;
  assert(schema.$ref.startsWith("#/components/schemas/"));
  return resolveSchema(
    generated,
    generated.components?.schemas?.[
      schema.$ref.slice("#/components/schemas/".length)
    ],
  );
}

function getResponseSchema(generated: OpenAPIObject, id: string): SchemaObject {
  return resolveSchema(
    generated,
    findOperation(generated, id).responses["200"]?.content?.["application/json"]
      ?.schema,
  );
}

function compileResponse(generated: OpenAPIObject, id: string) {
  return ajv.compile({
    ...getResponseSchema(generated, id),
    components: generated.components,
  });
}

function getMetadataItem(generated: OpenAPIObject, id: string): SchemaObject {
  const alternatives = getResponseSchema(generated, id).anyOf;
  assert(
    alternatives !== undefined,
    `${id} must expose array alternatives with anyOf`,
  );
  const metadataArray = alternatives
    .map((schema) => resolveSchema(generated, schema))
    .find(
      (schema) =>
        schema.type === "array" &&
        resolveSchema(generated, schema.items).type === "object",
    );
  assert(
    metadataArray !== undefined,
    `${id} must expose a metadata-object array`,
  );
  return resolveSchema(generated, metadataArray.items);
}

function updateMethod(
  wadl: string,
  id: string,
  update: (method: string) => string,
): string {
  const start = wadl.indexOf(`<wadl:method name="GET" id="${id}">`);
  assert(start >= 0);
  const end = wadl.indexOf("</wadl:method>", start) + "</wadl:method>".length;
  return (
    wadl.slice(0, start) + update(wadl.slice(start, end)) + wadl.slice(end)
  );
}

describe("generated publication file response contracts", () => {
  for (const publication of publicationKinds) {
    for (const route of routes) {
      const id = `${publication.subject}.${route.label}.${publication.operation}`;
      describe(`${publication.kind} ${route.label}`, () => {
        it("retains semantic operation IDs, canonical routes, and optional include_meta", () => {
          const path = `${route.prefix}/${publication.segment}/{id}?ws.op=${publication.operation}`;
          expect(document.paths[path]?.get?.operationId).toBe(id);
          expect(findOperation(document, id).parameters).toContainEqual(
            expect.objectContaining({
              name: "include_meta",
              in: "query",
              required: false,
              schema: { type: "boolean" },
            }),
          );
        });

        it("uses anyOf between homogeneous arrays, allowing their overlapping empty case", () => {
          const schema = getResponseSchema(document, id);
          expect(schema.oneOf).toBeUndefined();
          expect(
            schema.anyOf,
            `${id} needs URL-array and metadata-array alternatives`,
          ).toHaveLength(2);
          assert(schema.anyOf !== undefined);
          for (const alternative of schema.anyOf) {
            const array = resolveSchema(document, alternative);
            expect(array.type).toBe("array");
            expect(array.minItems).toBeUndefined();
            expect(resolveSchema(document, array.items).anyOf).toBeUndefined();
            expect(resolveSchema(document, array.items).oneOf).toBeUndefined();
            expect(
              ajv.compile({ ...array, components: document.components })([]),
            ).toBe(true);
          }
          expect(compileResponse(document, id)([])).toBe(true);
        });

        it.each(["omitted", "false"])(
          "accepts homogeneous URI arrays for include_meta=%s",
          () => {
            const validate = compileResponse(document, id);
            expect(validate([])).toBe(true);
            expect(validate([publication.metadata.url])).toBe(true);
            expect(
              validate([
                publication.metadata.url,
                `${publication.metadata.url}?second=1`,
              ]),
            ).toBe(true);
          },
        );

        it("accepts include_meta=true metadata responses, including multiple files and empty results", () => {
          const validate = compileResponse(document, id);
          expect(validate([])).toBe(true);
          expect(
            validate([publication.metadata]),
            `${id} must accept its source-backed metadata body`,
          ).toBe(true);
          expect(
            validate([
              publication.metadata,
              {
                ...publication.metadata,
                url: `${publication.metadata.url}?second=1`,
                size: 0,
              },
            ]),
          ).toBe(true);
        });

        it("declares exactly the source-backed required non-null item fields", () => {
          const item = getMetadataItem(document, id);
          expect(Object.keys(item.properties ?? {}).sort()).toEqual(
            [...publication.keys].sort(),
          );
          expect([...(item.required ?? [])].sort()).toEqual(
            [...publication.keys].sort(),
          );
          expect(item.nullable).not.toBe(true);
          for (const key of publication.keys) {
            const property = resolveSchema(document, item.properties?.[key]);
            expect(property.type).toBe(key === "size" ? "integer" : "string");
            expect(property.nullable).not.toBe(true);
            expect(property.pattern).toBeUndefined();
            expect(property.minimum).toBeUndefined();
            expect(property.exclusiveMinimum).toBeUndefined();
            expect(property.minLength).toBeUndefined();
          }
          expect(resolveSchema(document, item.properties?.url).format).toBe(
            "uri",
          );
          if (publication.kind === "source")
            expect(item.properties).not.toHaveProperty("sha1");
        });

        it("rejects mixed arrays, malformed arrays, nulls, and non-URI strings", () => {
          const validate = compileResponse(document, id);
          for (const body of [
            [publication.metadata.url, publication.metadata],
            [publication.metadata, publication.metadata.url],
            null,
            publication.metadata,
            publication.metadata.url,
            [null],
            [7],
            [true],
            [[]],
            ["not a URI"],
            [publication.metadata.url, null],
            [{ ...publication.metadata, url: "not a URI" }],
          ]) {
            expect(validate(body), `must reject ${JSON.stringify(body)}`).toBe(
              false,
            );
          }
        });

        it("rejects missing, null, and wrongly typed metadata fields without coercion", () => {
          const validate = compileResponse(document, id);
          for (const key of publication.keys) {
            const incomplete: Record<string, unknown> = {
              ...publication.metadata,
            };
            delete incomplete[key];
            expect(validate([incomplete]), `must require ${key}`).toBe(false);
            expect(
              validate([{ ...publication.metadata, [key]: null }]),
              `must reject null ${key}`,
            ).toBe(false);
            for (const wrong of key === "size"
              ? ["26006", 1.5, false, {}, []]
              : [7, false, {}, []]) {
              expect(
                validate([{ ...publication.metadata, [key]: wrong }]),
                `must reject ${key}=${JSON.stringify(wrong)}`,
              ).toBe(false);
            }
          }
        });
      });
    }
  }

  it("validates the complete generated document as OpenAPI 3.0.3", async () => {
    const validated = await SwaggerParser.validate(
      JSON.parse(JSON.stringify(document)),
    );
    assert("openapi" in validated);
    expect(validated.openapi).toBe("3.0.3");
  });
});

describe("publication response fallback boundaries", () => {
  it("recovers metadata responses when production WADL omits parameter types", () => {
    const untyped = convertWadl(
      publicationFileResponsesWadl.replaceAll(' type="xsd:boolean"', ""),
    );
    for (const publication of publicationKinds) {
      for (const route of routes) {
        const id = `${publication.subject}.${route.label}.${publication.operation}`;
        const validate = compileResponse(untyped, id);
        expect(validate([publication.metadata])).toBe(true);
        expect(validate([publication.metadata.url])).toBe(true);
        expect(validate([])).toBe(true);
        expect(findOperation(untyped, id).parameters).toContainEqual(
          expect.objectContaining({
            name: "include_meta",
            in: "query",
            required: false,
            // Retain the converter's existing untyped-query fallback.
            schema: { type: "string" },
          }),
        );
      }
    }
  });

  it.each(publicationKinds)(
    "fills an empty statusless $kind response from the reviewed contract",
    (publication) => {
      const baseId = `${publication.resource}-${publication.operation}`;
      const emptyResponse = convertWadl(
        updateMethod(publicationFileResponsesWadl, baseId, (method) =>
          method.replace("</wadl:method>", "<wadl:response/></wadl:method>"),
        ),
      );
      for (const route of routes) {
        const id = `${publication.subject}.${route.label}.${publication.operation}`;
        expect(getResponseSchema(emptyResponse, id)).toEqual(
          getResponseSchema(document, id),
        );
        expect(compileResponse(emptyResponse, id)([publication.metadata])).toBe(
          true,
        );
      }
    },
  );

  it.each(publicationKinds)(
    "preserves unresolved statusless $kind representation fallback behavior",
    (publication) => {
      const baseId = `${publication.resource}-${publication.operation}`;
      const unresolved = convertWadl(
        updateMethod(publicationFileResponsesWadl, baseId, (method) =>
          method.replace(
            "</wadl:method>",
            '<wadl:response><wadl:representation href="#unknown" mediaType="application/json"/></wadl:response></wadl:method>',
          ),
        ),
      );
      for (const route of routes) {
        const id = `${publication.subject}.${route.label}.${publication.operation}`;
        expect(getResponseSchema(unresolved, id)).toEqual({
          type: "array",
          items: { type: "string", format: "uri" },
        });
        expect(compileResponse(unresolved, id)([publication.metadata])).toBe(
          false,
        );
      }
    },
  );

  it.each(publicationKinds)(
    "keeps $kind responses URL-only when include_meta is absent",
    (publication) => {
      const baseId = `${publication.resource}-${publication.operation}`;
      const wadl = updateMethod(
        publicationFileResponsesWadl,
        baseId,
        (method) =>
          method.replace(
            '<wadl:param name="include_meta" type="xsd:boolean" required="false"/>',
            "",
          ),
      );
      const legacy = convertWadl(wadl);
      for (const route of routes) {
        const id = `${publication.subject}.${route.label}.${publication.operation}`;
        expect(getResponseSchema(legacy, id)).toEqual({
          type: "array",
          items: { type: "string", format: "uri" },
        });
        const validate = compileResponse(legacy, id);
        expect(validate([])).toBe(true);
        expect(validate([publication.metadata.url])).toBe(true);
        expect(validate([publication.metadata])).toBe(false);
        expect(
          findOperation(legacy, id).parameters?.some(
            (param) => !("$ref" in param) && param.name === "include_meta",
          ),
        ).toBe(false);
      }
    },
  );

  it("does not widen unrelated URL operations, even one accepting include_meta", () => {
    for (const id of [
      "sourcePackagePublishingHistory.distribution.binaryFileUrls",
      "sourcePackagePublishingHistory.ppa.binaryFileUrls",
      "packageUpload.series.sourceFileUrls",
      "packageUpload.explicitSeries.sourceFileUrls",
      "packageUpload.series.binaryFileUrls",
      "packageUpload.explicitSeries.binaryFileUrls",
      "packageUpload.series.customFileUrls",
      "packageUpload.explicitSeries.customFileUrls",
      "person.binaryFileUrls",
    ]) {
      expect(getResponseSchema(document, id)).toEqual({
        type: "array",
        items: { type: "string", format: "uri" },
      });
      expect(compileResponse(document, id)([observedBinaryFileMetadata])).toBe(
        false,
      );
    }
  });

  for (const publication of publicationKinds) {
    const baseId = `${publication.resource}-${publication.operation}`;
    it(`preserves explicit statusless ${publication.kind} WADL representation schemas`, () => {
      const explicit = convertWadl(
        updateMethod(publicationFileResponsesWadl, baseId, (method) =>
          method.replace(
            "</wadl:method>",
            '<wadl:response><wadl:representation href="#publication-explicit"/></wadl:response></wadl:method>',
          ),
        ),
      );
      for (const route of routes) {
        const operation = findOperation(
          explicit,
          `${publication.subject}.${route.label}.${publication.operation}`,
        );
        expect(
          operation.responses["200"]?.content?.["application/json"]?.schema,
        ).toEqual({ $ref: "#/components/schemas/publication-explicit" });
        expect(
          compileResponse(
            explicit,
            `${publication.subject}.${route.label}.${publication.operation}`,
          )([{ ...publication.metadata }]),
        ).toBe(false);
      }
    });

    it(`preserves explicit ${publication.kind} statuses, media, and unresolved schemas`, async () => {
      const explicit = convertWadl(
        updateMethod(publicationFileResponsesWadl, baseId, (method) =>
          method.replace(
            "</wadl:method>",
            '<wadl:response status="200"><wadl:representation href="#publication-explicit" mediaType="application/json"/></wadl:response><wadl:response status="400"><wadl:representation href="#publication-explicit" mediaType="application/problem+json"/></wadl:response><wadl:response status="404"><wadl:representation href="#unknown" mediaType="application/json"/></wadl:response><wadl:response status="415"><wadl:representation mediaType="text/plain"/></wadl:response></wadl:method>',
          ),
        ),
      );
      for (const route of routes) {
        const operation = findOperation(
          explicit,
          `${publication.subject}.${route.label}.${publication.operation}`,
        );
        expect(Object.keys(operation.responses)).toEqual([
          "200",
          "400",
          "404",
          "415",
        ]);
        expect(operation.responses["200"]?.content).toEqual({
          "application/json": {
            schema: { $ref: "#/components/schemas/publication-explicit" },
          },
        });
        expect(operation.responses["400"]?.content).toEqual({
          "application/problem+json": {
            schema: { $ref: "#/components/schemas/publication-explicit" },
          },
        });
        expect(operation.responses["404"]?.content).toEqual({
          "application/json": {},
        });
        expect(operation.responses["415"]?.content).toEqual({
          "text/plain": {},
        });
      }
      await SwaggerParser.validate(JSON.parse(JSON.stringify(explicit)));
    });
  }
});
