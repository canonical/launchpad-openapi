/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

/**
 * Data-only OpenAPI 3.0 shapes emitted by the generator.
 *
 * A deliberate subset: these interfaces cover only the fields the generator
 * emits, plus the `x-lp-resource-type` extension. A full spec type library
 * would add a dependency whose permissive shapes are mostly unused here.
 */

/** An HTTP method supported by Launchpad's WADL descriptions. */
export type HttpVerb = "get" | "put" | "post" | "patch" | "delete";

/** An OpenAPI Schema Object or Reference Object. */
export interface SchemaObject {
  type?: "object" | "string" | "integer" | "boolean" | "array";
  format?: string;
  properties?: Record<string, SchemaObject>;
  items?: SchemaObject;
  enum?: string[];
  required?: string[];
  description?: string;
  default?: unknown;
  example?: unknown;
  nullable?: boolean;
  $ref?: string;
  "x-lp-resource-type"?: string;
}

/** An OpenAPI Parameter Object used for query and path parameters. */
export interface ParameterObject {
  name: string;
  in: "query" | "path";
  required: boolean;
  description?: string;
  schema?: SchemaObject;
  example?: unknown;
}

/** An OpenAPI Request Body Object. */
export interface RequestBodyObject {
  required?: boolean;
  content: Record<string, { schema: SchemaObject }>;
}

/** An OpenAPI Response Object. */
export interface ResponseObject {
  description: string;
  content?: Record<string, { schema: SchemaObject }>;
}

/** An OpenAPI Operation Object emitted for one WADL method. */
export interface OperationObject {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: ParameterObject[];
  requestBody?: RequestBodyObject;
  responses: Record<string, ResponseObject>;
}

/** An OpenAPI Path Item Object keyed by supported HTTP method. */
export type PathItemObject = Partial<Record<HttpVerb, OperationObject>>;

/** The OpenAPI document's metadata. */
export interface InfoObject {
  title: string;
  version: string;
  description: string;
}

/** One declared OpenAPI operation tag. */
export interface TagObject {
  name: string;
}

/** A serializable OpenAPI 3.0.3 document root. */
export interface OpenApiSpec {
  openapi: string;
  info: InfoObject;
  servers: { url: string }[];
  tags: TagObject[];
  paths: Record<string, PathItemObject>;
  components: { schemas: Record<string, SchemaObject> };
}

/** Optional inputs that refine generated document metadata and paths. */
export interface GenerateOptions {
  version?: string;
  serviceRootLinks?: Record<string, string>;
}
