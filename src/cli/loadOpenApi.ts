/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { Result, type Result as ResultType } from "better-result";
import { generateOpenApi, type OpenAPIObject } from "../openapi/index.js";
import {
  buildApiUrl,
  fetchServiceRoot,
  fetchWadl,
  parseWadl,
} from "../wadl/index.js";
import { ENVIRONMENT_API_URLS } from "./constants.js";
import type { CliOptions } from "./schemas.js";
import type { ConversionPipelineError } from "./types.js";
import readInput from "./readInput.js";

/**
 * Load WADL from a local file or Launchpad, then generate an OpenAPI document.
 *
 * Online conversion also requests the service root so generated top-level
 * paths use Launchpad's runtime links. A service-root failure is non-fatal;
 * generation then falls back to WADL-derived paths.
 *
 * @note Impure — performs filesystem or network I/O.
 */
export default async function loadOpenApi(
  options: CliOptions,
): Promise<ResultType<OpenAPIObject, ConversionPipelineError>> {
  return Result.gen(async function* () {
    let xml: string;
    let serviceRootLinks: Record<string, string> | undefined;

    if (options.input !== undefined) {
      xml = yield* Result.await(readInput(options.input));
    } else {
      const baseUrl =
        options.apiUrl ??
        (options.environment === undefined
          ? undefined
          : ENVIRONMENT_API_URLS[options.environment]);
      const apiUrl = yield* baseUrl === undefined
        ? buildApiUrl(options.instance, options.version)
        : buildApiUrl(
            new URL(`${encodeURIComponent(options.version)}/`, baseUrl).href,
          );
      xml = yield* Result.await(fetchWadl(apiUrl));
      const serviceRoot = await fetchServiceRoot(apiUrl);
      if (Result.isOk(serviceRoot)) serviceRootLinks = serviceRoot.value;
    }

    const model = yield* parseWadl(xml);
    return generateOpenApi(model, {
      version: options.version,
      serviceRootLinks,
    });
  });
}
