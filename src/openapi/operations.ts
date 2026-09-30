/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

/**
 * Builds OpenAPI operations from standard and `ws.op` WADL methods.
 *
 * Shared helpers keep parameter and response handling consistent. WADL
 * methods declare no status codes or failure shapes, so every operation
 * documents only its 200 success response.
 */

import type {
  OperationObject,
  ParameterObject,
  ReferenceObject,
  RequestBodyObject,
  ResponseObject,
  SchemaObject,
  SchemasObject,
} from "openapi3-ts/oas30";
import type { WadlMethod, WadlParam } from "../wadl/index.js";
import {
  FORM_MEDIA_TYPE,
  JSON_MEDIA_TYPE,
  REVIEWED_NAMED_OPERATIONS,
  type SupportedHttpMethod,
} from "./constants.js";
import buildParamSchema from "./buildParamSchema.js";

interface StandardOperationArgs {
  method: WadlMethod;
  verb: SupportedHttpMethod;
  resourceTypeId: string;
  resourceTypeDoc?: string;
  pathParams: ParameterObject[];
  schemas: SchemasObject;
}

interface NamedOperationArgs {
  method: WadlMethod;
  wsOp: string;
  resourceTypeId: string;
  pathParams: ParameterObject[];
  schemas: SchemasObject;
}

/** Build a standard resource operation with its parameters and schemas. */
export function buildStandardOperation({
  method,
  verb,
  resourceTypeId,
  resourceTypeDoc,
  pathParams,
  schemas,
}: StandardOperationArgs): OperationObject {
  const responseSchema =
    verb === "delete"
      ? undefined
      : findResponseSchema(method.responseRepresentationIds, schemas);
  const responseId = responseSchema?.$ref?.split("/").at(-1);
  const action =
    verb === "get" && responseId?.endsWith("-page")
      ? "List"
      : ACTION_BY_VERB[verb];
  const operation: OperationObject = {
    tags: [resourceTypeId],
    summary: `${action} ${toLowercaseWords(resourceTypeId)}`.trim(),
    description: resourceTypeDoc,
    operationId: method.id,
    responses:
      verb === "delete"
        ? { "200": { description: "Resource deleted." } }
        : { "200": buildOkResponse(responseSchema) },
  };
  if (pathParams.length) operation.parameters = [...pathParams];

  const requestId = method.requestRepresentationId;
  // Reference only schemas that exist; never emit a dangling `$ref`.
  const requestSchema =
    requestId !== undefined && requestId in schemas
      ? { $ref: `#/components/schemas/${requestId}` }
      : undefined;
  if (requestSchema !== undefined) {
    operation.requestBody = {
      required: true,
      content: { [JSON_MEDIA_TYPE]: { schema: requestSchema } },
    };
  }
  return operation;
}

/** CRUD summary actions per HTTP verb; Launchpad routes POST through `ws.op`. */
const ACTION_BY_VERB: Record<SupportedHttpMethod, string> = {
  get: "Get",
  put: "Replace",
  post: "Create",
  patch: "Update",
  delete: "Delete",
};

/** Build a named `ws.op` operation with query or form parameters. */
export function buildNamedOperation(args: NamedOperationArgs): OperationObject {
  const { method, wsOp, resourceTypeId, schemas } = args;
  const operation: OperationObject = {
    tags: [resourceTypeId],
    summary: toSentenceCase(wsOp),
    description: method.doc,
    operationId: method.id ?? `${resourceTypeId}-${wsOp}`,
    responses: {},
  };
  if (method.formEncoded) {
    operation.requestBody = buildFormRequestBody(method.params);
  }

  const responseSchema = findResponseSchema(
    method.responseRepresentationIds,
    schemas,
  );
  const returnDoc =
    responseSchema === undefined ? findReturnDoc(method.doc) : undefined;
  const response =
    responseSchema !== undefined
      ? buildOkResponse(responseSchema)
      : buildOkResponse(inferResponseSchema(returnDoc), returnDoc);
  operation.responses = { "200": response };
  return applyReviewedNamedOperationOverrides(
    operation,
    response,
    args,
    responseSchema,
  );
}

/**
 * Build named query parameters and apply only reviewed corrections absent from WADL.
 * Ordinary operations retain WADL-derived schemas and response references.
 */
