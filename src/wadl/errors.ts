/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { TaggedError } from "better-result";

/** Raised when WADL XML cannot be parsed into the typed model. */
export class WadlParseError extends TaggedError("WadlParseError")<{
  message: string;
  cause?: unknown;
}> {}

/** Raised when a Launchpad WADL or service-root request fails. */
export class WadlFetchError extends TaggedError("WadlFetchError")<{
  url: string;
  status?: number;
  message: string;
  cause?: unknown;
}> {}

/** Raised when an API URL cannot be derived from an instance. */
export class WadlUrlError extends TaggedError("WadlUrlError")<{
  instance: string;
  message: string;
}> {}
