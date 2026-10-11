/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import type { ParameterObject } from "openapi3-ts/oas30";
import { ROUTE_CORRECTIONS, ROUTELESS_RESOURCE_TYPES } from "../constants.js";
import { ConversionError } from "../errors.js";
import type { ResourcePath, RouteTemplate } from "../types.js";

/** Match editable `{name=example}` path segments. */
const RESOURCE_PATH_PARAM_PATTERN = /^\{([^=}]+)=(.*)\}$/;

/**
 * Resolve canonical routes and supplement them with exact service-root aliases.
 * Matching aliases retain canonical naming metadata and path parameters.
 * @note - Updates the per-conversion template cache and cycle-detection set.
 */
export default function resolveResourceRoutes(
  resourceTypeId: string,
  links: readonly RouteTemplate[] | undefined,
  resolvedTemplates: Map<string, readonly RouteTemplate[]>,
  resolvingTypes: Set<string>,
): ResourcePath[] {
  const templates = resolveRouteTemplates(
    resourceTypeId,
    resolvedTemplates,
    resolvingTypes,
  );
  const canonicalRoutes = new Map<string, ResourcePath>();
  for (const template of templates) {
    const route = buildResourcePath(resourceTypeId, template);
    const existing = canonicalRoutes.get(route.base);
    if (existing !== undefined) {
      if (!haveSameNamespace(existing, route)) {
        throw new Error(
          `Conflicting Launchpad route labels for ${resourceTypeId} at ${route.base}`,
        );
      }
    } else {
      canonicalRoutes.set(route.base, route);
    }
  }
  const routes =
    links === undefined ? canonicalRoutes : new Map<string, ResourcePath>();
  // Runtime service-root links are additional concrete routes, not replacements
  // for the canonical variants of the same resource.
  if (links !== undefined) {
    for (const link of links) {
      const base = `/${link.template}`;
      const canonical = canonicalRoutes.get(base);
      const existing = routes.get(base);
      if (existing !== undefined) {
        if (canonical === undefined && !haveSameNamespace(existing, link)) {
          throw new ConversionError({
            message: `Conflicting Launchpad route labels for ${resourceTypeId} at ${base}`,
          });
        }
        continue;
      }
      routes.set(
        base,
        canonical ?? {
          base,
          pathParams: [],
          namespace: link.namespace,
        },
      );
    }
    for (const route of canonicalRoutes.values()) {
      if (!routes.has(route.base)) routes.set(route.base, route);
    }
  }

  return [...routes.values()];
}

/** Resolve parent/suffix compositions once; bad catalog cycles fail explicitly. */
function resolveRouteTemplates(
  resourceTypeId: string,
  resolved: Map<string, readonly RouteTemplate[]>,
  resolving: Set<string>,
): readonly RouteTemplate[] {
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
    const templates = new Map<string, RouteTemplate>();
    const addTemplate = (route: RouteTemplate): void => {
      const existing = templates.get(route.template);
      if (existing === undefined) {
        templates.set(route.template, route);
      } else if (!haveSameNamespace(existing, route)) {
        throw new Error(
          `Conflicting Launchpad route labels for ${resourceTypeId} at ${route.template}`,
        );
      }
    };
    for (const template of correction.templates ?? []) addTemplate(template);
    if (correction.parents !== undefined) {
      if (correction.suffix === undefined) {
        throw new Error(`Missing route suffix for ${resourceTypeId}`);
      }
      for (const parent of correction.parents) {
        for (const route of resolveRouteTemplates(
          parent.resourceType,
          resolved,
          resolving,
        )) {
          addTemplate({
            template: `${route.template}/${correction.suffix}`,
            namespace: [
              ...(parent.namespace ?? []),
              ...(route.namespace ?? []),
            ],
          });
        }
      }
    }
    const result = [...templates.values()];
    resolved.set(resourceTypeId, result);
    return result;
  } finally {
    resolving.delete(resourceTypeId);
  }
}

/** Convert a source-backed template into a path and example-bearing parameters. */
function buildResourcePath(
  resourceTypeId: string,
  route: RouteTemplate,
): ResourcePath {
  const pathParams: ParameterObject[] = [];
  const segments = route.template.split("/").map((segment) => {
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
  return {
    base: `/${segments.join("/")}`,
    pathParams,
    namespace: route.namespace,
  };
}

/** Compare declared contexts without normalizing away conflicting catalog spelling. */
function haveSameNamespace(
  left: ResourcePath | RouteTemplate,
  right: ResourcePath | RouteTemplate,
): boolean {
  const leftNamespace = left.namespace ?? [];
  const rightNamespace = right.namespace ?? [];
  return (
    leftNamespace.length === rightNamespace.length &&
    leftNamespace.every(
      (component, index) => component === rightNamespace[index],
    )
  );
}
