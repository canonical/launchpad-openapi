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
  WadlRepresentation,
  WadlResourceType,
} from "../wadl/index.js";
import {
  HTTP_METHODS,
  JSON_MEDIA_TYPE,
  PAGE_RESOURCE_SUFFIX,
  ROUTE_CORRECTIONS,
  ROUTELESS_RESOURCE_TYPES,
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
 * Build paths from the canonical route catalog and service-root links.
 *
 * Internal, collection-page, and unaddressable marker resource types are omitted.
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
  const serviceRoot = model.resourceTypes[SERVICE_ROOT_TYPE];
  const paths: PathsObject = {};
  if (serviceRoot) paths["/"] = buildServiceRootGetPath(serviceRoot, schemas);
  const shapes = new Map<string, { path: string; resourceTypeId: string }>();
  if (serviceRoot)
    shapes.set("/", { path: "/", resourceTypeId: SERVICE_ROOT_TYPE });
  const resolved = new Map<string, readonly string[]>();
  const resolving = new Set<string>();
  const operationIds = new Set<string>();
  if (serviceRoot) operationIds.add("service-root-get");

  for (const resourceType of Object.values(model.resourceTypes)) {
    if (
      SPECIAL_RESOURCE_TYPES.has(resourceType.id) ||
      ROUTELESS_RESOURCE_TYPES[resourceType.id] === true ||
      resourceType.id.endsWith(PAGE_RESOURCE_SUFFIX)
    )
      continue;

    const templates = resolveTemplates(resourceType.id, resolved, resolving);
    const links = toplevelSegments.get(resourceType.id);
    const routes: ResourcePath[] = [];
    const routePaths = new Set<string>();
    // Runtime service-root links are additional concrete routes, not replacements
    // for the canonical variants of the same resource.
    if (links !== undefined) {
      for (const segment of links) {
        const base = `/${segment}`;
        if (routePaths.has(base)) continue;
        routePaths.add(base);
        routes.push({ base, pathParams: [] });
      }
    }
    for (const template of templates) {
      const route = buildResourcePath(resourceType.id, template);
      if (routePaths.has(route.base)) continue;
      routePaths.add(route.base);
      routes.push(route);
    }

    for (const [index, route] of routes.entries()) {
      const entries = buildResourceTypeEntries(
        resourceType,
        route,
        schemas,
        routes.length > 1 ? index + 1 : undefined,
        operationIds,
      );
      if (entries.length === 0) continue;
      const shape = pathShape(route.base);
      const owner = shapes.get(shape);
      if (
        owner !== undefined &&
        (owner.resourceTypeId !== resourceType.id || owner.path !== route.base)
      ) {
        const primary = paths[owner.path];
        if (primary === undefined)
          throw new Error(`Missing path for ${owner.path}`);
        for (const [path, item] of entries) {
          addRouteAlternative(primary, {
            path,
            resourceTypeId: resourceType.id,
            item,
          });
        }
        continue;
      }
      for (const [path, item] of entries) {
        const existing = paths[path];
        if (existing === undefined) {
          paths[path] = item;
        } else {
          mergePathItems(existing, item, path, resourceType.id);
        }
      }
      if (owner === undefined) {
        shapes.set(shape, {
          path: paths[route.base] === undefined ? entries[0][0] : route.base,
          resourceTypeId: resourceType.id,
        });
      }
    }
  }
  return paths;
}

interface RouteAlternative {
  path: string;
  resourceTypeId: string;
  item: PathItemObject;
}

const ROUTE_ALTERNATIVES_EXTENSION = "x-launchpad-route-alternatives";

/** OpenAPI does not permit differently named templates at the same path level. */
function pathShape(path: string): string {
  return path.replace(/\{[^/{}]+\}/g, "{}");
}

function addRouteAlternative(
  item: PathItemObject,
  alternative: RouteAlternative,
): void {
  const extensions = item as PathItemObject & {
    [ROUTE_ALTERNATIVES_EXTENSION]?: RouteAlternative[];
  };
  (extensions[ROUTE_ALTERNATIVES_EXTENSION] ??= []).push(alternative);
}

/** Merge disjoint methods, keeping conflicting operations inspectable. */
function mergePathItems(
  existing: PathItemObject,
  incoming: PathItemObject,
  path: string,
  resourceTypeId: string,
): void {
  for (const verb of HTTP_METHODS) {
    const operation = incoming[verb];
    if (operation === undefined) continue;
    if (existing[verb] === undefined) {
      existing[verb] = operation;
    } else {
      addRouteAlternative(existing, {
        path,
        resourceTypeId,
        item: { [verb]: operation },
      });
    }
  }
  const alternatives = (
    incoming as PathItemObject & {
      [ROUTE_ALTERNATIVES_EXTENSION]?: RouteAlternative[];
    }
  )[ROUTE_ALTERNATIVES_EXTENSION];
  if (alternatives !== undefined) {
    for (const alternative of alternatives)
      addRouteAlternative(existing, alternative);
  }
}

