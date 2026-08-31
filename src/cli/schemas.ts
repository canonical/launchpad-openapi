/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { z } from "zod";
import {
  DEFAULT_INSTANCE,
  DEFAULT_VERSION,
  ENVIRONMENTS,
} from "./constants.js";

/** Validated command-line options with defaults applied. */
export const optionsSchema = z.object({
  instance: z.string().min(1).default(DEFAULT_INSTANCE),
  version: z.string().min(1).default(DEFAULT_VERSION),
  environment: z.enum(ENVIRONMENTS).optional(),
  apiUrl: z.url().optional(),
  input: z.string().min(1).optional(),
  output: z.string().min(1).optional(),
  stdout: z.boolean().default(false),
  format: z.enum(["yaml", "json"]).default("yaml"),
});

/** Validated command-line options. */
export type CliOptions = z.output<typeof optionsSchema>;

/** Supported serialized OpenAPI document formats. */
export type OutputFormat = CliOptions["format"];
