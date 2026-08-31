/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Result } from "better-result";
import { parse as parseYaml } from "yaml";
import { afterEach, assert, describe, expect, it, vi } from "vitest";
import { sampleWadl } from "../../../testing/fixtures.js";
import type { OpenAPIObject } from "../../openapi/index.js";
import { runCli } from "../../cli/index.js";

const temporaryPaths: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryPaths.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

describe("offline WADL conversion", () => {
  it("converts a local WADL file to an OpenAPI YAML file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "launchpad-openapi-cli-"));
    temporaryPaths.push(directory);
    const input = join(directory, "input.wadl");
    const output = join(directory, "output.yaml");
    await writeFile(input, sampleWadl, "utf8");

    const result = await runCli([
      "convert",
      "--input",
      input,
      "--output",
      output,
      "--version",
      "fixture",
    ]);

    assert(Result.isOk(result));
    const document = parseYaml(await readFile(output, "utf8")) as OpenAPIObject;
    expect(document.openapi).toBe("3.0.3");
    expect(document.info.version).toBe("fixture");
    expect(document.servers).toEqual([
      { url: "https://api.launchpad.test/1.0" },
    ]);
    expect(Object.keys(document.paths)).toHaveLength(6);
    expect(Object.keys(document.components?.schemas ?? {})).toHaveLength(4);
    expect(document.paths["/people?ws.op=getByName"]?.get?.operationId).toBe(
      "people-getByName",
    );
  });

  it("writes a local conversion to stdout explicitly", async () => {
    const directory = await mkdtemp(join(tmpdir(), "launchpad-openapi-cli-"));
    temporaryPaths.push(directory);
    const input = join(directory, "input.wadl");
    await writeFile(input, sampleWadl, "utf8");
    const write = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    const result = await runCli([
      "--input",
      input,
      "--stdout",
      "--format",
      "json",
    ]);

    assert(Result.isOk(result));
    const output = write.mock.calls[0]?.[0];
    assert(typeof output === "string");
    const document = JSON.parse(output) as OpenAPIObject;
    expect(document.openapi).toBe("3.0.3");
    expect(Object.keys(document.paths)).toHaveLength(6);
  });
});
