/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

/** Launchpad-specific inputs for OpenAPI document generation. */

/** Optional inputs that refine generated document metadata and paths. */
export interface GenerateOptions {
  version?: string;
  serviceRootLinks?: Record<string, string>;
}

/** Reviewed field contracts scoped to one WADL representation. */
export interface ReviewedFields {
  integer?: readonly string[];
  boolean?: readonly string[];
  stringArray?: readonly string[];
  object?: readonly string[];
  nullable?: readonly string[];
  enumCorrections?: Readonly<Record<string, readonly [string, string]>>;
}
