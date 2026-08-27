/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import type { WadlParam, WadlRepresentation } from "../wadl/index.js";
import { ENTRY_SELF_LINK_PATH } from "./constants.js";
import buildParamSchema from "./buildParamSchema.js";
import type { SchemaObject } from "./types.js";

/** Build reusable component schemas from WADL JSON representations. */
export default function buildSchemas(
  representations: Record<string, WadlRepresentation>,
): Record<string, SchemaObject> {
  const schemaIds = new Set(Object.keys(representations));
  const schemas: Record<string, SchemaObject> = {};
  for (const [id, representation] of Object.entries(representations)) {
    schemas[id] = buildRepresentationSchema(representation, schemaIds);
  }
  return schemas;
}

/** Build one representation and its collection item schema. */
function buildRepresentationSchema(
  representation: WadlRepresentation,
  schemaIds: Set<string>,
): SchemaObject {
  const properties: Record<string, SchemaObject> = {};
  const required: string[] = [];
  const entryItems = findEntryItemsSchema(representation.fields, schemaIds);

  for (const field of representation.fields) {
    // `[*]` describes collection entries, not a direct object property.
    if (field.path?.includes("[*]")) continue;
    const property = buildParamSchema(field);
    if (field.name === "entries" && entryItems) {
      property.items = entryItems;
    }
    properties[field.name] = property;
    if (field.required) required.push(field.name);
  }

  const schema: SchemaObject = { type: "object" };
  if (Object.keys(properties).length) schema.properties = properties;
  if (required.length) schema.required = required;
  return schema;
}

/** Resolve `entries.items` from an existing entry `-full` component. */
function findEntryItemsSchema(
  fields: WadlParam[],
  schemaIds: Set<string>,
): SchemaObject | undefined {
  const entryLink = fields.find(
    (field) => field.path === ENTRY_SELF_LINK_PATH,
  );
  if (entryLink?.linkResourceType === undefined) return undefined;
  const schemaId = `${entryLink.linkResourceType}-full`;
  return schemaIds.has(schemaId)
    ? { $ref: `#/components/schemas/${schemaId}` }
    : undefined;
}
