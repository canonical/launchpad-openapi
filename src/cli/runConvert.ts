/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { Result, type Result as ResultType } from "better-result";
import loadOpenApi from "./loadOpenApi.js";
import renderOpenApi from "./renderOpenApi.js";
import type { CliOptions } from "./schemas.js";
import type { ConversionPipelineError } from "./types.js";
import writeOutput from "./writeOutput.js";

/**
 * Convert one WADL source and emit the requested OpenAPI representation.
 *
 * @note Impure — reads local or remote input and writes output.
 */
export default async function runConvert(
  options: CliOptions,
): Promise<ResultType<void, ConversionPipelineError>> {
  return Result.gen(async function* () {
    const document = yield* Result.await(loadOpenApi(options));
    yield* Result.await(
      writeOutput(
        options.stdout ? undefined : options.output,
        renderOpenApi(document, options.format),
      ),
    );
    return Result.ok(undefined);
  });
}
