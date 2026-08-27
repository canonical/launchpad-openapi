/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { TaggedError } from "better-result";

/** Raised when a typed WADL document cannot produce an OpenAPI document. */
export class ConversionError extends TaggedError("ConversionError")<{
  message: string;
}> {}
