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
import { branchLookupWadl, sampleWadl } from "../../../testing/fixtures.js";
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
  it("produces a valid OpenAPI 3.0.3 document", async () => {
    const document = generateOpenApi(
      parseWadl(branchLookupWadl).unwrap(),
    ).unwrap();
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
