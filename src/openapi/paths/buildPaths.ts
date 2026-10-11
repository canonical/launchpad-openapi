/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import type {
  PathItemObject,
  PathsObject,
  SchemasObject,
} from "openapi3-ts/oas30";
import type { WadlDocument, WadlResourceType } from "../../wadl/index.js";
import {
  HTTP_METHODS,
  PAGE_RESOURCE_SUFFIX,
  ROUTE_CORRECTIONS,
  ROUTELESS_RESOURCE_TYPES,
  SERVICE_ROOT_REPRESENTATION,
  SERVICE_ROOT_TYPE,
  SPECIAL_RESOURCE_TYPES,
} from "../constants.js";
import {
  buildNamedOperation,
  buildStandardOperation,
} from "../operations/buildOperations.js";
import buildOperationNaming from "../naming/buildOperationNaming.js";
import registerOperationId from "../naming/registerOperationId.js";
import {
  buildOkResponse,
  buildStandardResponses,
} from "../responses/buildResponses.js";
import type {
  IdentifiedOperation,
  ResourcePath,
  RouteTemplate,
  SupportedHttpMethod,
} from "../types.js";
import resolveResourceRoutes from "./resolveResourceRoutes.js";
import resolveServiceRootLinks from "./resolveServiceRootLinks.js";

/**
 * Build paths from the canonical route catalog and service-root links.
 *
 * Internal, collection-page, and unaddressable marker resource types are omitted.
 * Data-dependent naming conflicts throw ConversionError.
 */
export default function buildPaths(
  model: WadlDocument,
  schemas: SchemasObject,
  serviceRootLinks?: Record<string, string>,
): PathsObject {
  const serviceRootRoutes = resolveServiceRootLinks(
    model.representations[SERVICE_ROOT_REPRESENTATION],
    model.baseUrl,
    serviceRootLinks,
  );
  const serviceRoot = model.resourceTypes[SERVICE_ROOT_TYPE];
  const paths: PathsObject = {};
  const pathOwners = new Map<
    string,
    { path: string; resourceTypeId: string }
  >();
  const resolvedTemplates = new Map<string, readonly RouteTemplate[]>();
  const resolvingTypes = new Set<string>();
  const operationIdSources = new Map<string, string>();
  if (serviceRoot) {
    const rootPath = buildServiceRootGetPath(serviceRoot, schemas);
    paths["/"] = rootPath;
    pathOwners.set("/", { path: "/", resourceTypeId: SERVICE_ROOT_TYPE });
    registerOperationId(
      rootPath.get.operationId,
      operationIdSources,
      "service-root GET /",
    );
  }

  for (const resourceType of Object.values(model.resourceTypes)) {
    if (
      SPECIAL_RESOURCE_TYPES.has(resourceType.id) ||
      ROUTELESS_RESOURCE_TYPES[resourceType.id] === true ||
      resourceType.id.endsWith(PAGE_RESOURCE_SUFFIX)
    )
      continue;

    const routes = resolveResourceRoutes(
      resourceType.id,
      serviceRootRoutes.get(resourceType.id),
      resolvedTemplates,
      resolvingTypes,
    );

    for (const route of routes) {
      const entries = buildResourceTypeEntries(
        resourceType,
        route,
        schemas,
        operationIdSources,
      );
      if (entries.length === 0) continue;
      const shape = getPathShape(route.base);
      const owner = pathOwners.get(shape);
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
        pathOwners.set(shape, {
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
function getPathShape(path: string): string {
  return path.replace(/\{[^/{}]+\}/g, "{}");
}

/**
 * Preserve a route that cannot occupy its own OpenAPI path slot.
 * @note - Appends to the path item being assembled by the caller.
 */
function addRouteAlternative(
  item: PathItemObject,
  alternative: RouteAlternative,
): void {
  const extensions = item as PathItemObject & {
    [ROUTE_ALTERNATIVES_EXTENSION]?: RouteAlternative[];
  };
  (extensions[ROUTE_ALTERNATIVES_EXTENSION] ??= []).push(alternative);
}

/**
 * Merge disjoint methods, keeping conflicting operations inspectable.
 * @note - Mutates the existing path item being assembled by the caller.
 */
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

/** Build the base and `ws.op` path entries for one resource route. */
function buildResourceTypeEntries(
  resourceType: WadlResourceType,
  resourcePath: ResourcePath,
  schemas: SchemasObject,
  operationIdSources: Map<string, string>,
): [string, PathItemObject][] {
  const baseItem: PathItemObject = {};
  const namedItems: Record<string, PathItemObject> = {};
  const queryParameters = ROUTE_CORRECTIONS[resourceType.id]?.queryParameters;
  for (const method of resourceType.methods) {
    const verb = method.httpMethod.toLowerCase();
    if (!isHttpVerb(verb)) continue;
    // Launchpad exposes POST through `ws.op`; unnamed POST is not callable.
    if (method.wsOp === undefined && verb === "post") continue;

    const operationArgs = {
      method,
      resourceTypeId: resourceType.id,
      namespace: resourcePath.namespace,
      pathParams: resourcePath.pathParams,
      schemas,
    };
    const operation =
      method.wsOp === undefined
        ? buildStandardOperation({
            ...operationArgs,
            verb,
            resourceTypeDoc: resourceType.doc,
          })
        : buildNamedOperation({ ...operationArgs, wsOp: method.wsOp });
    if (queryParameters !== undefined) {
      operation.parameters = [
        ...(operation.parameters ?? []),
        ...queryParameters,
      ];
    }
    const operationPath =
      method.wsOp === undefined
        ? resourcePath.base
        : `${resourcePath.base}?ws.op=${method.wsOp}`;
    const methodIdentity =
      method.id === undefined
        ? ""
        : ` (WADL method ${JSON.stringify(method.id)})`;
    registerOperationId(
      operation.operationId,
      operationIdSources,
      `${resourceType.id} ${method.httpMethod} ${operationPath}${methodIdentity}`,
    );
    const item =
      method.wsOp === undefined ? baseItem : (namedItems[operationPath] ??= {});
    mergePathItems(item, { [verb]: operation }, operationPath, resourceType.id);
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
): PathItemObject & { get: IdentifiedOperation } {
  const method = resourceType.methods.find(
    (candidate) =>
      candidate.wsOp === undefined &&
      candidate.httpMethod.toLowerCase() === "get",
  );
  let responses: IdentifiedOperation["responses"];
  if (method?.responses.some((response) => response.statusCodes.length > 0)) {
    responses = buildStandardResponses(method.responses, schemas, "get");
  } else {
    responses = {
      "200": buildOkResponse(
        SERVICE_ROOT_REPRESENTATION in schemas
          ? { $ref: `#/components/schemas/${SERVICE_ROOT_REPRESENTATION}` }
          : undefined,
      ),
    };
  }
  return {
    get: {
      tags: [SERVICE_ROOT_TYPE],
      summary: "The root of the web service.",
      ...buildOperationNaming({
        subject: SERVICE_ROOT_TYPE,
        namespace: [],
        operation: "get",
      }),
      responses,
    },
  };
}

/** Narrow an arbitrary WADL method name to a supported OpenAPI HTTP verb. */
function isHttpVerb(value: string): value is SupportedHttpMethod {
  return HTTP_METHODS.some((method) => method === value);
}
