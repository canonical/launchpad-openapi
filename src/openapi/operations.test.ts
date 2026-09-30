/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import type { ParameterObject } from "openapi3-ts/oas30";
import { assert, describe, expect, it } from "vitest";
import {
  branchLookupWadl,
  generatorEdgeWadl,
  sampleWadl,
} from "../../testing/fixtures.js";
import { parseWadl, type WadlMethod } from "../wadl/index.js";
import { buildNamedOperation, buildStandardOperation } from "./operations.js";
import buildSchemas from "./buildSchemas.js";

function findMethod(methods: WadlMethod[], wsOp: string): WadlMethod {
  const method = methods.find((candidate) => candidate.wsOp === wsOp);
  assert(method !== undefined);
  return method;
}

function branchOperation(
  wadl: string,
  wsOp: string,
  resourceTypeId = "branches",
) {
  const model = parseWadl(wadl).unwrap();
  const schemas = buildSchemas(model.representations);
  const method = findMethod(
    model.resourceTypes[resourceTypeId]?.methods ?? [],
    wsOp,
  );
  return {
    schemas,
    operation: buildNamedOperation({
      method,
      wsOp,
      resourceTypeId,
      pathParams: [],
      schemas,
    }),
  };
}

describe("buildStandardOperation", () => {
  describe("read operations", () => {
    it("distinguishes collection lists from entry reads", () => {
      const sample = parseWadl(sampleWadl).unwrap();
      const edge = parseWadl(generatorEdgeWadl).unwrap();
      const schemas = {
        ...buildSchemas(sample.representations),
        ...buildSchemas(edge.representations),
      };
      const peopleGet = sample.resourceTypes.people?.methods[0];
      const bugGet = edge.resourceTypes.bug?.methods[0];
      assert(peopleGet !== undefined);
      assert(bugGet !== undefined);

      expect(
        buildStandardOperation({
          method: peopleGet,
          verb: "get",
          resourceTypeId: "people",
          resourceTypeDoc: "Collection of people.",
          pathParams: [],
          schemas,
        }),
      ).toEqual({
        tags: ["people"],
        summary: "List people",
        description: "Collection of people.",
        operationId: "people-get",
        responses: {
          "200": {
            description: "Successful response",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/person-page" },
              },
            },
          },
        },
      });
      expect(
        buildStandardOperation({
          method: bugGet,
          verb: "get",
          resourceTypeId: "bug",
          pathParams: [],
          schemas,
        }),
      ).toMatchObject({
        summary: "Get bug",
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/edge-full" },
              },
            },
          },
        },
      });
    });
  });

  describe("write operations", () => {
    it("builds replace and update request bodies", () => {
      const model = parseWadl(sampleWadl).unwrap();
      const schemas = buildSchemas(model.representations);
      const put = model.resourceTypes.person?.methods[1];
      const patch = model.resourceTypes.person?.methods[2];
      assert(put !== undefined);
      assert(patch !== undefined);
      const pathParams: ParameterObject[] = [
        {
          name: "person",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ];

      expect(
        buildStandardOperation({
          method: put,
          verb: "put",
          resourceTypeId: "person",
          resourceTypeDoc: "A person.",
          pathParams,
          schemas,
        }),
      ).toMatchObject({
        summary: "Replace person",
        parameters: pathParams,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/person-full" },
            },
          },
        },
      });
      expect(
        buildStandardOperation({
          method: patch,
          verb: "patch",
          resourceTypeId: "person",
          pathParams: [],
          schemas,
        }),
      ).toMatchObject({
        summary: "Update person",
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/person-diff" },
            },
          },
        },
      });
    });

    it("builds deletion and unresolved body-less responses", () => {
      const sample = parseWadl(sampleWadl).unwrap();
      const edge = parseWadl(generatorEdgeWadl).unwrap();
      const schemas = buildSchemas(edge.representations);
      const deletion = sample.resourceTypes.person?.methods[3];
      const unresolvedPut = edge.resourceTypes.bug?.methods[1];
      assert(deletion !== undefined);
      assert(unresolvedPut !== undefined);

      expect(
        buildStandardOperation({
          method: deletion,
          verb: "delete",
          resourceTypeId: "person",
          pathParams: [],
          schemas,
        }),
      ).toEqual({
        tags: ["person"],
        summary: "Delete person",
        operationId: "person-delete",
        responses: { "200": { description: "Resource deleted." } },
      });
      const unresolved = buildStandardOperation({
        method: unresolvedPut,
        verb: "put",
        resourceTypeId: "bug",
        pathParams: [],
        schemas,
      });
      expect(unresolved).not.toHaveProperty("requestBody");
      expect(unresolved.responses["200"]).toEqual({
        description: "Successful response",
      });
    });
  });
});

