/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import type { PathItemObject, SchemasObject } from "openapi3-ts/oas30";
import type { WadlDocument, WadlResourceType } from "../../wadl/index.js";
import { PAGE_RESOURCE_SUFFIX, ROUTE_CORRECTIONS } from "../constants.js";
import { ConversionError } from "../errors.js";
import registerOperationId from "../naming/registerOperationId.js";
import { buildStandardOperation } from "../operations/buildOperations.js";
import type { IdentifiedOperation, ResourcePath } from "../types.js";

/**
 * Compose scoped collection GETs from direct fields of the parent's full representation.
 * The page type owns the method and response; the parent owns naming and selectors.
 * @note - Registers operation IDs in the caller's per-conversion registry.
 */
export default function buildScopedCollectionPaths(
  model: WadlDocument,
  parent: WadlResourceType,
  route: ResourcePath,
  schemas: SchemasObject,
  operationIdSources: Map<string, string>,
): { path: string; resourceTypeId: string; item: PathItemObject }[] {
  const entries: {
    path: string;
    resourceTypeId: string;
    item: PathItemObject;
  }[] = [];
  const representationId = `${parent.id}-full`;
  const representation = model.representations[representationId];
  for (const field of representation?.fields ?? []) {
    if (!field.name.endsWith("_collection_link")) continue;
    // WADL may describe fields inside entries or other nested structures.
    // Only a direct property (or a declaration without a path) proves traversal.
    if (
      field.path !== undefined &&
      field.path !== `$['${field.name}']` &&
      field.path !== `$["${field.name}"]`
    )
      continue;
    const pageTypeId = field.linkResourceType;
    if (pageTypeId === undefined || !pageTypeId.endsWith(PAGE_RESOURCE_SUFFIX))
      continue;
    const pageType = model.resourceTypes[pageTypeId];
    if (pageType === undefined) continue;
    const collection = field.name.slice(0, -"_collection_link".length);
    const path = `${route.base}/${collection}`;
    for (const method of pageType.methods) {
      if (
        method.wsOp !== undefined ||
        method.httpMethod.toLowerCase() !== "get"
      )
        continue;
      const methodIdentity =
        method.id === undefined
          ? ""
          : ` (WADL method ${JSON.stringify(method.id)})`;
      const source = `${pageTypeId} ${method.httpMethod} ${path}${methodIdentity} from ${representationId} field ${JSON.stringify(field.name)}`;
      let operation: IdentifiedOperation;
      try {
        operation = buildStandardOperation({
          method,
          verb: "get",
          resourceTypeId: pageType.id,
          subject: parent.id,
          resourceTypeDoc: field.doc ?? pageType.doc,
          namespace: [...(route.namespace ?? []), collection],
          pathParams: route.pathParams,
          schemas,
        });
      } catch (error) {
        // Unsupported names need the same route and WADL provenance as collisions.
        if (!ConversionError.is(error)) throw error;
        throw new ConversionError({ message: `${error.message}: ${source}` });
      }
      const queryParameters = ROUTE_CORRECTIONS[parent.id]?.queryParameters;
      if (queryParameters !== undefined) {
        operation.parameters = [
          ...(operation.parameters ?? []),
          ...queryParameters,
        ];
      }
      registerOperationId(operation.operationId, operationIdSources, source);
      entries.push({
        path,
        resourceTypeId: pageTypeId,
        item: { get: operation },
      });
    }
  }
  return entries;
}
