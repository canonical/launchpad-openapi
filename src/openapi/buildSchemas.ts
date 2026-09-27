/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import type {
  ReferenceObject,
  SchemaObject,
  SchemasObject,
} from "openapi3-ts/oas30";
import type { WadlParam, WadlRepresentation } from "../wadl/index.js";
import {
  BRANCH_FULL_SCHEMA_ID,
  ENTRY_SELF_LINK_PATH,
  NULLABLE_BRANCH_SCHEMA_ID,
  REVIEWED_RESOURCE_FIELDS,
} from "./constants.js";
import buildParamSchema from "./buildParamSchema.js";

/** Build reusable component schemas from WADL JSON representations. */
export default function buildSchemas(
  representations: Record<string, WadlRepresentation>,
): SchemasObject {
  const schemaIds = new Set(Object.keys(representations));
  const schemas: SchemasObject = {};
  for (const [id, representation] of Object.entries(representations)) {
    schemas[id] = buildRepresentationSchema(id, representation, schemaIds);
  }
  const branchSchema = schemas[BRANCH_FULL_SCHEMA_ID];
  const isObjectBranchSchema =
    branchSchema !== undefined &&
    !("$ref" in branchSchema) &&
    branchSchema.type === "object";
  if (isObjectBranchSchema && !(NULLABLE_BRANCH_SCHEMA_ID in schemas)) {
    schemas[NULLABLE_BRANCH_SCHEMA_ID] = { ...branchSchema, nullable: true };
  }
  return schemas;
}

/** Build one representation and its collection item schema. */
function buildRepresentationSchema(
  id: string,
  representation: WadlRepresentation,
  schemaIds: Set<string>,
): SchemaObject {
  const properties: Record<string, SchemaObject> = {};
  const required: string[] = [];
  const entryItems = findEntryItemsSchema(representation.fields, schemaIds);
  const reviewedFields = REVIEWED_RESOURCE_FIELDS[id];

  for (const field of representation.fields) {
    // `[*]` describes collection entries, not a direct object property.
    if (field.path?.includes("[*]")) continue;
    let fieldType:
      | "integer"
      | "boolean"
      | "string-array"
      | "object"
      | "unknown" = "unknown";
    if (reviewedFields?.integer?.includes(field.name)) {
      fieldType = "integer";
    } else if (reviewedFields?.boolean?.includes(field.name)) {
      fieldType = "boolean";
    } else if (reviewedFields?.stringArray?.includes(field.name)) {
      fieldType = "string-array";
    } else if (reviewedFields?.object?.includes(field.name)) {
      fieldType = "object";
    }
    const property = buildParamSchema(
      field,
      fieldType,
      reviewedFields?.nullable?.includes(field.name) ?? false,
    );
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
): ReferenceObject | undefined {
  const entryLink = fields.find((field) => field.path === ENTRY_SELF_LINK_PATH);
  if (entryLink?.linkResourceType === undefined) return undefined;
  const schemaId = `${entryLink.linkResourceType}-full`;
  return schemaIds.has(schemaId)
    ? { $ref: `#/components/schemas/${schemaId}` }
    : undefined;
}
