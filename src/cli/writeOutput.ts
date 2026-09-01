/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { writeFile } from "node:fs/promises";
import { Result, type Result as ResultType } from "better-result";
import { CliError } from "./errors.js";

/**
 * Write serialized output to a file, or to stdout when no path is given.
 *
 * @note Impure — writes to the filesystem or process stdout.
 */
export default async function writeOutput(
  output: string | undefined,
  text: string,
): Promise<ResultType<void, CliError>> {
  if (output === undefined) {
    return Result.try({
      try: () => {
        process.stdout.write(text);
      },
      catch: (cause) =>
        new CliError({ message: "Failed to write to stdout", cause }),
    });
  }
  return Result.tryPromise({
    try: () => writeFile(output, text, "utf8"),
    catch: (cause) =>
      new CliError({ message: `Failed to write ${output}`, cause }),
  });
}
