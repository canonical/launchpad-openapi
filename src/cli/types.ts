/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import type { ConversionError } from "../openapi/index.js";
import type {
  WadlFetchError,
  WadlParseError,
  WadlUrlError,
} from "../wadl/index.js";
import type { CliError } from "./errors.js";

/** Raw command-line values before schema validation. */
export interface ParsedArgs {
  readonly help: boolean;
  readonly raw: Record<string, string | boolean>;
}

/** Failures that can stop a conversion. */
export type ConversionPipelineError =
  | CliError
  | ConversionError
  | WadlFetchError
  | WadlParseError
  | WadlUrlError;
