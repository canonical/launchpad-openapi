/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import type { SerializedFieldMetadata } from "../types.js";
import { RESOURCE_FIELD_METADATA } from "./constants.js";

// lazr.restful's collection representation fields, independent of entry fields.
const COLLECTION_FIELDS: Readonly<Record<string, SerializedFieldMetadata>> = {
  total_size: { type: "integer" },
  start: { type: "integer" },
  entries: { type: "array", items: { type: "object" } },
};

/**
 * Resolve serialized field metadata before constructing representation schemas.
 *
 * Full, diff, and write declarations share the exported entry interface, not
 * their WADL required flags. Pages use the collection serializer instead;
 * unknown representations are not assigned another resource's field types.
 */
export default function resolveRepresentationMetadata(
  representationId: string,
): Readonly<Record<string, SerializedFieldMetadata>> | undefined {
  if (representationId.endsWith("-page")) return COLLECTION_FIELDS;
  const match = /^(.*)-(?:full|diff|write)$/.exec(representationId);
  if (match === null) return undefined;
  const resourceType = match[1];
  return Object.hasOwn(RESOURCE_FIELD_METADATA, resourceType)
    ? RESOURCE_FIELD_METADATA[resourceType]
    : undefined;
}
