/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { readFile } from "node:fs/promises";
import { Result, type Result as ResultType } from "better-result";
import { CliError } from "./errors.js";

/**
 * Read a local WADL document as UTF-8 text.
 *
 * @note Impure — reads from the filesystem.
 */
export default async function readInput(
  path: string,
): Promise<ResultType<string, CliError>> {
  return Result.tryPromise({
    try: () => readFile(path, "utf8"),
    catch: (cause) =>
      new CliError({ message: `Failed to read ${path}`, cause }),
  });
}
