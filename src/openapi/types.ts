/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import type { ParameterObject } from "openapi3-ts/oas30";

/** Launchpad-specific inputs for OpenAPI document generation. */

/** Optional inputs that refine generated document metadata and paths. */
export interface GenerateOptions {
  version?: string;
  serviceRootLinks?: Record<string, string>;
}
/** Source-backed canonical URL candidates for one WADL resource type. */
export interface RouteCorrection {
  /** Root-relative templates, without a leading slash. */
  templates?: readonly string[];
  /** Resource type IDs whose every route can be extended with `suffix`. */
  parents?: readonly string[];
  suffix?: string;
  /** Required URL selectors absent from the resource's WADL method signature. */
  queryParameters?: readonly ParameterObject[];
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
