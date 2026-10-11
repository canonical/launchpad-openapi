/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import type { OperationObject, ParameterObject } from "openapi3-ts/oas30";
import type { HTTP_METHODS } from "./constants.js";

/** Shared inputs, route metadata, and naming contracts for OpenAPI generation. */

/** HTTP verbs supported by the OpenAPI path builders. */
export type SupportedHttpMethod = (typeof HTTP_METHODS)[number];

/** Optional inputs that refine generated document metadata and paths. */
export interface GenerateOptions {
  version?: string;
  serviceRootLinks?: Record<string, string>;
}

/** Explicit subject, ordered contexts, and source operation name. */
export interface NamingPath {
  subject: string;
  namespace: readonly string[];
  operation: string;
}

/** Complete operation ID and the normalized components that define it. */
export interface OperationNaming {
  operationId: string;
  "x-launchpad-naming-path": NamingPath;
}

/** Generated operation with a required, structured naming identity. */
export type IdentifiedOperation = OperationObject & OperationNaming;

/** Resolved URL path, its parameters, and its explicitly declared contexts. */
export interface ResourcePath {
  base: string;
  pathParams: ParameterObject[];
  namespace?: readonly string[];
}

/** Canonical URL shape with explicitly owned naming contexts. */
export interface RouteTemplate {
  /** Root-relative template, without a leading slash. */
  template: string;
  /** Ordered contexts; absence means no namespace, independent of route count. */
  namespace?: readonly string[];
}

/** Resource family whose routes are inherited by a child correction. */
export interface RouteParent {
  resourceType: string;
  /** Explicit contexts prepended to the parent's inherited namespace. */
  namespace?: readonly string[];
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
