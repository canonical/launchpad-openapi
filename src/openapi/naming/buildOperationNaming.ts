/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import type { NamingPath, OperationNaming } from "../types.js";
import normalizeNamingPath from "./normalizeNamingPath.js";

/** Build an operation ID and its metadata from the same normalized naming path. */
export default function buildOperationNaming(
  path: NamingPath,
): OperationNaming {
  const namingPath = normalizeNamingPath(path);
  return {
    operationId: [
      namingPath.subject,
      ...namingPath.namespace,
      namingPath.operation,
    ].join("."),
    "x-launchpad-naming-path": namingPath,
  };
}
