/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

/**
 * Typed OpenAPI generation from Launchpad WADL model values.
 * @module openapi
 */

export { default as generateOpenApi } from "./generateOpenApi.js";
export { ConversionError } from "./errors.js";
export type {
  GenerateOptions,
  HttpVerb,
  InfoObject,
  OpenApiSpec,
  OperationObject,
  ParameterObject,
  PathItemObject,
  RequestBodyObject,
  ResponseObject,
  SchemaObject,
  TagObject,
} from "./types.js";
