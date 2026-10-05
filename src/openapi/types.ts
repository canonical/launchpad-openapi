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
/** Canonical URL shape with an explicitly owned operation-ID variant. */
export interface RouteTemplate {
  /** Root-relative template, without a leading slash. */
  template: string;
  /** Appended to operation IDs; absence preserves the base ID. */
  operationSuffix?: string;
}

/** Resource family whose routes are inherited by a child correction. */
export interface RouteParent {
  resourceType: string;
  /** Prepended to inherited operation suffixes to distinguish parent branches. */
  operationSuffixPrefix?: string;
}

/** Source-backed canonical URL candidates for one WADL resource type. */
export interface RouteCorrection {
  /** Root-relative templates, without a leading slash. */
  templates?: readonly RouteTemplate[];
  /** Resource type IDs whose every route can be extended with `suffix`. */
  parents?: readonly RouteParent[];
  suffix?: string;
  /** Required URL selectors absent from the resource's WADL method signature. */
  queryParameters?: readonly ParameterObject[];
}