/** Resolve parent/suffix compositions once; bad catalog cycles fail explicitly. */
function resolveTemplates(
  resourceTypeId: string,
  resolved: Map<string, readonly string[]>,
  resolving: Set<string>,
): readonly string[] {
  const cached = resolved.get(resourceTypeId);
  if (cached !== undefined) return cached;
  if (resolving.has(resourceTypeId)) {
    throw new Error(`Cyclic Launchpad route correction at ${resourceTypeId}`);
  }
  const correction = ROUTE_CORRECTIONS[resourceTypeId];
  if (
    correction === undefined ||
    ROUTELESS_RESOURCE_TYPES[resourceTypeId] === true
  ) {
    return [];
  }
  resolving.add(resourceTypeId);
  try {
    const templates = new Set(correction.templates ?? []);
    if (correction.parents !== undefined) {
      if (correction.suffix === undefined) {
        throw new Error(`Missing route suffix for ${resourceTypeId}`);
      }
      for (const parent of correction.parents) {
        for (const template of resolveTemplates(parent, resolved, resolving)) {
          templates.add(`${template}/${correction.suffix}`);
        }
      }
    }
    const result = [...templates];
    resolved.set(resourceTypeId, result);
    return result;
  } finally {
    resolving.delete(resourceTypeId);
  }
}

/** Build the base and `ws.op` path entries for one resource route. */
function buildResourceTypeEntries(
  resourceType: WadlResourceType,
  resourcePath: ResourcePath,
  schemas: SchemasObject,
  variant: number | undefined,
  operationIds: Set<string>,
): [string, PathItemObject][] {
  const baseItem: PathItemObject = {};
  const namedItems: Record<string, PathItemObject> = {};
  const queryParameters = ROUTE_CORRECTIONS[resourceType.id]?.queryParameters;
  for (const method of resourceType.methods) {
    const verb = method.httpMethod.toLowerCase();
    if (!isHttpVerb(verb)) continue;
    if (method.wsOp !== undefined) {
      const operationPath = `${resourcePath.base}?ws.op=${method.wsOp}`;
      const item = (namedItems[operationPath] ??= {});
      const operation = buildNamedOperation({
        method,
        wsOp: method.wsOp,
        resourceTypeId: resourceType.id,
        pathParams: resourcePath.pathParams,
        schemas,
      });
      if (queryParameters !== undefined) {
        operation.parameters = [
          ...(operation.parameters ?? []),
          ...queryParameters,
        ];
      }
      setOperationId(
        operation,
        `${resourceType.id}-${method.wsOp}`,
        variant,
        operationIds,
      );
      mergePathItems(
        item,
        { [verb]: operation },
        operationPath,
        resourceType.id,
      );
      continue;
    }
    // Launchpad exposes POST through `ws.op`; unnamed POST is not callable.
    if (verb === "post") continue;
    const operation = buildStandardOperation({
      method,
      verb,
      resourceTypeId: resourceType.id,
      resourceTypeDoc: resourceType.doc,
      pathParams: resourcePath.pathParams,
      schemas,
    });
    if (queryParameters !== undefined) {
      operation.parameters = [
        ...(operation.parameters ?? []),
        ...queryParameters,
      ];
    }
    setOperationId(
      operation,
      `${resourceType.id}-${verb}`,
      variant,
      operationIds,
    );
    mergePathItems(
      baseItem,
      { [verb]: operation },
      resourcePath.base,
      resourceType.id,
    );
  }
  const entries: [string, PathItemObject][] = Object.entries(namedItems);
  if (Object.keys(baseItem).length) {
    entries.unshift([resourcePath.base, baseItem]);
  }
  return entries;
}

/** Keep WADL IDs on a sole route; suffix expanded routes and avoid ID reuse. */
function setOperationId(
  operation: OperationObject,
  fallback: string,
  variant: number | undefined,
  used: Set<string>,
): void {
  const original = operation.operationId;
  if (original === undefined && variant === undefined) return;
  const base = original ?? fallback;
  const candidate = variant === undefined ? base : `${base}-route-${variant}`;
  let id = candidate;
  let duplicate = 2;
  while (used.has(id)) id = `${candidate}-${duplicate++}`;
  operation.operationId = id;
  used.add(id);
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

/** Add exact service-root links without deriving URLs from WADL field names. */
function buildToplevelSegments(
  serviceRoot: WadlRepresentation | undefined,
  baseUrl: string,
  serviceRootLinks: Record<string, string> | undefined,
): Map<string, string[]> {
  const segments = new Map<string, string[]>();
  if (serviceRoot === undefined) return segments;
  for (const field of serviceRoot.fields) {
    const resourceTypeId = field.linkResourceType;
    if (resourceTypeId === undefined) continue;
    const runtimeLink = serviceRootLinks?.[field.name];
    if (typeof runtimeLink !== "string") continue;
    const prefix = `${baseUrl}/`;
    if (!runtimeLink.startsWith(prefix)) continue;
    const relative = runtimeLink.slice(prefix.length).replace(/\/$/, "");
    // A root self-link or query/fragment does not prove a resource route.
    if (
      relative &&
      !relative.startsWith("/") &&
      !relative.includes("?") &&
      !relative.includes("#")
    ) {
      const links = segments.get(resourceTypeId);
      if (links === undefined) segments.set(resourceTypeId, [relative]);
      else if (!links.includes(relative)) links.push(relative);
    }
  }
  return segments;
}

/** Convert a source-backed template into a path and example-bearing parameters. */
function buildResourcePath(
  resourceTypeId: string,
  template: string,
): ResourcePath {
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
      description: `The \`${name}\` segment of the ${resourceTypeId} resource URL. Supply the value for the resource you want to access; the example shows one possible value.`,
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
