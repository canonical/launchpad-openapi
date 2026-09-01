/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { Argument, Command, CommanderError, Option } from "commander";
import { Result, type Result as ResultType } from "better-result";
import {
  DEFAULT_INSTANCE,
  DEFAULT_VERSION,
  ENVIRONMENTS,
  type Environment,
} from "./constants.js";
import { CliError } from "./errors.js";
import type { ParsedArgs } from "./types.js";

interface CliOptionValues {
  readonly instance: string;
  readonly version: string;
  readonly environment?: Environment;
  readonly apiUrl?: string;
  readonly input?: string;
  readonly output?: string;
  readonly stdout?: boolean;
  readonly format: string;
}

/** Build the parser that owns both argument handling and generated help. */
function createProgram(): Command {
  return new Command()
    .name("launchpad-openapi")
    .description("Convert Launchpad WADL to an OpenAPI 3.0.3 document.")
    .addArgument(
      new Argument("[command]", "conversion command")
        .choices(["convert"])
        .default("convert"),
    )
    .option(
      "--instance <host>",
      "Launchpad instance hostname",
      DEFAULT_INSTANCE,
    )
    .option("--version <value>", "web-service API version", DEFAULT_VERSION)
    .addOption(
      new Option(
        "-e, --environment <name>",
        "use a named Launchpad environment",
      ).choices([...ENVIRONMENTS]),
    )
    .option(
      "--api-url <url>",
      "API base URL; overrides environment and instance",
    )
    .option("--input <file>", "read WADL from a local file")
    .option("-o, --output <file>", "write output to a file")
    .addOption(
      new Option("--stdout", "write output to stdout").conflicts("output"),
    )
    .option("--format <format>", "output format: yaml or json", "yaml")
    .helpOption("-h, --help", "show this help")
    .exitOverride()
    .configureOutput({
      writeOut: () => {},
      writeErr: () => {},
    });
}

/** Generate command-line help from the parser's argument definitions. */
export function getUsage(): string {
  return createProgram().helpInformation();
}

/**
 * Parse process arguments with Commander.
 *
 * The optional `convert` positional command is accepted for explicit use.
 */
export default function parseArgs(
  argv: string[],
): ResultType<ParsedArgs, CliError> {
  const program = createProgram();
  const parsed = Result.try({
    try: () => {
      program.parse(argv, { from: "user" });
      return program.opts<CliOptionValues>();
    },
    catch: (cause) =>
      new CliError({
        message: cause instanceof Error ? cause.message : String(cause),
        cause,
      }),
  });

  if (
    Result.isError(parsed) &&
    parsed.error.cause instanceof CommanderError &&
    parsed.error.cause.code === "commander.helpDisplayed"
  ) {
    return Result.ok({ help: true, raw: {} });
  }
  return parsed.map((values) => ({
    help: false,
    raw: { ...values, stdout: values.stdout ?? false },
  }));
}
