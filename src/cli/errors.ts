/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { TaggedError } from "better-result";

/** A command-line argument or local I/O failure. */
export class CliError extends TaggedError("CliError")<{
  message: string;
  cause?: unknown;
}> {}
