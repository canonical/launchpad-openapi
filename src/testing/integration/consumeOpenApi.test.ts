/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import SwaggerParser from "@apidevtools/swagger-parser";
import { Result } from "better-result";
import { afterEach, assert, describe, expect, it } from "vitest";
import {
  branchLookupWadl,
  observedBranchLookup,
  responseStatusWadl,
  sampleWadl,
} from "../../../testing/fixtures.js";
import { runCli } from "../../cli/index.js";
import { generateOpenApi } from "../../openapi/index.js";
import { parseWadl } from "../../wadl/index.js";

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryPaths.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

describe("generated OpenAPI consumption", () => {
  it("generates a document accepted by an OpenAPI parser", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "launchpad-openapi-consumer-"),
    );
    temporaryPaths.push(directory);
    const input = join(directory, "input.wadl");
    const output = join(directory, "openapi.yaml");
    await writeFile(input, sampleWadl, "utf8");

    const conversion = await runCli([
      "--input",
      input,
      "--output",
      output,
      "--version",
      "consumer-test",
    ]);

    assert(Result.isOk(conversion));
    const document = await SwaggerParser.validate(output);
    assert("openapi" in document);
    expect(document.openapi).toBe("3.0.3");
    expect(document.info.version).toBe("consumer-test");
    expect(Object.keys(document.paths ?? {})).toHaveLength(6);
  });
});

