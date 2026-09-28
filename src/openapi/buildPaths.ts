/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import type {
  OperationObject,
  ParameterObject,
  PathItemObject,
  PathsObject,
  ResponseObject,
  SchemasObject,
} from "openapi3-ts/oas30";
import type {
  WadlDocument,
  WadlParam,
  WadlRepresentation,
  WadlResourceType,
} from "../wadl/index.js";
import {
  COLLECTION_LINK_SUFFIXES,
  EXAMPLE_BY_RESOURCE,
  HTTP_METHODS,
  JSON_MEDIA_TYPE,
  PAGE_RESOURCE_SUFFIX,
  SERVICE_ROOT_REPRESENTATION,
  SERVICE_ROOT_TYPE,
  SPECIAL_RESOURCE_TYPES,
  type SupportedHttpMethod,
} from "./constants.js";
import { buildNamedOperation, buildStandardOperation } from "./operations.js";

interface ResourcePath {
  base: string;
  pathParams: ParameterObject[];
}

/** Match editable `{name=example}` path segments. */
const RESOURCE_PATH_PARAM_PATTERN = /^\{([^=}]+)=(.*)\}$/;

/**
 * Build paths from resource types, runtime links, and editable examples.
 *
 * Internal lazr.restful and collection-page resource types are omitted.
 */
export default function buildPaths(
  model: WadlDocument,
  schemas: SchemasObject,
  serviceRootLinks?: Record<string, string>,
): PathsObject {
  const toplevelSegments = buildToplevelSegments(
    model.representations[SERVICE_ROOT_REPRESENTATION],
    model.baseUrl,
    serviceRootLinks,
  );
  const resourceEntries = Object.values(model.resourceTypes)
    .filter(
      (resourceType) =>
        !SPECIAL_RESOURCE_TYPES.has(resourceType.id) &&
        !resourceType.id.endsWith(PAGE_RESOURCE_SUFFIX),
    )
    .flatMap((resourceType) =>
      buildResourceTypeEntries(
        resourceType,
        toplevelSegments[resourceType.id],
        schemas,
      ),
    );
  const serviceRoot = model.resourceTypes[SERVICE_ROOT_TYPE];
  return {
    ...(serviceRoot
      ? { "/": buildServiceRootGetPath(serviceRoot, schemas) }
      : {}),
    ...Object.fromEntries(resourceEntries),
  };
}

/** Build the base and `ws.op` path entries for one resource type. */
function buildResourceTypeEntries(
  resourceType: WadlResourceType,
  segment: string | undefined,
  schemas: SchemasObject,
): [string, PathItemObject][] {
  const resourcePath: ResourcePath = segment
    ? { base: `/${segment}`, pathParams: [] }
    : buildResourcePath(resourceType.id, EXAMPLE_BY_RESOURCE[resourceType.id]);
  const baseItem: PathItemObject = {};
  const namedItems: Record<string, PathItemObject> = {};
  for (const method of resourceType.methods) {
    const verb = method.httpMethod.toLowerCase();
    if (!isHttpVerb(verb)) continue;
    if (method.wsOp !== undefined) {
      const operationPath = `${resourcePath.base}?ws.op=${method.wsOp}`;
      const item = (namedItems[operationPath] ??= {});
      item[verb] = buildNamedOperation({
        method,
        wsOp: method.wsOp,
        resourceTypeId: resourceType.id,
        pathParams: resourcePath.pathParams,
        schemas,
      });
      continue;
    }
    // Launchpad exposes POST through `ws.op`; unnamed POST is not callable.
    if (verb === "post") continue;
    baseItem[verb] = buildStandardOperation({
      method,
      verb,
      resourceTypeId: resourceType.id,
      resourceTypeDoc: resourceType.doc,
      pathParams: resourcePath.pathParams,
      schemas,
    });
  }
  const entries: [string, PathItemObject][] = Object.entries(namedItems);
  if (Object.keys(baseItem).length) {
    entries.unshift([resourcePath.base, baseItem]);
  }
  return entries;
}

