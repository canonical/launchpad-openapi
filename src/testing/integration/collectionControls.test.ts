/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { createRequire } from "node:module";
import SwaggerParser from "@apidevtools/swagger-parser";
import type {
  ContentObject,
  OpenAPIObject,
  OperationObject,
  ParameterObject,
  ReferenceObject,
  SchemaObject,
} from "openapi3-ts/oas30";
import { assert, describe, expect, it } from "vitest";
import {
  collectionControlsWadl,
  collectionPageBodies,
  publicationFileResponsesWadl,
} from "../../../testing/fixtures.js";
import { generateOpenApi } from "../../openapi/index.js";
import buildSchemas from "../../openapi/buildSchemas.js";
import {
  buildNamedOperation,
  buildStandardOperation,
} from "../../openapi/operations.js";
import { parseWadl } from "../../wadl/index.js";

// Use SwaggerParser's existing real validator; no new dependency or schema evaluator.
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

const document = convertWadl();
const pagingControls = [
  ["ws.start", "integer"],
  ["ws.size", "integer"],
  ["memo", "string"],
  ["direction", "string"],
] as const;
const routes = [
  { label: "distribution", prefix: "/{distribution}/+archive/{archive}" },
  { label: "ppa", prefix: "/{owner}/+archive/{distribution}/{archive}" },
] as const;

function convertWadl(wadl = collectionControlsWadl): OpenAPIObject {
  return generateOpenApi(parseWadl(wadl).unwrap()).unwrap();
}

function findOperation(id: string, generated = document): OperationObject {
  const operation = Object.values(generated.paths)
    .flatMap((path) => [path?.get, path?.post])
    .find((candidate) => candidate?.operationId === id);
  assert(operation !== undefined, `Missing generated operation ${id}`);
  return operation;
}

function getQueryParameters(operation: OperationObject): ParameterObject[] {
  return (operation.parameters ?? []).filter(
    (parameter): parameter is ParameterObject =>
      "in" in parameter && parameter.in === "query",
  );
}

function getQueryParameter(operation: OperationObject, name: string) {
  const matching = getQueryParameters(operation).filter(
    (parameter) => parameter.name === name,
  );
  assert(matching.length === 1, `Expected exactly one query control ${name}`);
  const parameter = matching[0];
  assert(parameter !== undefined);
  return parameter;
}

function getResponseSchema(
  operation: OperationObject,
  status = "200",
  media = "application/json",
): SchemaObject | ReferenceObject {
  const schema = operation.responses[status]?.content?.[media]?.schema;
  assert(schema !== undefined, `Missing ${status} ${media} response schema`);
  return schema;
}

function compileResponse(
  operation: OperationObject,
  status = "200",
  media = "application/json",
) {
  return ajv.compile({
    ...getResponseSchema(operation, status, media),
    components: document.components,
  });
}

function collectAlternatives(
  schema: SchemaObject | ReferenceObject,
): (SchemaObject | ReferenceObject)[] {
  if ("$ref" in schema || schema.anyOf === undefined) return [schema];
  return schema.anyOf.flatMap(collectAlternatives);
}

function expectOptionalControl(
  operation: OperationObject,
  name: string,
  type: "integer" | "string",
) {
  const parameter = getQueryParameter(operation, name);
  expect(parameter.required).toBe(false);
  expect(parameter.schema).toEqual({ type });
  return parameter;
}

