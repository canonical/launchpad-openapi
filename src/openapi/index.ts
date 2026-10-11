/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

/**
 * Typed OpenAPI generation from Launchpad WADL model values.
 * @module openapi
 */

export { default as generateOpenApi } from "./document/generateOpenApi.js";
export { ConversionError } from "./errors.js";
export type { GenerateOptions } from "./types.js";
export type {
  InfoObject,
  OpenAPIObject,
  OperationObject,
  ParameterObject,
  PathItemObject,
  PathsObject,
  ReferenceObject,
  RequestBodyObject,
  ResponseObject,
  SchemaObject,
  SchemasObject,
  TagObject,
} from "openapi3-ts/oas30";
