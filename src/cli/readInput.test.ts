/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Result } from "better-result";
import { afterEach, assert, describe, expect, it } from "vitest";
import readInput from "./readInput.js";

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryPaths.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

describe("readInput", () => {
  it("reads UTF-8 input", async () => {
    const directory = await mkdtemp(join(tmpdir(), "launchpad-openapi-read-"));
    temporaryPaths.push(directory);
    const path = join(directory, "input.wadl");
    await writeFile(path, "<application>café</application>", "utf8");

    await expect(
      readInput(path).then((result) => result.unwrap()),
    ).resolves.toBe("<application>café</application>");
  });

  it("returns a typed read error", async () => {
    const path = join(tmpdir(), "launchpad-openapi-missing.wadl");
    const result = await readInput(path);

    assert(Result.isError(result));
    expect(result.error.message).toBe(`Failed to read ${path}`);
    expect(result.error.cause).toBeInstanceOf(Error);
  });
});