function expectCountUnion(
  operation: OperationObject,
  refs: string[],
  status = "200",
  media = "application/json",
) {
  const schema = getResponseSchema(operation, status, media);
  assert(
    !("$ref" in schema),
    "Count alternatives belong on the operation schema",
  );
  expect(schema.anyOf).toBeDefined();
  const alternatives = collectAlternatives(schema);
  expect(alternatives.filter((candidate) => "$ref" in candidate)).toEqual(
    refs.map((id) => ({ $ref: `#/components/schemas/${id}` })),
  );
  const counts = alternatives.filter(
    (candidate): candidate is SchemaObject => !("$ref" in candidate),
  );
  expect(counts).toHaveLength(1);
  expect(counts[0]).toMatchObject({ type: "integer", minimum: 0 });
  expect(counts[0]).not.toHaveProperty("nullable");
  expect(counts[0]).not.toHaveProperty("maximum");
  const descriptions = [
    operation.description,
    operation.responses[status]?.description,
    schema.description,
    ...counts.map((candidate) => candidate.description),
  ].join(" ");
  expect(descriptions).toContain("ws.show=total_size");
}

describe("generated collection controls", () => {
  describe("named archive collections", () => {
    for (const route of routes) {
      const id = `archive-getPublishedSources-${route.label}`;
      const operation = findOperation(id);

      it(`retains the ${route.label} semantic ID and supplements only missing controls`, () => {
        expect(
          document.paths[`${route.prefix}?ws.op=getPublishedSources`]?.get
            ?.operationId,
        ).toBe(id);
        for (const [name, type] of pagingControls) {
          expectOptionalControl(operation, name, type);
        }
        expectOptionalControl(operation, "ws.show", "string");
        expect(
          getQueryParameters(operation).map((parameter) => parameter.name),
        ).toEqual([
          "source_name",
          "exact_match",
          "version",
          ...pagingControls.map(([name]) => name),
          "ws.show",
        ]);
        expect(getQueryParameter(operation, "exact_match")).toMatchObject({
          required: false,
          schema: { type: "boolean" },
        });
      });

      it(`advertises the ${route.label} page ref and non-null integer count at operation level`, () => {
        expectCountUnion(operation, ["source_package_publishing_history-page"]);
      });

      it.each([0, 3, 1000000])(
        `accepts JSON integer count %s for ${route.label}`,
        (count) => {
          expect(compileResponse(operation)(count)).toBe(true);
        },
      );

      it.each(["3", -1, 1.5, null, true, [], {}])(
        `rejects non-count body %j for ${route.label}`,
        (body) => {
          expect(compileResponse(operation)(body)).toBe(false);
        },
      );

      it.each(["normal", "last", "empty"] as const)(
        `keeps the %s page valid for ${route.label}`,
        (kind) => {
          expect(compileResponse(operation)(collectionPageBodies[kind])).toBe(
            true,
          );
        },
      );

      it(`rejects malformed pages without widening the ${route.label} page branch`, () => {
        const validate = compileResponse(operation);
        const page = collectionPageBodies.normal;
        for (const body of [
          { ...page, start: "0" },
          { ...page, entries: null },
          { ...page, entries: [{}] },
          {
            ...page,
            entries: [{ self_link: 1, source_package_name: "hello" }],
          },
          { ...page, total_size: "3" },
          { ...page, next_collection_link: "not a URI" },
          { entries: [] },
        ]) {
          expect(validate(body), JSON.stringify(body)).toBe(false);
        }
      });
    }
  });

  describe("framework query primitive domains", () => {
    it.each(["ws.start", "ws.size"])(
      "accepts unbounded integer primitives for %s",
      (name) => {
        const parameter = expectOptionalControl(
          findOperation("archive-getPublishedSources-distribution"),
          name,
          "integer",
        );
        const validate = ajv.compile(parameter.schema ?? {});
        for (const value of [-100, -1, 0, 1, 1000000]) {
          expect(validate(value), `${name}=${value}`).toBe(true);
        }
        for (const value of ["1", "-1", 1.5, null, true, [], {}]) {
          expect(validate(value), `${name}=${JSON.stringify(value)}`).toBe(
            false,
          );
        }
      },
    );

    it.each([
      { name: "memo", values: ["", "2", "opaque cursor /+=="] },
      { name: "direction", values: ["", "backwards", "forwards", "unknown"] },
      { name: "ws.show", values: ["", "total_size", "TOTAL_SIZE", "other"] },
    ])(
      "keeps $name an unrestricted string rather than a guessed enum",
      ({ name, values }) => {
        const parameter = expectOptionalControl(
          findOperation("archive-getPublishedSources-distribution"),
          name,
          "string",
        );
        const validate = ajv.compile(parameter.schema ?? {});
        for (const value of values) expect(validate(value)).toBe(true);
        for (const value of [1, false, null, [], {}])
          expect(validate(value)).toBe(false);
      },
    );
  });

  describe("standard collections and declaration precedence", () => {
    it("adds paging but neither ws.show nor scalar counts to the standard processors route", () => {
      const operation = findOperation("processors-get");
      expect(document.paths["/+processors"]?.get?.operationId).toBe(
        "processors-get",
      );
      expect(
        getQueryParameters(operation).map((parameter) => parameter.name),
      ).toEqual(pagingControls.map(([name]) => name));
      for (const [name, type] of pagingControls)
        expectOptionalControl(operation, name, type);
      expect(getResponseSchema(operation)).toEqual({
        $ref: "#/components/schemas/processor-page",
      });
      const validate = compileResponse(operation);
      expect(validate(collectionPageBodies.standard)).toBe(true);
      expect(validate(collectionPageBodies.empty)).toBe(true);
      for (const body of [0, 3, "3", null]) expect(validate(body)).toBe(false);
    });

    it("preserves standard WADL query declarations and required flags while filling missing paging controls", () => {
      const operation = findOperation("people-get");
      expect(
        getQueryParameters(operation).map((parameter) => parameter.name),
      ).toEqual([
        "ws.start",
        "filter",
        "ws.show",
        "ws.size",
        "memo",
        "direction",
      ]);
      expect(getQueryParameter(operation, "ws.start")).toMatchObject({
        required: true,
        schema: { type: "string", example: "ws.start" },
      });
      expect(getQueryParameter(operation, "filter")).toMatchObject({
        required: true,
        schema: { type: "boolean", example: true },
      });
      expectOptionalControl(operation, "ws.show", "string");
      for (const [name, type] of pagingControls.slice(1))
        expectOptionalControl(operation, name, type);
      expect(getResponseSchema(operation, "206")).toEqual({
        $ref: "#/components/schemas/processor-page",
      });
      expect(compileResponse(operation, "206")(0)).toBe(false);
    });

    it("does not replace or double explicitly declared named controls", () => {
      const operation = findOperation("archive-declaredControls-distribution");
      expect(getQueryParameters(operation)).toEqual([
        {
          name: "ws.start",
          in: "query",
          required: true,
          description: undefined,
          schema: { type: "string", example: "ws.start" },
        },
        {
          name: "ws.size",
          in: "query",
          required: false,
          description: undefined,
          schema: { type: "boolean" },
        },
        {
          name: "memo",
          in: "query",
          required: true,
          description: undefined,
          schema: { type: "integer", example: 1 },
        },
        {
          name: "direction",
          in: "query",
          required: true,
          description: undefined,
          schema: {
            type: "string",
            enum: ["backwards", "forwards"],
            example: "backwards",
          },
        },
        {
          name: "ws.show",
          in: "query",
          required: true,
          description: undefined,
          schema: { type: "boolean", example: true },
        },
        {
          name: "ws.accept",
          in: "query",
          required: false,
          description: undefined,
          schema: { type: "string" },
        },
      ]);
      expectCountUnion(operation, ["processor-page"]);
    });

    it("distinguishes ws.start/ws.size from unrelated start/size query names", () => {
      const operation = findOperation("archive-partialControls-distribution");
      expect(
        getQueryParameters(operation).map((parameter) => parameter.name),
      ).toEqual([
        "ws.start",
        "start",
        "size",
        "ws.size",
        "memo",
        "direction",
        "ws.show",
      ]);
      expect(getQueryParameter(operation, "ws.start")).toMatchObject({
        required: true,
        schema: { type: "string" },
      });
      expectOptionalControl(operation, "start", "integer");
      expectOptionalControl(operation, "size", "integer");
      expectOptionalControl(operation, "ws.size", "integer");
    });

    it("keeps a same-named path selector distinct from the framework query control", () => {
      // No production route has a ws.size path selector; exercise this builder boundary
      // with actual parsed methods and the pipeline's generated component schemas.
      const model = parseWadl(collectionControlsWadl).unwrap();
      const schemas = buildSchemas(model.representations);
      expect(document.components?.schemas).toEqual(schemas);
      const standardMethod = model.resourceTypes.processors?.methods[0];
      const namedMethod = model.resourceTypes.archive?.methods.find(
        (method) => method.wsOp === "getPublishedSources",
      );
      assert(standardMethod !== undefined && namedMethod !== undefined);
      const pathParameter: ParameterObject = {
        name: "ws.size",
        in: "path",
        required: true,
        schema: { type: "string" },
      };
      const operations = [
        buildStandardOperation({
          method: standardMethod,
          verb: "get",
          resourceTypeId: "processors",
          pathParams: [pathParameter],
          schemas,
        }),
        buildNamedOperation({
          method: namedMethod,
          wsOp: "getPublishedSources",
          resourceTypeId: "archive",
          pathParams: [pathParameter],
          schemas,
        }),
      ];
      for (const operation of operations) {
        expect(operation.parameters).toContainEqual(pathParameter);
        expectOptionalControl(operation, "ws.size", "integer");
        expect(
          operation.parameters?.filter(
            (parameter) => "name" in parameter && parameter.name === "ws.size",
          ),
        ).toHaveLength(2);
      }
    });
  });

  describe("response status, media and identity boundaries", () => {
    it("preserves multiple page refs and existing alternatives for explicit successful JSON responses", () => {
      const operation = findOperation("archive-mixedResponses-distribution");
      for (const [name, type] of pagingControls)
        expectOptionalControl(operation, name, type);
      expectOptionalControl(operation, "ws.show", "string");
      expectCountUnion(operation, [
        "source_package_publishing_history-page",
        "processor-page",
        "archive-full",
      ]);
      const validate = compileResponse(operation);
      for (const body of [
        0,
        3,
        collectionPageBodies.normal,
        collectionPageBodies.standard,
        { name: "primary" },
      ]) {
        expect(validate(body), JSON.stringify(body)).toBe(true);
      }
      for (const body of [-1, 1.5, "3", null])
        expect(validate(body)).toBe(false);
      const vendorMedia = "application/vnd.launchpad+json; charset=UTF-8";
      expectCountUnion(operation, ["processor-page"], "200", vendorMedia);
      expect(compileResponse(operation, "200", vendorMedia)(0)).toBe(true);
      expect(operation.responses["200"]?.content?.["text/csv"]).toEqual({});

      // Framework count encoding always sets 200; explicit other statuses bypass it.
      expect(getResponseSchema(operation, "206")).toEqual({
        anyOf: [
          {
            $ref: "#/components/schemas/source_package_publishing_history-page",
          },
          { $ref: "#/components/schemas/processor-page" },
          { $ref: "#/components/schemas/archive-full" },
        ],
      });
      for (const body of [0, 3])
        expect(compileResponse(operation, "206")(body)).toBe(false);
      expect(getResponseSchema(operation, "206", vendorMedia)).toEqual({
        $ref: "#/components/schemas/processor-page",
      });
      expect(compileResponse(operation, "206", vendorMedia)(0)).toBe(false);
      expect(operation.responses["206"]?.content?.["text/csv"]).toEqual({});
      expect(getResponseSchema(operation, "201")).toEqual({
        $ref: "#/components/schemas/archive-full",
      });
      expect(compileResponse(operation, "201")(3)).toBe(false);
      expect(getResponseSchema(operation, "400")).toEqual({
        $ref: "#/components/schemas/processor-page",
      });
      expect(compileResponse(operation, "400")(3)).toBe(false);
    });

    it.each([
      "failureOnly",
      "nonJsonOnly",
      "statuslessNonJson",
      "unresolved",
      "explicitUnresolved",
      "rawArray",
      "untyped",
      "singleEntry",
      "nonGet",
    ])(
      "does not enrich %s based on names, prose, dangling refs, errors or non-JSON bodies",
      (name) => {
        const operation = findOperation(`archive-${name}-distribution`);
        expect(getQueryParameters(operation)).toEqual([]);
        for (const response of Object.values(operation.responses)) {
          assert(!("$ref" in response));
          const content: ContentObject = response.content ?? {};
          for (const media of Object.values(content)) {
            if (media.schema !== undefined) {
              expect(
                collectAlternatives(media.schema).filter(
                  (schema) => !("$ref" in schema) && schema.type === "integer",
                ),
              ).toEqual([]);
            }
          }
        }
        if (name === "rawArray")
          expect(getResponseSchema(operation)).toEqual({
            type: "array",
            items: { type: "string", format: "uri" },
          });
        if (name === "singleEntry")
          expect(getResponseSchema(operation)).toEqual({
            $ref: "#/components/schemas/archive-full",
          });
        if (name === "nonGet")
          expect(getResponseSchema(operation)).toEqual({
            $ref: "#/components/schemas/processor-page",
          });
      },
    );

    it("does not infer paging for a standard operation with only failure page responses", () => {
      const operation = findOperation("project-get");
      expect(getQueryParameters(operation)).toEqual([]);
      expect(getResponseSchema(operation, "404")).toEqual({
        $ref: "#/components/schemas/processor-page",
      });
    });

    it("leaves publication URL lists and metadata response alternatives unchanged", () => {
      const publications = convertWadl(publicationFileResponsesWadl);
      for (const path of Object.values(publications.paths)) {
        const operation = path?.get;
        if (operation === undefined) continue;
        expect(
          getQueryParameters(operation).map((parameter) => parameter.name),
        ).toEqual(
          operation.operationId?.startsWith("person-") ||
            /^(binary_package_publishing_history-binaryFileUrls|source_package_publishing_history-sourceFileUrls)-/.test(
              operation.operationId ?? "",
            )
            ? ["include_meta"]
            : [],
        );
        const schema = getResponseSchema(operation);
        expect(
          collectAlternatives(schema).every(
            (alternative) =>
              !("$ref" in alternative) && alternative.type === "array",
          ),
        ).toBe(true);
      }
    });

    it("never broadens shared page components to scalar counts", () => {
      for (const [id, entryId] of [
        [
          "source_package_publishing_history-page",
          "source_package_publishing_history-full",
        ],
        ["processor-page", "processor-full"],
      ]) {
        const schema = document.components?.schemas?.[id ?? ""];
        expect(schema).toEqual({
          type: "object",
          required: ["start", "entries"],
          properties: {
            start: { type: "integer", example: 1 },
            entries: {
              type: "array",
              items: { $ref: `#/components/schemas/${entryId}` },
              example: [],
            },
            total_size: { type: "integer" },
            total_size_link: { type: "string", format: "uri" },
            next_collection_link: { type: "string", format: "uri" },
            prev_collection_link: { type: "string", format: "uri" },
          },
        });
        assert(schema !== undefined);
        const validate = ajv.compile({
          ...schema,
          components: document.components,
        });
        expect(validate(collectionPageBodies.empty)).toBe(true);
        for (const body of [0, 3, null]) expect(validate(body)).toBe(false);
      }
    });

    it("produces a complete valid OpenAPI 3.0.3 document", async () => {
      // Parser validation dereferences/mutates input; do not alter the document used above.
      const validated = await SwaggerParser.validate(
        JSON.parse(JSON.stringify(document)),
      );
      expect(validated).toMatchObject({ openapi: "3.0.3" });
    });
  });
});
