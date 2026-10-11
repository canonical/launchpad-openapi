/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { ConversionError } from "../errors.js";
import type { NamingPath } from "../types.js";

function normalizeComponent(value: string, path: NamingPath): string {
  if (!/^[A-Za-z][A-Za-z0-9]*(?:[_-][A-Za-z0-9]+)*$/.test(value)) {
    throw new ConversionError({
      message: `Unsupported naming component ${JSON.stringify(value)} in ${JSON.stringify(path)}`,
    });
  }
  const words = value
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[ _-]/)
    .map((word) => word.toLowerCase());
  return words
    .map((word, index) =>
      index === 0 ? word : word[0].toUpperCase() + word.slice(1),
    )
    .join("");
}

/**
 * Normalize explicit naming components without inferring hierarchy or removing
 * repeated labels. Unsupported spelling fails with the source naming path.
 */
export default function normalizeNamingPath(path: NamingPath): NamingPath {
  return {
    subject: normalizeComponent(path.subject, path),
    namespace: path.namespace.map((value) => normalizeComponent(value, path)),
    operation: normalizeComponent(path.operation, path),
  };
}
