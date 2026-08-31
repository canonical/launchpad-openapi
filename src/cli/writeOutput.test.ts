/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Result } from "better-result";
import { afterEach, assert, describe, expect, it, vi } from "vitest";
import writeOutput from "./writeOutput.js";

const temporaryPaths: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryPaths.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

describe("writeOutput", () => {
  it("writes output to a file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "launchpad-openapi-write-"));
    temporaryPaths.push(directory);
    const path = join(directory, "output.yaml");

    await expect(writeOutput(path, "openapi: 3.0.3\n")).resolves.toSatisfy(
      Result.isOk,
    );
    await expect(readFile(path, "utf8")).resolves.toBe("openapi: 3.0.3\n");
  });

  it("writes output to stdout", async () => {
    const write = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await expect(writeOutput(undefined, "document\n")).resolves.toSatisfy(
      Result.isOk,
    );
    expect(write).toHaveBeenCalledWith("document\n");
  });

  it("returns typed file and stdout errors", async () => {
    const directory = await mkdtemp(join(tmpdir(), "launchpad-openapi-error-"));
    temporaryPaths.push(directory);
    const path = join(directory, "missing", "output.yaml");
    const fileResult = await writeOutput(path, "document\n");
    assert(Result.isError(fileResult));
    expect(fileResult.error.message).toBe(`Failed to write ${path}`);
    expect(fileResult.error.cause).toBeInstanceOf(Error);

    const failure = new Error("closed");
    vi.spyOn(process.stdout, "write").mockImplementation(() => {
      throw failure;
    });
    const stdoutResult = await writeOutput(undefined, "document\n");
    assert(Result.isError(stdoutResult));
    expect(stdoutResult.error.message).toBe("Failed to write to stdout");
    expect(stdoutResult.error.cause).toBe(failure);
  });
});
