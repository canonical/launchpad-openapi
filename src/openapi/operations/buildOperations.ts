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
  SchemaObject,
  SchemasObject,
} from "openapi3-ts/oas30";
import type { WadlMethod, WadlParam } from "../../wadl/index.js";
import {
  BRANCH_FULL_SCHEMA_ID,
  COLLECTION_PAGING_PARAMETERS,
  COLLECTION_SHOW_PARAMETER,
  FORM_MEDIA_TYPE,
  JSON_MEDIA_TYPE,
  NULLABLE_BRANCH_SCHEMA_ID,
  REVIEWED_NAMED_OPERATIONS,
} from "../constants.js";
import buildParamSchema from "../schemas/buildParamSchema.js";
import buildOperationNaming from "../naming/buildOperationNaming.js";
import {
  buildOkResponse,
  buildResponses,
  buildStandardResponses,
  findResponseSchema,
  isJsonMediaType,
} from "../responses/buildResponses.js";
import type { IdentifiedOperation, SupportedHttpMethod } from "../types.js";

interface OperationArgs {
  method: WadlMethod;
  resourceTypeId: string;
  namespace?: readonly string[];
  pathParams: ParameterObject[];
  schemas: SchemasObject;
}

interface StandardOperationArgs extends OperationArgs {
  subject?: string;
  verb: SupportedHttpMethod;
  resourceTypeDoc?: string;
}

interface NamedOperationArgs extends OperationArgs {
  wsOp: string;
}

/** Build a resource operation, retaining declared responses or a legacy 200. */
export function buildStandardOperation({
  method,
  verb,
  resourceTypeId,
  subject = resourceTypeId,
  resourceTypeDoc,
  namespace,
  pathParams,
  schemas,
}: StandardOperationArgs): IdentifiedOperation {
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
  const operation: IdentifiedOperation = {
    tags: [subject],
    summary: `${action} ${toLowercaseWords(subject)}`.trim(),
    description: resourceTypeDoc,
    ...buildOperationNaming({
      subject,
      namespace: namespace ?? [],
      operation: resolveStandardOperationName(method.id, resourceTypeId, verb),
    }),
    responses: buildStandardResponses(method.responses, schemas, verb),
  };
  if (pathParams.length) operation.parameters = [...pathParams];
  if (verb === "get") {
    enrichCollectionOperation(operation, method, schemas, false);
  }

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

/** Use a declared method ID, stripping only the exact resource prefix once. */
function resolveStandardOperationName(
  methodId: string | undefined,
  resourceTypeId: string,
  verb: SupportedHttpMethod,
): string {
  if (methodId === undefined) return verb;
  const prefix = `${resourceTypeId}-`;
  return methodId.startsWith(prefix) ? methodId.slice(prefix.length) : methodId;
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
export function buildNamedOperation(
  args: NamedOperationArgs,
): IdentifiedOperation {
  const { method, wsOp, resourceTypeId, namespace, pathParams, schemas } = args;
  const reviewed =
    method.id === undefined ? undefined : REVIEWED_NAMED_OPERATIONS[method.id];
  const operation: IdentifiedOperation = {
    tags: [resourceTypeId],
    summary: toSentenceCase(wsOp),
    description: method.doc,
    ...buildOperationNaming({
      subject: resourceTypeId,
      namespace: namespace ?? [],
      operation: wsOp,
    }),
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
  if (method.httpMethod.toUpperCase() === "GET") {
    enrichCollectionOperation(operation, method, schemas, true);
  }
  return operation;
}

/**
 * Supplement resolved JSON collections without changing WADL declarations or shared pages.
 * @note - Mutates the operation being assembled by the caller.
 */
function enrichCollectionOperation(
  operation: OperationObject,
  method: WadlMethod,
  schemas: SchemasObject,
  named: boolean,
): void {
  const collectionMedia = findCollectionResponseMedia(
    operation,
    method,
    schemas,
  );
  if (collectionMedia.size === 0) return;
  const parameters = [...(operation.parameters ?? [])];
  if (!named) {
    parameters.push(
      ...method.params.map((param) => buildQueryParameter(param)),
    );
  }
  const countMedia = named ? collectionMedia.get("200") : undefined;
  const controls =
    countMedia === undefined
      ? COLLECTION_PAGING_PARAMETERS
      : [...COLLECTION_PAGING_PARAMETERS, COLLECTION_SHOW_PARAMETER];
  for (const control of controls) {
    if (
      !parameters.some(
        (param) =>
          "in" in param && param.in === "query" && param.name === control.name,
      )
    ) {
      parameters.push({ ...control, schema: { ...control.schema } });
    }
  }
  operation.parameters = parameters;
  for (const media of countMedia ?? []) {
    const responseMedia = operation.responses["200"]?.content?.[media];
    const pageSchema = responseMedia?.schema;
    if (responseMedia === undefined || pageSchema === undefined) continue;
    responseMedia.schema = {
      anyOf: [pageSchema, { type: "integer", minimum: 0 }],
      description:
        "Collection page, or a non-negative integer count for ws.show=total_size.",
    };
  }
}

/** Match source JSON page references to their actual generated successful response media. */
function findCollectionResponseMedia(
  operation: OperationObject,
  method: WadlMethod,
  schemas: SchemasObject,
): Map<string, Set<string>> {
  const collectionMedia = new Map<string, Set<string>>();
  const statusless = method.responses.filter(
    (response) => response.statusCodes.length === 0,
  );
  // Legacy conversion selects only the first resolved reference, regardless of media.
  // Check that selected source's media, not its projected application/json output.
  const legacyRepresentation = statusless
    .flatMap((response) => response.representations)
    .find(
      (representation) =>
        representation.id !== undefined && representation.id in schemas,
    );
  for (const response of method.responses) {
    const isStatusless = response.statusCodes.length === 0;
    const representations = isStatusless
      ? legacyRepresentation === undefined
        ? []
        : [legacyRepresentation]
      : response.representations;
    for (const representation of representations) {
      const id = representation.id;
      if (
        id === undefined ||
        !id.endsWith("-page") ||
        !(id in schemas) ||
        !isJsonMediaType(representation.mediaType ?? JSON_MEDIA_TYPE)
      )
        continue;
      const media = isStatusless
        ? JSON_MEDIA_TYPE
        : (representation.mediaType ?? JSON_MEDIA_TYPE);
      for (const status of isStatusless ? ["200"] : response.statusCodes) {
        if (!/^2\d\d$/.test(status)) continue;
        const generatedSchema =
          operation.responses[status]?.content?.[media]?.schema;
        if (
          !hasResponseReference(generatedSchema, `#/components/schemas/${id}`)
        )
          continue;
        const mediaTypes = collectionMedia.get(status) ?? new Set<string>();
        mediaTypes.add(media);
        collectionMedia.set(status, mediaTypes);
      }
    }
  }
  return collectionMedia;
}

/** Check references in operation-level alternatives, not arbitrary nested object fields. */
function hasResponseReference(
  schema: SchemaObject | ReferenceObject | undefined,
  ref: string,
): boolean {
  if (schema === undefined) return false;
  if ("$ref" in schema) return schema.$ref === ref;
  return (
    schema.anyOf?.some((alternative) =>
      hasResponseReference(alternative, ref),
    ) ?? false
  );
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