describe("buildNamedOperation", () => {
  describe("query operations", () => {
    it("builds documented query parameters and represented responses", () => {
      const model = parseWadl(sampleWadl).unwrap();
      const method = findMethod(
        model.resourceTypes.people?.methods ?? [],
        "getByName",
      );
      const operation = buildNamedOperation({
        method,
        wsOp: "getByName",
        resourceTypeId: "people",
        pathParams: [],
        schemas: buildSchemas(model.representations),
      });

      expect(operation).toMatchObject({
        tags: ["people"],
        summary: "Get by name",
        description: "Find a person by name. :return: a string URL",
        operationId: "people-getByName",
        parameters: [
          {
            name: "name",
            in: "query",
            required: true,
            description: "The person name.",
            schema: { type: "string", example: "ubuntu" },
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/person-full" },
              },
            },
          },
        },
      });
    });

    it("maps parameter schema kinds and type-appropriate examples", () => {
      const model = parseWadl(generatorEdgeWadl).unwrap();
      const method = findMethod(
        model.resourceTypes.bug?.methods ?? [],
        "isActive",
      );
      const pathParam: ParameterObject = {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string" },
      };
      const operation = buildNamedOperation({
        method,
        wsOp: "isActive",
        resourceTypeId: "bug",
        pathParams: [pathParam],
        schemas: buildSchemas(model.representations),
      });

      expect(operation.operationId).toBe("bug-isActive");
      expect(operation.parameters).toEqual([
        pathParam,
        {
          name: "policy",
          in: "query",
          required: true,
          schema: { type: "string", enum: ["Open", "Closed"], example: "Open" },
        },
        {
          name: "start",
          in: "query",
          required: true,
          schema: { type: "integer", example: 1 },
        },
        {
          name: "entries",
          in: "query",
          required: true,
          schema: { type: "array", items: { type: "object" }, example: [] },
        },
        {
          name: "target",
          in: "query",
          required: true,
          schema: {
            type: "string",
            format: "uri",
            "x-lp-resource-type": "bug",
          },
        },
        {
          name: "note",
          in: "query",
          required: false,
          schema: { type: "string" },
        },
      ]);
      expect(operation.responses["200"]).toEqual({
        description: "True if active",
        content: {
          "application/json": {
            schema: { type: "boolean", nullable: true },
          },
        },
      });
    });

    it("keeps WADL item type and optionality for branch URL lists", () => {
      const wadl = branchLookupWadl.replace(
        'name="urls" type="xsd:string" required="true"',
        'name="urls" type="xsd:int"',
      );
      const model = parseWadl(wadl).unwrap();
      const method = findMethod(
        model.resourceTypes.branches?.methods ?? [],
        "getByUrls",
      );
      const operation = buildNamedOperation({
        method,
        wsOp: "getByUrls",
        resourceTypeId: "branches",
        pathParams: [],
        schemas: buildSchemas(model.representations),
      });

      expect(operation.parameters).toMatchObject([
        {
          name: "urls",
          in: "query",
          required: false,
          style: "form",
          explode: true,
          schema: { type: "array", items: { type: "integer" } },
        },
      ]);
    });

    it("keeps the required URL-list example an array", () => {
      const { operation } = branchOperation(branchLookupWadl, "getByUrls");
      expect(operation.parameters).toMatchObject([
        {
          name: "urls",
          in: "query",
          required: true,
          style: "form",
          explode: true,
          schema: {
            type: "array",
            items: { type: "string" },
            example: [],
          },
        },
      ]);
    });

    it("does not add serialization fields to unrelated WADL repetitions", () => {
      const wadl = branchLookupWadl
        .replace('id="branches-getByUrls"', 'id="other-getByUrls"')
        .replace(
          'name="urls" type="xsd:string" required="true"',
          'name="urls" type="xsd:string" required="true" repeating="true"',
        );
      const { operation } = branchOperation(wadl, "getByUrls");
      expect(operation.parameters).toMatchObject([
        {
          name: "urls",
          in: "query",
          required: true,
          schema: { type: "array", items: { type: "string" }, example: [] },
        },
      ]);
      expect(operation.parameters?.[0]).not.toHaveProperty("style");
      expect(operation.parameters?.[0]).not.toHaveProperty("explode");
    });

    it("limits nullable branch responses to the reviewed WADL method", () => {
      const { operation, schemas } = branchOperation(
        branchLookupWadl,
        "getByPath",
      );
      const branch = schemas["branch-full"];
      assert(branch !== undefined && !("$ref" in branch));
      expect(operation.responses["200"]).toEqual({
        description: "Successful response",
        content: {
          "application/json": { schema: { ...branch, nullable: true } },
        },
      });
      expect(branch.nullable).not.toBe(true);
      expect(
        branchOperation(branchLookupWadl, "getFeatured").operation.responses[
          "200"
        ],
      ).toMatchObject({
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/branch-full" },
          },
        },
      });
      expect(
        branchOperation(branchLookupWadl, "getByPath", "projects").operation
          .responses["200"],
      ).toMatchObject({
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/project-full" },
          },
        },
      });

      const otherId = branchLookupWadl.replace(
        'id="branches-getByPath"',
        'id="other-getByPath"',
      );
      expect(
        branchOperation(otherId, "getByPath").operation.responses["200"],
      ).toMatchObject({
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/branch-full" },
          },
        },
      });
    });

    it("types the reviewed URL mapping without typing opaque responses", () => {
      const { operation, schemas } = branchOperation(
        branchLookupWadl,
        "getByUrls",
      );
      const branch = schemas["branch-full"];
      assert(branch !== undefined && !("$ref" in branch));
      expect(operation.responses["200"]).toMatchObject({
        content: {
          "application/json": {
            schema: {
              type: "object",
              additionalProperties: { ...branch, nullable: true },
            },
          },
        },
      });
      expect(
        branchOperation(branchLookupWadl, "getOpaque").operation.responses[
          "200"
        ],
      ).not.toHaveProperty("content");
    });

    it("retains a declared response instead of replacing it with a reviewed map", () => {
      const wadl = branchLookupWadl.replace(
        '    </wadl:method>\n    <wadl:method name="GET" id="branches-getFeatured">',
        '      <wadl:response><wadl:representation href="#project-full"/></wadl:response>\n    </wadl:method>\n    <wadl:method name="GET" id="branches-getFeatured">',
      );
      expect(
        branchOperation(wadl, "getByUrls").operation.responses["200"],
      ).toMatchObject({
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/project-full" },
          },
        },
      });
    });
  });

  describe("form operations", () => {
    it("builds a required form body with enum properties", () => {
      const model = parseWadl(sampleWadl).unwrap();
      const method = findMethod(
        model.resourceTypes.people?.methods ?? [],
        "newTeam",
      );
      const operation = buildNamedOperation({
        method,
        wsOp: "newTeam",
        resourceTypeId: "people",
        pathParams: [],
        schemas: buildSchemas(model.representations),
      });

      expect(operation.requestBody).toEqual({
        required: true,
        content: {
          "application/x-www-form-urlencoded": {
            schema: {
              type: "object",
              properties: {
                display_name: {
                  type: "string",
                  description: "Display name.",
                  example: "display_name",
                },
                subscription_policy: {
                  type: "string",
                  enum: ["Open", "Moderated"],
                  description: "Membership policy.",
                },
              },
              required: ["display_name"],
            },
          },
        },
      });
    });

    it("omits empty forms and marks optional-only forms optional", () => {
      const model = parseWadl(generatorEdgeWadl).unwrap();
      const methods = model.resourceTypes.bug?.methods ?? [];
      const empty = buildNamedOperation({
        method: findMethod(methods, "emptyForm"),
        wsOp: "emptyForm",
        resourceTypeId: "bug",
        pathParams: [],
        schemas: {},
      });
      const optional = buildNamedOperation({
        method: findMethod(methods, "optionalForm"),
        wsOp: "optionalForm",
        resourceTypeId: "bug",
        pathParams: [],
        schemas: {},
      });

      expect(empty.requestBody).toBeUndefined();
      expect(optional.requestBody).toEqual({
        content: {
          "application/x-www-form-urlencoded": {
            schema: {
              type: "object",
              properties: { comment: { type: "string" } },
            },
          },
        },
      });
    });
  });

  describe("inferred responses", () => {
    it("infers URI strings, plain strings, collections, and unknown schemas", () => {
      const sample = parseWadl(sampleWadl).unwrap();
      const edge = parseWadl(generatorEdgeWadl).unwrap();
      const edgeMethods = edge.resourceTypes.bug?.methods ?? [];
      const uriMethod = findMethod(
        sample.resourceTypes.person?.methods ?? [],
        "getMembers",
      );
      const cases = [
        [
          uriMethod,
          "getMembers",
          { type: "array", items: { type: "string", format: "uri" } },
        ],
        [
          findMethod(edgeMethods, "getText"),
          "getText",
          { type: "string", nullable: true },
        ],
        [findMethod(edgeMethods, "getUnknown"), "getUnknown", undefined],
        [findMethod(edgeMethods, "undocumented"), "undocumented", undefined],
      ] as const;

      for (const [method, wsOp, schema] of cases) {
        const operation = buildNamedOperation({
          method,
          wsOp,
          resourceTypeId: "bug",
          pathParams: [],
          schemas: {},
        });
        expect(
          operation.responses["200"]?.content?.["application/json"]?.schema,
        ).toEqual(schema);
      }
      expect(
        buildNamedOperation({
          method: uriMethod,
          wsOp: "getMembers",
          resourceTypeId: "person",
          pathParams: [],
          schemas: {},
        }).responses["200"],
      ).toMatchObject({
        description: "collection of URLs",
      });
    });
  });
});
