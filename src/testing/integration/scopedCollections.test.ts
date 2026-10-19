/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import SwaggerParser from "@apidevtools/swagger-parser";
import { Result } from "better-result";
import type {
  OpenAPIObject,
  PathItemObject,
  SchemaObject,
} from "openapi3-ts/oas30";
import { assert, describe, expect, it } from "vitest";
import { scopedCollectionsWadl } from "../../../testing/fixtures.js";
import { generateOpenApi } from "../../openapi/index.js";
import { parseWadl } from "../../wadl/index.js";

const serviceRootLinks = {
  me_link: "https://api.launchpad.test/devel/people/+me",
};

function convertWadl(wadl = scopedCollectionsWadl): OpenAPIObject {
  return generateOpenApi(parseWadl(wadl).unwrap(), {
    serviceRootLinks,
  }).unwrap();
}

const document = convertWadl();

// Same-shape templates remain observable through the converter's public extension.
function collectRoutes(generated = document) {
  return Object.entries(generated.paths).flatMap(([path, item]) => {
    const alternatives = item["x-launchpad-route-alternatives"] as
      | { path: string; item: PathItemObject }[]
      | undefined;
    return [{ path, item }, ...(alternatives ?? [])];
  });
}

function getOperation(path: string, generated = document) {
  const matches = collectRoutes(generated).filter(
    (route) => route.path === path,
  );
  expect(matches, `Source route ${path}`).toHaveLength(1);
  const operation = matches[0]?.item.get;
  assert(operation !== undefined, `Missing scoped GET ${path}`);
  return operation;
}

function getSchema(id: string): SchemaObject {
  const schema = document.components?.schemas?.[id];
  assert(schema !== undefined && !("$ref" in schema), `Missing schema ${id}`);
  return schema;
}

