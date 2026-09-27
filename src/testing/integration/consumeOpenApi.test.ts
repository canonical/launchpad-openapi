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
