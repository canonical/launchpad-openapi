/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { ConversionError } from "../errors.js";

/**
 * Register a complete naming path without normalizing its components again.
 * @note Updates the ID registry; collisions report both source definitions.
 */
export default function registerOperationId(
  id: string,
  sources: Map<string, string>,
  source: string,
): void {
  const previous = sources.get(id);
  if (previous !== undefined) {
    throw new ConversionError({
      message: `Conflicting Launchpad operation ID ${id}: ${previous} and ${source}`,
    });
  }
  sources.set(id, source);
}
