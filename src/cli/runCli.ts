/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { Result, type Result as ResultType } from "better-result";
import { CliError } from "./errors.js";
import parseArgs, { getUsage } from "./parseArgs.js";
import runConvert from "./runConvert.js";
import { optionsSchema } from "./schemas.js";
import type { ConversionPipelineError } from "./types.js";
import writeOutput from "./writeOutput.js";

/**
 * Parse and validate command-line arguments, then run a conversion.
 *
 * Help is written to stdout without loading a WADL source.
 *
 * @note Impure — writes help or executes the conversion pipeline.
 */
export default async function runCli(
  argv: string[],
): Promise<ResultType<void, ConversionPipelineError>> {
  const parsed = parseArgs(argv);
  if (Result.isError(parsed)) return parsed;

  if (parsed.value.help) return writeOutput(undefined, getUsage());

  const validated = optionsSchema.safeParse(parsed.value.raw);
  if (!validated.success) {
    const message = validated.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    return Result.err(
      new CliError({ message: `Invalid options: ${message}` }),
    );
  }

  return runConvert(validated.data);
}
