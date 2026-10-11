/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import type {
  InfoObject,
  OpenAPIObject,
  PathsObject,
  TagObject,
} from "openapi3-ts/oas30";
import { Result, type Result as ResultType } from "better-result";
import type { WadlDocument } from "../../wadl/index.js";
import {
  ABOUT_SERVICE_DOC,
  API_TITLE,
  HYPERMEDIA_NOTE,
  OPENAPI_VERSION,
  HTTP_METHODS,
  PAGE_RESOURCE_SUFFIX,
  ROUTELESS_RESOURCE_TYPES,
  SPECIAL_RESOURCE_TYPES,
} from "../constants.js";
import { ConversionError } from "../errors.js";
import buildPaths from "../paths/buildPaths.js";
import buildSchemas from "../schemas/buildSchemas.js";
import type { GenerateOptions } from "../types.js";

/**
 * Generate an OpenAPI 3.0.3 document from typed WADL values.
 *
 * Exact runtime service-root links supplement reviewed canonical routes;
 * unresolved WADL types are reported instead of assigned invented URLs.
 * Naming conflicts in input return ConversionError; catalog defects remain exceptions.
 */
export default function generateOpenApi(
  model: WadlDocument,
  options: GenerateOptions = {},
): ResultType<OpenAPIObject, ConversionError> {
  if (!Object.keys(model.resourceTypes).length) {
    return Result.err(
      new ConversionError({
        message:
          "WADL contains no resource types; not a Launchpad web service description",
      }),
    );
  }
  const schemas = buildSchemas(model.representations);
  let paths: PathsObject;
  try {
    paths = buildPaths(model, schemas, options.serviceRootLinks);
  } catch (cause) {
    if (cause instanceof ConversionError) return Result.err(cause);
    throw cause;
  }
  // Launchpad API versions are the final segment of the base URL.
  const version =
    options.version ?? model.baseUrl.slice(model.baseUrl.lastIndexOf("/") + 1);
  const routeCoverage = buildRouteCoverage(model, paths);
  return Result.ok({
    openapi: OPENAPI_VERSION,
    info: buildInfo(model, version),
    servers: [{ url: model.baseUrl }],
    tags: buildTags(paths),
    paths,
    components: { schemas },
    "x-launchpad-route-coverage": routeCoverage,
  });
}

/** Build metadata from titled WADL documentation in source order. */
function buildInfo(model: WadlDocument, version: string): InfoObject {
  const descriptionParts: string[] = [];
  const aboutService = model.docs.find(
    (doc) => doc.title === ABOUT_SERVICE_DOC,
  );
  if (aboutService !== undefined) descriptionParts.push(aboutService.text);
  for (const doc of model.docs) {
    if (doc.title !== undefined && doc.title !== ABOUT_SERVICE_DOC) {
      descriptionParts.push(`**${doc.title}**\n\n${doc.text}`);
    }
  }
  descriptionParts.push(HYPERMEDIA_NOTE);
  return {
    title: API_TITLE,
    version,
    description: descriptionParts.join("\n\n"),
  };
}

/** Collect sorted, de-duplicated operation tags from every generated path. */
function buildTags(paths: PathsObject): TagObject[] {
  const names = new Set<string>();
  for (const path of Object.values(paths)) {
    for (const method of HTTP_METHODS) {
      const operation = path[method];
      if (operation === undefined) continue;
      for (const tag of operation.tags ?? []) names.add(tag);
    }
  }
  return [...names].sort().map((name) => ({ name }));
}

/** Report resource types for which no independently callable URL was verified. */
function buildRouteCoverage(model: WadlDocument, paths: PathsObject) {
  const represented = new Set<string>();
  for (const item of Object.values(paths)) {
    for (const method of HTTP_METHODS) {
      for (const tag of item[method]?.tags ?? []) represented.add(tag);
    }
    const alternatives = item["x-launchpad-route-alternatives"];
    if (Array.isArray(alternatives)) {
      for (const alternative of alternatives) {
        if (
          typeof alternative === "object" &&
          alternative !== null &&
          "resourceTypeId" in alternative &&
          typeof alternative.resourceTypeId === "string"
        ) {
          represented.add(alternative.resourceTypeId);
        }
      }
    }
  }
  const unresolved: string[] = [];
  const schemaOnly: string[] = [];
  for (const resourceType of Object.values(model.resourceTypes)) {
    const id = resourceType.id;
    if (SPECIAL_RESOURCE_TYPES.has(id) || id.endsWith(PAGE_RESOURCE_SUFFIX)) {
      continue;
    }
    if (ROUTELESS_RESOURCE_TYPES[id] === true) {
      schemaOnly.push(id);
    } else if (!represented.has(id)) {
      unresolved.push(id);
    }
  }
  return { unresolved, schemaOnly };
}
