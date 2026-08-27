/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { Result, type Result as ResultType } from "better-result";
import type { WadlDocument } from "../wadl/index.js";
import {
  ABOUT_SERVICE_DOC,
  API_TITLE,
  HYPERMEDIA_NOTE,
  OPENAPI_VERSION,
} from "./constants.js";
import { ConversionError } from "./errors.js";
import buildPaths from "./buildPaths.js";
import buildSchemas from "./buildSchemas.js";
import type {
  GenerateOptions,
  InfoObject,
  OpenApiSpec,
  PathItemObject,
  TagObject,
} from "./types.js";

/**
 * Generate an OpenAPI 3.0.3 document from typed WADL values.
 *
 * Runtime service-root links resolve top-level collection paths.
 */
export default function generateOpenApi(
  model: WadlDocument,
  options: GenerateOptions = {},
): ResultType<OpenApiSpec, ConversionError> {
  if (!Object.keys(model.resourceTypes).length) {
    return Result.err(
      new ConversionError({
        message:
          "WADL contains no resource types; not a Launchpad web service description",
      }),
    );
  }

  const schemas = buildSchemas(model.representations);
  const paths = buildPaths(model, schemas, options.serviceRootLinks);
  // Launchpad API versions are the final segment of the base URL.
  const version =
    options.version ?? model.baseUrl.slice(model.baseUrl.lastIndexOf("/") + 1);
  return Result.ok({
    openapi: OPENAPI_VERSION,
    info: buildInfo(model, version),
    servers: [{ url: model.baseUrl }],
    tags: buildTags(paths),
    paths,
    components: { schemas },
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
function buildTags(paths: Record<string, PathItemObject>): TagObject[] {
  const names = new Set<string>();
  for (const path of Object.values(paths)) {
    for (const operation of Object.values(path)) {
      if (operation === undefined) continue;
      for (const tag of operation.tags ?? []) names.add(tag);
    }
  }
  return [...names].sort().map((name) => ({ name }));
}
