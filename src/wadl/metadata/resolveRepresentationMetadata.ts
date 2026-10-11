/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import type { SerializedFieldMetadata } from "../types.js";
import { RESOURCE_FIELD_METADATA } from "./constants.js";

// lazr.restful's serializers write the fields below themselves, so exported
// interfaces, and therefore the generated catalog, never declare them. WADL
// still decides which ones a representation carries and whether they are
// required; a WADL link target stays more specific than a plain URI.
const URI_FIELD: SerializedFieldMetadata = { type: "string", format: "uri" };

// EntryResource.toDataStructure: absoluteURL links, type_url, and the entry
// ETag, which is always a computed quoted string.
const ENTRY_FIELDS: Readonly<Record<string, SerializedFieldMetadata>> = {
  self_link: URI_FIELD,
  web_link: URI_FIELD,
  resource_type_link: URI_FIELD,
  http_etag: { type: "string" },
};

// BatchingResourceMixin.batch, plus CollectionResource.batch's type_url.
const COLLECTION_FIELDS: Readonly<Record<string, SerializedFieldMetadata>> = {
  resource_type_link: URI_FIELD,
  total_size: { type: "integer" },
  total_size_link: URI_FIELD,
  start: { type: "integer" },
  next_collection_link: URI_FIELD,
  prev_collection_link: URI_FIELD,
  entries: { type: "array", items: { type: "object" } },
};

// ServiceRootResource.toDataForJSON; its top-level links have WADL targets.
const SERVICE_ROOT_FIELDS: Readonly<Record<string, SerializedFieldMetadata>> = {
  resource_type_link: URI_FIELD,
};

/**
 * Resolve serialized field metadata before constructing representation schemas.
 *
 * Full, diff, and write declarations share the exported entry interface, not
 * their WADL required flags. Every entry, catalogued or not, also carries the
 * entry serializer's own fields. Pages and the service root use their own
 * serializers; unknown representations are not assigned another resource's
 * field types.
 */
export default function resolveRepresentationMetadata(
  representationId: string,
): Readonly<Record<string, SerializedFieldMetadata>> | undefined {
  if (representationId === "service-root-json") return SERVICE_ROOT_FIELDS;
  if (representationId.endsWith("-page")) return COLLECTION_FIELDS;
  const match = /^(.*)-(?:full|diff|write)$/.exec(representationId);
  if (match === null) return undefined;
  const resourceType = match[1];
  // No exported interface field reuses a serializer field name, so the merge
  // order does not change any type.
  return Object.hasOwn(RESOURCE_FIELD_METADATA, resourceType)
    ? { ...ENTRY_FIELDS, ...RESOURCE_FIELD_METADATA[resourceType] }
    : ENTRY_FIELDS;
}
