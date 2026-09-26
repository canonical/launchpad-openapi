/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { Result } from "better-result";
import { assert, describe, expect, it } from "vitest";
import parseArgs, { getUsage } from "./parseArgs.js";

describe("parseArgs", () => {
  it("uses Commander for commands, long options, and aliases", () => {
    const result = parseArgs([
      "convert",
      "--instance",
      "qastaging.launchpad.net",
      "--version=beta",
      "--environment",
      "staging",
      "--api-url",
      "https://api.launchpad.test/beta/",
      "--input",
      "input.wadl",
      "-o",
      "output.json",
      "--format",
      "json",
    ]);

    assert(Result.isOk(result));
    expect(result.value).toEqual({
      help: false,
      raw: {
        instance: "qastaging.launchpad.net",
        version: "beta",
        environment: "staging",
        apiUrl: "https://api.launchpad.test/beta/",
        input: "input.wadl",
        output: "output.json",
        stdout: false,
        format: "json",
      },
    });
  });

  it("recognizes help and applies parser defaults", () => {
    expect(parseArgs(["-h"]).unwrap()).toEqual({ help: true, raw: {} });
    expect(parseArgs([]).unwrap()).toEqual({
      help: false,
      raw: {
        instance: "launchpad.net",
        version: "devel",
        stdout: false,
        format: "yaml",
      },
    });
  });

  it("generates help from the parser definitions", () => {
    const usage = getUsage();

    expect(usage).toContain("Usage: launchpad-openapi [options] [command]");
    expect(usage).toContain("--instance <host>");
    expect(usage).toContain("Launchpad instance hostname");
    expect(usage).toContain('"launchpad.net"');
    expect(usage).toContain("-e, --environment <name>");
    expect(usage).toContain('"staging", "qastaging"');
    expect(usage).toContain("-o, --output <file>");
    expect(usage).toContain("--stdout");
    expect(usage).toContain("-h, --help");
  });

  it("selects stdout explicitly and rejects conflicting file output", () => {
    expect(parseArgs(["--stdout"]).unwrap().raw.stdout).toBe(true);

    const conflict = parseArgs(["--stdout", "--output", "output.yaml"]);
    assert(Result.isError(conflict));
    expect(conflict.error.message).toContain("cannot be used with option");
  });

  it("returns typed errors for invalid options and commands", () => {
    const unknownOption = parseArgs(["--unknown"]);
    assert(Result.isError(unknownOption));
    expect(unknownOption.error.message).toContain("unknown option");
    expect(unknownOption.error.cause).toBeInstanceOf(Error);

    const missingValue = parseArgs(["--input"]);
    assert(Result.isError(missingValue));
    expect(missingValue.error.message).toContain("argument missing");

    const unknownCommand = parseArgs(["site"]);
    assert(Result.isError(unknownCommand));
    expect(unknownCommand.error.message).toContain(
      "value 'site' is invalid for argument 'command'",
    );

    const extraCommand = parseArgs(["convert", "extra"]);
    assert(Result.isError(extraCommand));
    expect(extraCommand.error.message).toContain("too many arguments");
  });
});
