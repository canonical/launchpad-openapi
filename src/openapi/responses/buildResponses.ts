/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

/**
 * Response assembly is independent of operation naming so fixed service-root
 * operations and WADL-derived operations share the same status/media rules.
 * Named operations supply their own legacy fallback for reviewed response shapes.
 */

import type {
  ReferenceObject,
  ResponseObject,
  SchemaObject,
  SchemasObject,
} from "openapi3-ts/oas30";
import type { WadlResponse } from "../../wadl/index.js";
import { BRANCH_FULL_SCHEMA_ID, JSON_MEDIA_TYPE } from "../constants.js";
import type { SupportedHttpMethod } from "../types.js";

/** Retain declared responses, using the legacy resource response only when needed. */
export function buildStandardResponses(
  responses: WadlResponse[],
  schemas: SchemasObject,
  verb: SupportedHttpMethod,
): Record<string, ResponseObject> {
  return buildResponses(responses, schemas, (statusless) =>
    verb === "delete"
      ? { description: "Resource deleted." }
      : buildOkResponse(findResponseSchema(statusless, schemas)),
  );
}

/** Retain the legacy first-known response reference regardless of media. */
export function findResponseSchema(
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
export function buildResponses(
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
export function isJsonMediaType(media: string): boolean {
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
export function buildOkResponse(
  schema?: SchemaObject | ReferenceObject,
  description = "Successful response",
): ResponseObject {
  const response: ResponseObject = { description };
  if (schema !== undefined) {
    response.content = { [JSON_MEDIA_TYPE]: { schema } };
  }
  return response;
}