describe("generated branch lookup contracts", () => {
  const document = generateOpenApi(
    parseWadl(branchLookupWadl).unwrap(),
  ).unwrap();
  const schemas = document.components?.schemas;
  const branch = schemas?.["branch-full"];
  const byPath =
    document.paths["/branches?ws.op=getByPath"]?.get?.responses["200"]
      ?.content?.["application/json"]?.schema;
  const byUrls = document.paths["/branches?ws.op=getByUrls"]?.get;
  const featured =
    document.paths["/branches?ws.op=getFeatured"]?.get?.responses["200"]
      ?.content?.["application/json"]?.schema;
  const unrelatedPath =
    document.paths["/projects?ws.op=getByPath"]?.get?.responses["200"]
      ?.content?.["application/json"]?.schema;

  it("limits null branch responses to getByPath without weakening branch-full", () => {
    assert(
      schemas !== undefined && branch !== undefined && !("$ref" in branch),
    );
    assert(byPath !== undefined && "$ref" in byPath);
    const nullableBranch =
      schemas[byPath.$ref.replace("#/components/schemas/", "")];
    assert(
      nullableBranch !== undefined && !("$ref" in nullableBranch),
      "getByPath must reference an existing nullable branch representation",
    );

    expect(byPath.$ref).not.toBe("#/components/schemas/branch-full");
    expect(nullableBranch).toMatchObject({ type: "object", nullable: true });
    expect(nullableBranch.allOf).toBeUndefined();
    expect(nullableBranch.properties).toEqual(branch.properties);
    expect(nullableBranch.required).toEqual(branch.required);
    expect(branch.type).toBe("object");
    expect(branch.nullable).not.toBe(true);
    expect(featured).toEqual({ $ref: "#/components/schemas/branch-full" });
    expect(unrelatedPath).toEqual({
      $ref: "#/components/schemas/project-full",
    });
    const project = schemas["project-full"];
    assert(project !== undefined && !("$ref" in project));
    expect(project.nullable).not.toBe(true);
  });

  it("declares two URL lookups as a repeated-key string array", () => {
    expect(byUrls?.parameters).toMatchObject([
      {
        name: "urls",
        in: "query",
        required: true,
        style: "form",
        explode: true,
        schema: { type: "array", items: { type: "string" } },
      },
    ]);

    const urls = Object.keys(observedBranchLookup);
    expect(urls).toHaveLength(2);
  });

  it("types each mapping value as branch-or-null and leaves unknown bodies untyped", () => {
    assert(
      schemas !== undefined && branch !== undefined && !("$ref" in branch),
    );
    const mapping =
      byUrls?.responses["200"]?.content?.["application/json"]?.schema;
    assert(
      mapping !== undefined && !("$ref" in mapping),
      "getByUrls must return a typed JSON object mapping",
    );
    const value = mapping.additionalProperties;
    assert(typeof value === "object" && value !== null && "$ref" in value);

    expect(mapping.type).toBe("object");
    const nullableBranch =
      schemas[value.$ref.replace("#/components/schemas/", "")];
    assert(nullableBranch !== undefined && !("$ref" in nullableBranch));
    expect(nullableBranch).toMatchObject({ type: "object", nullable: true });
    expect(nullableBranch.allOf).toBeUndefined();
    expect(nullableBranch.properties).toEqual(branch.properties);
    expect(nullableBranch.required).toEqual(branch.required);

    for (const [url, entry] of Object.entries(observedBranchLookup)) {
      if (entry === null) {
        expect(nullableBranch.nullable).toBe(true);
        continue;
      }
      for (const field of nullableBranch.required ?? []) {
        expect(entry, `${url} is missing required ${field}`).toHaveProperty(
          field,
        );
      }
      for (const [field, observed] of Object.entries(entry)) {
        const property = nullableBranch.properties?.[field];
        assert(
          property !== undefined && !("$ref" in property),
          `${url} has no typed schema for ${field}`,
        );
        expect(property.type).toBe(
          typeof observed === "number" ? "integer" : typeof observed,
        );
      }
    }
    expect(
      document.paths["/branches?ws.op=getOpaque"]?.get?.responses["200"]
        ?.content,
    ).toBeUndefined();
  });

  it("preserves a WADL representation that shares the nullable branch name", () => {
    const wadl = branchLookupWadl.replace(
      "</wadl:application>",
      `  <wadl:representation mediaType="application/json" id="branch-full-nullable">
    <wadl:param name="source_field" required="true" type="xsd:string"/>
  </wadl:representation>
</wadl:application>`,
    );
    const collision = generateOpenApi(parseWadl(wadl).unwrap()).unwrap();
    const source = collision.components?.schemas?.["branch-full-nullable"];
    assert(source !== undefined && !("$ref" in source));
    expect(source.properties).toHaveProperty("source_field");
    expect(source.properties).not.toHaveProperty("unique_name");

    const collisionPath =
      collision.paths["/branches?ws.op=getByPath"]?.get?.responses["200"]
        ?.content?.["application/json"]?.schema;
    assert(collisionPath !== undefined);
    const nullableBranch =
      "$ref" in collisionPath
        ? collision.components?.schemas?.[
            collisionPath.$ref.split("/").at(-1) ?? ""
          ]
        : collisionPath;
    assert(nullableBranch !== undefined && !("$ref" in nullableBranch));
    expect(nullableBranch).toMatchObject({ type: "object", nullable: true });
    expect(nullableBranch.properties).toHaveProperty("unique_name");
    expect(nullableBranch.properties).not.toHaveProperty("source_field");

    const mapping =
      collision.paths["/branches?ws.op=getByUrls"]?.get?.responses["200"]
        ?.content?.["application/json"]?.schema;
    assert(mapping !== undefined && !("$ref" in mapping));
    const value = mapping.additionalProperties;
    assert(typeof value === "object" && value !== null);
    const mapBranch =
      "$ref" in value
        ? collision.components?.schemas?.[value.$ref.split("/").at(-1) ?? ""]
        : value;
    assert(mapBranch !== undefined && !("$ref" in mapBranch));
    expect(mapBranch).toMatchObject({ type: "object", nullable: true });
    expect(mapBranch.properties).toHaveProperty("unique_name");
    expect(mapBranch.properties).not.toHaveProperty("source_field");
  });

  it("is a valid OpenAPI 3.0.3 document", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "launchpad-openapi-branch-consumer-"),
    );
    temporaryPaths.push(directory);
    const output = join(directory, "openapi.json");
    await writeFile(output, JSON.stringify(document), "utf8");
    const validated = await SwaggerParser.validate(output);
    assert("openapi" in validated);
    expect(validated.openapi).toBe("3.0.3");
  });
});