/** Keep the fixed service-root metadata, honoring declared GET statuses. */
function buildServiceRootGetPath(
  resourceType: WadlResourceType,
  schemas: SchemasObject,
): PathItemObject {
  const method = resourceType.methods.find(
    (candidate) =>
      candidate.wsOp === undefined &&
      candidate.httpMethod.toLowerCase() === "get",
  );
  let responses: OperationObject["responses"];
  if (method?.responses.some((response) => response.statusCodes.length > 0)) {
    responses = buildStandardOperation({
      method,
      verb: "get",
      resourceTypeId: SERVICE_ROOT_TYPE,
      pathParams: [],
      schemas,
    }).responses;
  } else {
    const response: ResponseObject = { description: "Successful response" };
    if (SERVICE_ROOT_REPRESENTATION in schemas) {
      response.content = {
        [JSON_MEDIA_TYPE]: {
          schema: {
            $ref: `#/components/schemas/${SERVICE_ROOT_REPRESENTATION}`,
          },
        },
      };
    }
    responses = { "200": response };
  }
  return {
    get: {
      tags: [SERVICE_ROOT_TYPE],
      summary: "The root of the web service.",
      operationId: "service-root-get",
      responses,
    },
  };
}

/**
 * Prefer runtime top-level segments, with WADL link names as fallbacks.
 */
function buildToplevelSegments(
  serviceRoot: WadlRepresentation | undefined,
  baseUrl: string,
  serviceRootLinks: Record<string, string> | undefined,
): Record<string, string> {
  const segments: Record<string, string> = {};
  if (serviceRoot === undefined) return segments;
  for (const field of serviceRoot.fields) {
    if (field.linkResourceType === undefined) continue;
    segments[field.linkResourceType] = resolveToplevelSegment(
      field,
      baseUrl,
      serviceRootLinks,
    );
  }
  return segments;
}

/**
 * Resolve the runtime segment of a service-root link field.
 *
 * Falls back to the WADL field name when the runtime link is unusable.
 */
function resolveToplevelSegment(
  field: WadlParam,
  baseUrl: string,
  serviceRootLinks: Record<string, string> | undefined,
): string {
  const runtimeLink = serviceRootLinks?.[field.name];
  const relative = runtimeLink?.startsWith(baseUrl)
    ? runtimeLink.slice(baseUrl.length).replace(/^\//, "").replace(/\/$/, "")
    : undefined;
  return relative && !relative.startsWith("#")
    ? relative
    : stripCollectionLinkSuffix(field.name);
}

/** Remove the first recognized collection-link suffix from a WADL field name. */
function stripCollectionLinkSuffix(name: string): string {
  for (const suffix of COLLECTION_LINK_SUFFIXES) {
    if (name.endsWith(suffix)) return name.slice(0, -suffix.length);
  }
  return name;
}

/**
 * Convert a curated template into a path and required parameters with examples.
 *
 * Missing templates receive one placeholder segment.
 */
function buildResourcePath(
  resourceTypeId: string,
  template: string | undefined,
): ResourcePath {
  if (template === undefined) {
    return {
      base: `/{${resourceTypeId}}`,
      pathParams: [
        {
          name: resourceTypeId,
          in: "path",
          required: true,
          description: `URL segment of the ${resourceTypeId} resource (Launchpad assigns this at runtime; replace with a real instance segment).`,
          schema: { type: "string" },
        },
      ],
    };
  }

  const pathParams: ParameterObject[] = [];
  const segments = template.split("/").map((segment) => {
    const match = RESOURCE_PATH_PARAM_PATTERN.exec(segment);
    if (match === null) return segment;
    const name = match[1];
    const value = match[2];
    pathParams.push({
      name,
      in: "path",
      required: true,
      description: `\`${name}\` segment of the ${resourceTypeId} resource URL (required; the example is a real instance, not a runtime default).`,
      schema: { type: "string", example: value },
    });
    return `{${name}}`;
  });
  return { base: `/${segments.join("/")}`, pathParams };
}

/** Narrow an arbitrary WADL method name to a supported OpenAPI HTTP verb. */
function isHttpVerb(value: string): value is SupportedHttpMethod {
  return HTTP_METHODS.some((method) => method === value);
}
