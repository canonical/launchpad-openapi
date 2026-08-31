/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { Result } from "better-result";
import { afterEach, assert, describe, expect, it, vi } from "vitest";
import { getUsage } from "./parseArgs.js";
import runCli from "./runCli.js";

afterEach(() => vi.restoreAllMocks());

describe("runCli", () => {
  it("prints help without running a conversion", async () => {
    const write = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    const result = await runCli(["--help"]);

    assert(Result.isOk(result));
    expect(write).toHaveBeenCalledWith(getUsage());
  });

  it("propagates argument parser errors", async () => {
    const result = await runCli(["site"]);

    assert(Result.isError(result));
    expect(result.error.message).toContain(
      "value 'site' is invalid for argument 'command'",
    );
  });

  it("returns all schema validation failures as a typed error", async () => {
    const result = await runCli([
      "--api-url",
      "relative",
      "--format",
      "toml",
    ]);

    assert(Result.isError(result));
    expect(result.error.message).toContain("Invalid options:");
    expect(result.error.message).toContain("apiUrl:");
    expect(result.error.message).toContain("format:");
  });
});
