/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { parseXml } from "@rgrove/parse-xml";
import { Result, type Result as ResultType } from "better-result";
import { WadlParseError } from "./errors.js";
import { WadlDocument } from "./model.js";
import { localName } from "./xml.js";

/**
 * Parse WADL XML into a typed document model.
 *
 * `@rgrove/parse-xml` provides typed nodes and a narrow undefined-entity hook.
 * This lets us resolve Launchpad's non-standard `nbsp` entity while every
 * other undefined entity and malformed XML remains a parse error.
 */
export default function parseWadl(
  xml: string,
): ResultType<WadlDocument, WadlParseError> {
  return Result.try({
    try: () =>
      parseXml(xml, {
        resolveUndefinedEntity: (entity) =>
          entity === "&nbsp;" ? " " : undefined,
      }),
    catch: (cause) =>
      new WadlParseError({
        message: `Not a valid WADL document: ${cause instanceof Error ? cause.message : String(cause)}`,
        cause,
      }),
  }).andThen((document) => {
    const application = document.root;
    if (application === null || localName(application.name) !== "application") {
      return Result.err(
        new WadlParseError({
          message:
            "Not a valid WADL document: missing <application> root element",
        }),
      );
    }
    return Result.ok(WadlDocument.fromXml(application));
  });
}