describe("scoped collection GET routes", () => {
  it("composes full collection fields with canonical and runtime alias parents", () => {
    // CollectionFieldMarshaller appends _collection_link on the wire, but
    // unmarshall traverses absoluteURL(entry.context)/field.__name__.
    for (const [path, subject, namespace] of [
      ["/{distribution}/series", "distribution", ["series"]],
      ["/{person}/members", "person", ["members"]],
      ["/people/+me/members", "person", ["me", "members"]],
    ] as const) {
      const operation = collectRoutes().find((route) => route.path === path)
        ?.item.get;
      expect.soft(operation, path).toMatchObject({
        operationId: [subject, ...namespace, "get"].join("."),
        "x-launchpad-naming-path": { subject, namespace, operation: "get" },
      });
    }
    expect(getOperation("/{person}").operationId).toBe("person.get");
    expect(getOperation("/people/+me").operationId).toBe("person.me.get");
  });

  it("uses the page method's operation after stripping its own resource prefix", () => {
    const generated = convertWadl(
      scopedCollectionsWadl.replace(
        'id="distro_series-page-resource-get"',
        'id="distro_series-page-resource-read_page"',
      ),
    );
    expect(getOperation("/{distribution}/series", generated)).toMatchObject({
      operationId: "distribution.series.readPage",
      "x-launchpad-naming-path": {
        subject: "distribution",
        namespace: ["series"],
        operation: "readPage",
      },
    });
  });

  it("uses the declared HTTP verb when the page method has no ID", () => {
    const generated = convertWadl(
      scopedCollectionsWadl.replace(
        'name="GET" id="distro_series-page-resource-get"',
        'name="GET"',
      ),
    );
    expect(getOperation("/{distribution}/series", generated).operationId).toBe(
      "distribution.series.get",
    );
  });

  it("retains the original page response and standard paging controls, without the named count switch", () => {
    for (const [path, page] of [
      ["/{distribution}/series", "distro_series-page"],
      ["/people/+me/members", "person-page"],
    ] as const) {
      const operation = getOperation(path);
      expect(
        operation.responses["200"]?.content?.["application/json"]?.schema,
      ).toEqual({ $ref: `#/components/schemas/${page}` });
      const query = operation.parameters?.filter(
        (parameter) => "in" in parameter && parameter.in === "query",
      );
      expect(query).toEqual(
        [
          ["ws.start", "integer"],
          ["ws.size", "integer"],
          ["memo", "string"],
          ["direction", "string"],
        ].map(([name, type]) =>
          expect.objectContaining({
            name,
            in: "query",
            required: false,
            schema: { type },
          }),
        ),
      );
      expect(JSON.stringify(operation.responses)).not.toContain("total_size");
    }
    expect(getSchema("distro_series-page")).toMatchObject({
      type: "object",
      required: ["start", "entries"],
      properties: {
        entries: {
          type: "array",
          items: { $ref: "#/components/schemas/distro_series-full" },
        },
      },
    });
  });

  it("inherits ordered parent namespaces, path parameters and traversal query selectors on every route", () => {
    const parents = collectRoutes().filter(
      (route) =>
        route.path.endsWith("/{user}") &&
        route.item.get?.tags?.includes("archive_permission"),
    );
    expect(parents).toHaveLength(4);
    for (const parent of parents) {
      const operation = getOperation(`${parent.path}/members`);
      const naming = parent.item.get?.["x-launchpad-naming-path"];
      expect(operation).toMatchObject({
        operationId: `archivePermission.${naming.namespace.join(".")}.members.get`,
        "x-launchpad-naming-path": {
          subject: "archivePermission",
          namespace: [...naming.namespace, "members"],
          operation: "get",
        },
      });
      // Includes required type/item and optional series selectors as well as
      // all template parameters, with their original domains and examples.
      expect(operation.parameters).toEqual(
        expect.arrayContaining(parent.item.get?.parameters ?? []),
      );
      expect(
        operation.parameters?.filter(
          (parameter) =>
            "in" in parameter &&
            parameter.in === "query" &&
            ["type", "item", "series"].includes(parameter.name),
        ),
      ).toEqual(
        parent.item.get?.parameters?.filter(
          (parameter) => "in" in parameter && parameter.in === "query",
        ),
      );
    }
  });

  it("preserves colliding team templates and their scoped GETs as route alternatives", () => {
    expect(getOperation("/{team}").operationId).toBe("team.get");
    expect(getOperation("/{team}/members")).toMatchObject({
      operationId: "team.members.get",
      "x-launchpad-naming-path": {
        subject: "team",
        namespace: ["members"],
        operation: "get",
      },
    });
    // Differently named templates of the same shape cannot both be OAS paths.
    expect(document.paths["/{person}/members"]?.get?.operationId).toBe(
      "person.members.get",
    );
    expect(document.paths).not.toHaveProperty("/{team}/members");
  });

  it("does not invent routes from input, pagination, nested, unresolved or unrelated fields", () => {
    const routes = collectRoutes();
    for (const field of [
      "diff_only",
      "write_only",
      "next",
      "prev",
      "nested",
      "owner",
      "missing",
      "entry",
      "no_get",
      "plain",
    ]) {
      expect(
        routes.filter((route) => route.path.endsWith(`/${field}`)),
        field,
      ).toEqual([]);
    }
    expect(routes.some((route) => route.path.includes("{unknown}"))).toBe(
      false,
    );
    expect(routes.some((route) => route.path.includes("-page-resource"))).toBe(
      false,
    );
    expect(document["x-launchpad-route-coverage"]).toMatchObject({
      unresolved: expect.arrayContaining(["unknown"]),
    });
  });

  it("reports unsupported collection names with their route and WADL provenance", () => {
    const wadl = scopedCollectionsWadl.replaceAll(
      "series_collection_link",
      "series.details_collection_link",
    );
    const result = generateOpenApi(parseWadl(wadl).unwrap());
    assert(Result.isError(result), "Expected an unsupported collection name");
    expect(result.error._tag).toBe("ConversionError");
    for (const origin of [
      "/{distribution}/series.details",
      "series.details_collection_link",
      "distro_series-page-resource-get",
    ]) {
      expect(result.error.message).toContain(origin);
    }
  });

  it("rejects normalized collection naming collisions rather than suffixing or dropping routes", () => {
    const wadl = scopedCollectionsWadl.replace(
      '<wadl:param name="series_collection_link" path="$[\'series_collection_link\']">',
      `<wadl:param name="release_list_collection_link" path="$['release_list_collection_link']">
        <wadl:link resource_type="#distro_series-page-resource"/>
      </wadl:param>
      <wadl:param name="release-list_collection_link" path="$['release-list_collection_link']">`,
    );
    const result = generateOpenApi(parseWadl(wadl).unwrap());
    assert(
      Result.isError(result),
      "Expected a scoped collection naming collision",
    );
    expect(result.error._tag).toBe("ConversionError");
    for (const origin of [
      "distribution.releaseList.get",
      "/{distribution}/release_list",
      "/{distribution}/release-list",
      "distro_series-page-resource-get",
    ]) {
      expect(result.error.message).toContain(origin);
    }
  });

  it("produces a valid OpenAPI 3.0.3 document while preserving route alternatives", async () => {
    // SwaggerParser dereferences its input; keep the original for route checks.
    const validated = await SwaggerParser.validate(
      JSON.parse(JSON.stringify(document)),
    );
    expect(validated).toMatchObject({ openapi: "3.0.3" });
  });
});

describe("required nullable distro series responses", () => {
  it("allows model-backed nulls only in full responses without weakening required presence or input domains", () => {
    // Storm DistroSeries.changeslist and datereleased allow_none=True, even
    // though their exported interface fields require non-null input values.
    for (const name of ["changeslist", "datereleased"]) {
      const expected = {
        type: "string",
        ...(name === "datereleased" ? { format: "date-time" } : {}),
      };
      const full = getSchema("distro_series-full");
      expect
        .soft(full.properties?.[name], `${name} response domain`)
        .toMatchObject({
          ...expected,
          nullable: true,
        });
      for (const kind of ["diff", "write"]) {
        const schema = getSchema(`distro_series-${kind}`);
        expect(schema.properties?.[name]).toMatchObject(expected);
        expect(schema.properties?.[name]).not.toHaveProperty("nullable", true);
      }
    }
    for (const kind of ["full", "diff", "write"]) {
      expect(getSchema(`distro_series-${kind}`).required ?? []).toEqual(
        kind === "diff" ? [] : ["changeslist", "datereleased"],
      );
    }
  });
});