function applyReviewedNamedOperationOverrides(
  operation: OperationObject,
  response: ResponseObject,
  { method, pathParams, schemas }: NamedOperationArgs,
  responseSchema: ReferenceObject | undefined,
): OperationObject {
  const reviewed =
    method.id === undefined ? undefined : REVIEWED_NAMED_OPERATIONS[method.id];
  if (method.formEncoded) {
    if (pathParams.length) operation.parameters = [...pathParams];
  } else {
    const parameters = [...pathParams];
    parameters.push(
      ...method.params.map((param) =>
        buildQueryParameter(
          param,
          reviewed?.repeatedQueryParams?.includes(param.name) ?? false,
        ),
      ),
    );
    if (parameters.length) operation.parameters = parameters;
  }
  if (reviewed === undefined) return operation;

  let overrideSchema: SchemaObject | undefined;
  if (
    reviewed.nullableResponse !== undefined &&
    responseSchema?.$ref === `#/components/schemas/${reviewed.nullableResponse}`
  ) {
    overrideSchema = nullableObjectSchema(schemas[reviewed.nullableResponse]);
  } else if (
    reviewed.nullableMapValues !== undefined &&
    method.responseRepresentationIds.length === 0
  ) {
    const value = nullableObjectSchema(schemas[reviewed.nullableMapValues]);
    if (value !== undefined) {
      overrideSchema = { type: "object", additionalProperties: value };
    }
  }
  if (overrideSchema !== undefined) {
    response.content = { [JSON_MEDIA_TYPE]: { schema: overrideSchema } };
  }
  return operation;
}

/** Reuse WADL's object fields without changing its non-nullable component. */
function nullableObjectSchema(
  schema: SchemaObject | ReferenceObject | undefined,
): SchemaObject | undefined {
  return schema !== undefined && !("$ref" in schema) && schema.type === "object"
    ? { ...schema, nullable: true }
    : undefined;
}

/** Build a form body, or omit it when the operation has no fields. */
function buildFormRequestBody(
  params: WadlParam[],
): RequestBodyObject | undefined {
  if (!params.length) return undefined;
  const properties = Object.fromEntries(
    params.map((param): [string, SchemaObject] => [
      param.name,
      buildParamSchema(param),
    ]),
  );
  const required = params
    .filter((param) => param.required)
    .map((param) => param.name);
  const schema: SchemaObject = { type: "object", properties };
  const body: RequestBodyObject = {
    content: { [FORM_MEDIA_TYPE]: { schema } },
  };
  if (required.length) {
    schema.required = required;
    body.required = true;
  }
  return body;
}

/** Convert a WADL parameter into an OpenAPI query parameter. */
function buildQueryParameter(
  param: WadlParam,
  reviewedRepeating = false,
): ParameterObject {
  const { description, ...schema } = buildParamSchema(
    param,
    undefined,
    param.repeating || reviewedRepeating,
  );
  const parameter: ParameterObject = {
    name: param.name,
    in: "query",
    required: param.required,
    description,
    schema,
  };
  if (reviewedRepeating) {
    parameter.style = "form";
    parameter.explode = true;
  }
  return parameter;
}

/**
 * Resolve the first known response component; WADL may list non-JSON first.
 *
 * References only schemas that exist; never emits a dangling `$ref`.
 */
function findResponseSchema(
  representationIds: string[],
  schemas: SchemasObject,
): ReferenceObject | undefined {
  for (const id of representationIds) {
    if (id in schemas) return { $ref: `#/components/schemas/${id}` };
  }
  return undefined;
}

/** Build a successful response with an optional JSON schema. */
function buildOkResponse(
  schema?: SchemaObject | ReferenceObject,
  description = "Successful response",
): ResponseObject {
  const response: ResponseObject = { description };
  if (schema !== undefined) {
    response.content = { [JSON_MEDIA_TYPE]: { schema } };
  }
  return response;
}

/** Match a normalized Sphinx `return:` field up to the next field label. */
const RETURN_FIELD_PATTERN =
  /\breturn:(.*?)(?=\s+:?(?:(?:param|type|raises?)\s+[^:]+|rtype):|$)/i;

/** Extract `return:` text up to the next Sphinx-style field. */
function findReturnDoc(doc: string | undefined): string | undefined {
  if (doc === undefined) return undefined;
  return RETURN_FIELD_PATTERN.exec(doc)?.[1]?.trim() || undefined;
}

/** Conservative phrases that can identify scalar or URI response types. */
const STRING_RETURN_PATTERN = /\ba string\b/i;
const URI_RETURN_PATTERN = /\b(url|link)\b/i;
const BOOLEAN_RETURN_PATTERN = /^\s*True if\b/i;
const COLLECTION_OF_URLS_PATTERN = /\bcollection of urls\b/i;

/** Infer only response types recognized by the documentation patterns. */
function inferResponseSchema(
  returnDoc: string | undefined,
): SchemaObject | undefined {
  if (!returnDoc?.trim()) return undefined;
  if (STRING_RETURN_PATTERN.test(returnDoc)) {
    const schema: SchemaObject = { type: "string", nullable: true };
    if (URI_RETURN_PATTERN.test(returnDoc)) schema.format = "uri";
    return schema;
  }
  if (BOOLEAN_RETURN_PATTERN.test(returnDoc)) {
    return { type: "boolean", nullable: true };
  }
  if (COLLECTION_OF_URLS_PATTERN.test(returnDoc)) {
    return { type: "array", items: { type: "string", format: "uri" } };
  }
  return undefined;
}

/** Split camelCase, snake_case, or kebab-case into lowercase words. */
function toLowercaseWords(identifier: string): string {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Convert camelCase, snake_case, or kebab-case to sentence case. */
function toSentenceCase(identifier: string): string {
  const words = toLowercaseWords(identifier);
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : words;
}