describe("generated WADL response statuses", () => {
  it("retains named and standard responses in a valid OpenAPI document", async () => {
    const document = generateOpenApi(
      parseWadl(responseStatusWadl).unwrap(),
    ).unwrap();
    const create = document.paths["/bugs/{id}?ws.op=create"]?.post;
    const bug = document.paths["/bugs/{id}"];
    assert(create !== undefined && bug?.delete !== undefined);

    const directory = await mkdtemp(
      join(tmpdir(), "launchpad-openapi-status-consumer-"),
    );
    temporaryPaths.push(directory);
    const output = join(directory, "openapi.json");
    await writeFile(output, JSON.stringify(document), "utf8");
    const validated = await SwaggerParser.validate(output);
    assert("openapi" in validated);
    expect(validated.openapi).toBe("3.0.3");

    expect(Object.keys(create.responses)).toEqual(["201", "400", "415"]);
    expect(create.responses["201"]?.content).toEqual({
      "application/json": {
        schema: { $ref: "#/components/schemas/widget-full" },
      },
    });
    expect(create.responses["400"]?.content).toEqual({
      "application/json": {
        schema: { $ref: "#/components/schemas/widget-error" },
      },
    });
    expect(create.responses["415"]?.content).toEqual({ "text/plain": {} });
    expect(Object.keys(bug.delete.responses)).toEqual(["204"]);
    expect(bug.delete.responses["204"]).not.toHaveProperty("content");
  });

  it("keeps statusless JSON responses free of advertised non-JSON media", () => {
    const document = generateOpenApi(
      parseWadl(responseStatusWadl).unwrap(),
    ).unwrap();
    const operation = document.paths["/bugs/{id}?ws.op=statuslessMedia"]?.get;
    assert(operation !== undefined);

    expect(Object.keys(operation.responses)).toEqual(["200"]);
    expect(operation.responses["200"]?.content).toEqual({
      "application/json": {
        schema: { $ref: "#/components/schemas/widget-full" },
      },
    });
  });

  it("retains legacy JSON schema for a statusless nonstandard-media reference", () => {
    const wadl = responseStatusWadl.replace(
      '<wadl:response>\n        <wadl:representation href="#widget-full" mediaType="application/json"/>',
      '<wadl:response>\n        <wadl:representation href="#widget-full" mediaType="application/problem+json"/>',
    );
    assert(wadl !== responseStatusWadl);
    const document = generateOpenApi(parseWadl(wadl).unwrap()).unwrap();
    const operation = document.paths["/bugs/{id}?ws.op=statuslessMedia"]?.get;
    assert(operation !== undefined);

    expect(Object.keys(operation.responses)).toEqual(["200"]);
    expect(operation.responses["200"]?.content).toEqual({
      "application/json": {
        schema: { $ref: "#/components/schemas/widget-full" },
      },
    });
  });

  it("honors an explicit service-root status without losing its operation metadata", () => {
    const wadl = sampleWadl.replace(
      '<wadl:response><wadl:representation href="#service-root-json"/></wadl:response>',
      '<wadl:response status="201"><wadl:representation href="#service-root-json"/></wadl:response>',
    );
    const document = generateOpenApi(parseWadl(wadl).unwrap()).unwrap();
    const root = document.paths["/"]?.get;
    assert(root !== undefined);

    expect(root).toMatchObject({
      tags: ["service-root"],
      operationId: "service-root-get",
    });
    expect(Object.keys(root.responses)).toEqual(["201"]);
    expect(root.responses["201"]?.content).toEqual({
      "application/json": {
        schema: { $ref: "#/components/schemas/service-root-json" },
      },
    });
  });

  it("keeps explicit JSON-family schemas under their advertised media types", () => {
    const wadl = responseStatusWadl
      .replace(
        'href="#widget-full" mediaType="application/json"',
        'href="#widget-full" mediaType="application/problem+json"',
      )
      .replace(
        'href="#widget-error" mediaType="application/json"',
        'href="#widget-error" mediaType="application/json; charset=utf-8"',
      );
    const document = generateOpenApi(parseWadl(wadl).unwrap()).unwrap();
    const create = document.paths["/bugs/{id}?ws.op=create"]?.post;
    assert(create !== undefined);

    expect(create.responses["201"]?.content).toEqual({
      "application/problem+json": {
        schema: { $ref: "#/components/schemas/widget-full" },
      },
    });
    expect(create.responses["400"]?.content).toEqual({
      "application/json; charset=utf-8": {
        schema: { $ref: "#/components/schemas/widget-error" },
      },
    });
  });

  it("preserves both declared schemas for the same status and media", async () => {
    const wadl = responseStatusWadl.replace(
      'status="400"><wadl:representation href="#widget-error"',
      'status="201"><wadl:representation href="#widget-error"',
    );
    const document = generateOpenApi(parseWadl(wadl).unwrap()).unwrap();
    const create = document.paths["/bugs/{id}?ws.op=create"]?.post;
    assert(create !== undefined);

    const directory = await mkdtemp(
      join(tmpdir(), "launchpad-openapi-status-union-"),
    );
    temporaryPaths.push(directory);
    const output = join(directory, "openapi.json");
    await writeFile(output, JSON.stringify(document), "utf8");
    const validated = await SwaggerParser.validate(output);
    assert("openapi" in validated);
    expect(validated.openapi).toBe("3.0.3");

    const schema =
      create.responses["201"]?.content?.["application/json"]?.schema;
    assert(schema !== undefined && !("$ref" in schema));
    expect(schema.oneOf ?? schema.anyOf).toEqual([
      { $ref: "#/components/schemas/widget-full" },
      { $ref: "#/components/schemas/widget-error" },
    ]);
  });
});
