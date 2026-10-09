/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

/**
 * Builds OpenAPI operations from standard and `ws.op` WADL methods.
 *
 * Shared helpers retain declared WADL statuses, media, and schemas; methods
 * without status metadata keep their legacy 200 response behavior.
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
import type { WadlMethod, WadlParam, WadlResponse } from "../wadl/index.js";
import {
  BRANCH_FULL_SCHEMA_ID,
  FORM_MEDIA_TYPE,
  JSON_MEDIA_TYPE,
  NULLABLE_BRANCH_SCHEMA_ID,
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

/** Build a resource operation, retaining declared responses or a legacy 200. */
export function buildStandardOperation({
  method,
  verb,
  resourceTypeId,
  resourceTypeDoc,
  pathParams,
  schemas,
}: StandardOperationArgs): OperationObject {
  const responseId =
    verb === "get"
      ? findResponseSchema(
          method.responses.filter(
            (response) =>
              response.statusCodes.length === 0 ||
              response.statusCodes.some((status) => status.startsWith("2")),
          ),
          schemas,
        )
          ?.$ref.split("/")
          .at(-1)
      : undefined;
  const action =
    verb === "get" && responseId?.endsWith("-page")
      ? "List"
      : ACTION_BY_VERB[verb];
  const operation: OperationObject = {
    tags: [resourceTypeId],
    summary: `${action} ${toLowercaseWords(resourceTypeId)}`.trim(),
    description: resourceTypeDoc,
    operationId: method.id,
    responses: buildResponses(method.responses, schemas, (statusless) =>
      verb === "delete"
        ? { description: "Resource deleted." }
        : buildOkResponse(findResponseSchema(statusless, schemas)),
    ),
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

/** Build a named `ws.op` operation with declared or inferred responses. */
export function buildNamedOperation(args: NamedOperationArgs): OperationObject {
  const { method, wsOp, resourceTypeId, schemas } = args;
  const reviewed =
    method.id === undefined ? undefined : REVIEWED_NAMED_OPERATIONS[method.id];
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

  const nullableResponse = reviewed?.nullableResponse;
  const nullableBranch =
    nullableResponse === undefined
      ? undefined
      : nullableReviewedSchema(nullableResponse, schemas);
  operation.responses = buildResponses(
    method.responses,
    schemas,
    (statusless) => {
      const responseSchema = findResponseSchema(statusless, schemas);
      if (responseSchema !== undefined) {
        const selectedResponseSchema =
          nullableResponse !== undefined &&
          responseSchema.$ref === `#/components/schemas/${nullableResponse}`
            ? (nullableBranch ?? responseSchema)
            : responseSchema;
        return buildOkResponse(selectedResponseSchema);
      }
      const returnDoc = findReturnDoc(method.doc);
      let responseBodySchema = inferResponseSchema(returnDoc);
      if (
        reviewed?.fileUrlMetadata !== undefined &&
        method.params.some((param) => param.name === "include_meta") &&
        statusless.every((response) => response.representations.length === 0)
      ) {
        responseBodySchema = buildFileUrlResponseSchema(
          reviewed.fileUrlMetadata,
        );
      }
      if (
        reviewed?.nullableMapValues !== undefined &&
        statusless.every((response) => response.representations.length === 0)
      ) {
        const mappingBranchSchema = nullableReviewedSchema(
          reviewed.nullableMapValues,
          schemas,
        );
        if (mappingBranchSchema !== undefined) {
          responseBodySchema = {
            type: "object",
            additionalProperties: mappingBranchSchema,
          };
        }
      }
      return buildOkResponse(responseBodySchema, returnDoc);
    },
    nullableBranch,
  );
  const { pathParams } = args;
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
  return operation;
}

/** Build source-reviewed file responses as homogeneous arrays; both allow empty results. */
function buildFileUrlResponseSchema(
  checksums: readonly string[],
): SchemaObject {
  const properties: Record<string, SchemaObject> = {
    url: { type: "string", format: "uri" },
    size: { type: "integer" },
  };
  for (const checksum of checksums) properties[checksum] = { type: "string" };
  return {
    // Empty arrays match both modes, so oneOf would incorrectly reject them.
    anyOf: [
      {
        description: "File URLs when include_meta is omitted or false.",
        type: "array",
        items: { type: "string", format: "uri" },
      },
      {
        description: "File metadata when include_meta is true.",
        type: "array",
        items: {
          type: "object",
          properties,
          required: ["url", "size", ...checksums],
        },
      },
    ],
  };
}

/** Reuse the generated branch variant when available, otherwise preserve WADL fields inline. */
function nullableReviewedSchema(
  schemaId: string,
  schemas: SchemasObject,
): SchemaObject | ReferenceObject | undefined {
  const schema = schemas[schemaId];
  if (schema === undefined || "$ref" in schema || schema.type !== "object") {
    return undefined;
  }
  if (schemaId !== BRANCH_FULL_SCHEMA_ID) {
    return { ...schema, nullable: true };
  }
  const namedSchema = schemas[NULLABLE_BRANCH_SCHEMA_ID];
  // The generated variant shares the branch's fields, a WADL component with this ID does not.
  if (
    namedSchema !== undefined &&
    !("$ref" in namedSchema) &&
    namedSchema.nullable === true &&
    namedSchema.properties === schema.properties &&
    namedSchema.required === schema.required
  ) {
    return { $ref: `#/components/schemas/${NULLABLE_BRANCH_SCHEMA_ID}` };
  }
  return { ...schema, nullable: true };
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

/** Retain the legacy first-known response reference regardless of media. */
function findResponseSchema(
  responses: WadlResponse[],
  schemas: SchemasObject,
): ReferenceObject | undefined {
  for (const response of responses) {
    for (const representation of response.representations) {
      if (representation.id !== undefined && representation.id in schemas) {
        return { $ref: `#/components/schemas/${representation.id}` };
      }
    }
  }
  return undefined;
}

/**
 * Keep declared statuses and their media together; infer a legacy 200 only
 * when a WADL response has no status or no response was declared at all.
 */
function buildResponses(
  wadlResponses: WadlResponse[],
  schemas: SchemasObject,
  legacyResponse: (statusless: WadlResponse[]) => ResponseObject,
  nullableBranch?: SchemaObject | ReferenceObject,
): Record<string, ResponseObject> {
  const responses: Record<string, ResponseObject> = {};
  const statusless: WadlResponse[] = [];
  for (const wadlResponse of wadlResponses) {
    if (wadlResponse.statusCodes.length === 0) {
      statusless.push(wadlResponse);
      continue;
    }
    for (const status of wadlResponse.statusCodes) {
      const response = (responses[status] ??= {
        description: wadlResponse.doc ?? "Response",
      });
      if (wadlResponse.doc && response.description === "Response") {
        response.description = wadlResponse.doc;
      }
      addRepresentations(
        response,
        wadlResponse,
        schemas,
        status.startsWith("2") ? nullableBranch : undefined,
      );
    }
  }
  if (statusless.length > 0 || Object.keys(responses).length === 0) {
    const fallback = legacyResponse(statusless);
    const doc = statusless.find((response) => response.doc)?.doc;
    if (doc !== undefined) fallback.description = doc;
    const existing = responses["200"];
    if (existing === undefined) {
      responses["200"] = fallback;
    } else {
      if (existing.description === "Response") {
        existing.description = fallback.description;
      }
      for (const [media, value] of Object.entries(fallback.content ?? {})) {
        mergeResponseMedia(existing, media, value.schema);
      }
    }
  }
  return responses;
}

/** Recognize JSON media types, including structured suffixes and parameters. */
function isJsonMediaType(media: string): boolean {
  return /^application\/(?:json|[^/;\s]+\+json)(?:\s*;|$)/i.test(media);
}

/**
 * Merge schemas as alternatives when WADL declares the same status/media twice.
 * @note - Mutates the response being assembled by the caller.
 */
function mergeResponseMedia(
  response: ResponseObject,
  media: string,
  schema: SchemaObject | ReferenceObject | undefined,
): void {
  const content = (response.content ??= {});
  const current = content[media];
  if (schema === undefined) {
    content[media] ??= {};
    return;
  }
  const previous = current?.schema;
  if (previous === undefined) {
    content[media] = { schema };
    return;
  }
  const alternatives = "$ref" in previous ? undefined : previous.anyOf;
  const candidates = alternatives ?? [previous];
  const duplicate = candidates.some(
    (candidate) =>
      candidate === schema ||
      ("$ref" in candidate &&
        "$ref" in schema &&
        candidate.$ref === schema.$ref),
  );
  if (!duplicate) {
    content[media] = { schema: { anyOf: [...candidates, schema] } };
  }
}

/**
 * Attach advertised media and resolved JSON references without guessing unknown types.
 * @note - Mutates the response being assembled by the caller.
 */
function addRepresentations(
  response: ResponseObject,
  wadlResponse: WadlResponse,
  schemas: SchemasObject,
  nullableBranch?: SchemaObject | ReferenceObject,
): void {
  for (const representation of wadlResponse.representations) {
    const media =
      representation.mediaType ??
      (representation.id !== undefined && representation.id in schemas
        ? JSON_MEDIA_TYPE
        : undefined);
    if (!media) continue;
    const schema =
      isJsonMediaType(media) &&
      representation.id !== undefined &&
      representation.id in schemas
        ? representation.id === BRANCH_FULL_SCHEMA_ID && nullableBranch
          ? nullableBranch
          : { $ref: `#/components/schemas/${representation.id}` }
        : undefined;
    mergeResponseMedia(response, media, schema);
  }
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
