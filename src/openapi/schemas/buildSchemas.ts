/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import type {
  ReferenceObject,
  SchemaObject,
  SchemasObject,
} from "openapi3-ts/oas30";
import {
  REDACTED_FIELD_VALUE,
  resolveRepresentationMetadata,
  type SerializedFieldMetadata,
  type WadlParam,
  type WadlRepresentation,
} from "../../wadl/index.js";
import {
  BRANCH_FULL_SCHEMA_ID,
  ENTRY_SELF_LINK_PATH,
  NULLABLE_BRANCH_SCHEMA_ID,
  RESOURCE_ENUM_CORRECTIONS,
} from "../constants.js";
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
  if (
    branchSchema !== undefined &&
    !("$ref" in branchSchema) &&
    branchSchema.type === "object" &&
    !(NULLABLE_BRANCH_SCHEMA_ID in schemas)
  ) {
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
  const serializedFields = resolveRepresentationMetadata(id);
  const enumCorrections = RESOURCE_ENUM_CORRECTIONS[id];
  const allowResponseNullability = id.endsWith("-full");
  const allowRedaction = !id.endsWith("-page");

  for (const field of representation.fields) {
    // `[*]` describes collection entries, not a direct object property.
    if (field.path?.includes("[*]")) continue;
    const metadata =
      serializedFields !== undefined &&
      Object.hasOwn(serializedFields, field.name)
        ? serializedFields[field.name]
        : undefined;
    const property = buildResourceFieldSchema(
      field,
      metadata,
      enumCorrections?.[field.name],
      allowRedaction,
      allowResponseNullability,
    );
    if (property.type === "array" && field.name === "entries" && entryItems) {
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

/** Fill absent types from serialized metadata; retain WADL shape and presence. */
function buildResourceFieldSchema(
  field: WadlParam,
  metadata: SerializedFieldMetadata | undefined,
  correction: readonly [string, string] | undefined,
  allowRedaction: boolean,
  allowResponseNullability: boolean,
): SchemaObject {
  const usesMetadataType =
    !field.hasExplicitType &&
    field.linkResourceType === undefined &&
    field.options === undefined &&
    metadata?.type !== undefined;
  const untypedSchema = usesMetadataType
    ? buildSerializedFieldSchema(metadata, allowResponseNullability)
    : {};
  const nullable = usesMetadataType
    ? untypedSchema.nullable === true
    : metadata?.nullable === true ||
      (allowResponseNullability && metadata?.responseNullable === true);
  const property = buildParamSchema(field, untypedSchema);
  if (correction !== undefined && property.type === "string") {
    const [normalized, wireValue] = correction;
    if (property.enum?.includes(normalized)) {
      property.enum = property.enum.map((value) =>
        value === normalized ? wireValue : value,
      );
      if (property.example === normalized) property.example = wireValue;
    }
  }
  if (nullable && property.type !== undefined) {
    property.nullable = true;
    if (property.enum !== undefined && !property.enum.includes(null)) {
      property.enum = [...property.enum, null];
    }
  }
  // Entry serialization catches Unauthorized before returning the field value.
  // Preserve that exact transport alternative, not an arbitrary string fallback.
  if (
    allowRedaction &&
    usesMetadataType &&
    property.type !== undefined &&
    property.type !== "string"
  ) {
    const schema: SchemaObject = {
      oneOf: [property, { type: "string", enum: [REDACTED_FIELD_VALUE] }],
    };
    if (property.description !== undefined) {
      schema.description = property.description;
      delete property.description;
    }
    if (property.example !== undefined) {
      schema.example = property.example;
      delete property.example;
    }
    return schema;
  }
  return property;
}

/** Convert recursive source metadata without leaking response-only flags. */
function buildSerializedFieldSchema(
  metadata: SerializedFieldMetadata,
  allowResponseNullability: boolean,
): SchemaObject {
  if (metadata.type === undefined) return {};
  const schema: SchemaObject = { type: metadata.type };
  if (metadata.format !== undefined) schema.format = metadata.format;
  if (
    metadata.nullable === true ||
    (allowResponseNullability && metadata.responseNullable === true)
  ) {
    schema.nullable = true;
  }
  if (metadata.items !== undefined) {
    schema.items = buildSerializedFieldSchema(
      metadata.items,
      allowResponseNullability,
    );
  }
  if (metadata.additionalProperties !== undefined) {
    schema.additionalProperties = buildSerializedFieldSchema(
      metadata.additionalProperties,
      allowResponseNullability,
    );
  }
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
