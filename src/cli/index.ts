/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

/** Launchpad WADL-to-OpenAPI command-line conversion API. @module cli */

export { CliError } from "./errors.js";
export { default as loadOpenApi } from "./loadOpenApi.js";
export { default as parseArgs, getUsage } from "./parseArgs.js";
export { default as renderOpenApi } from "./renderOpenApi.js";
export { default as runCli } from "./runCli.js";
export { default as runConvert } from "./runConvert.js";
export type { CliOptions, OutputFormat } from "./schemas.js";
export type { ConversionPipelineError, ParsedArgs } from "./types.js";
