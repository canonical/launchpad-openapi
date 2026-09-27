/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import type { WadlParam } from "../wadl/index.js";
import { EXAMPLE_BY_PARAM, INTEGER_PARAM_NAMES } from "./constants.js";
import type { SchemaObject } from "openapi3-ts/oas30";

const XSD_NAMESPACE = "http://www.w3.org/2001/XMLSchema";

/** Map only datatypes whose OpenAPI scalar semantics are known. */
function xsdSchema(dataType: WadlParam["dataType"]): SchemaObject | undefined {
  if (dataType?.namespaceUri !== XSD_NAMESPACE) return undefined;
  switch (dataType.name) {
    case "string":
      return { type: "string" };
    case "boolean":
      return { type: "boolean" };
    case "int":
    case "integer":
    case "long":
    case "short":
    case "byte":
    case "nonNegativeInteger":
    case "positiveInteger":
    case "nonPositiveInteger":
    case "negativeInteger":
    case "unsignedInt":
    case "unsignedLong":
    case "unsignedShort":
    case "unsignedByte":
      return { type: "integer" };
    case "decimal":
    case "double":
    case "float":
      return { type: "number" };
    case "date":
      return { type: "string", format: "date" };
    case "dateTime":
      return { type: "string", format: "date-time" };
    case "anyURI":
      return { type: "string", format: "uri" };
    case "base64Binary":
      return { type: "string", format: "byte" };
    default:
      return undefined;
  }
}

/** Convert a WADL parameter into an OpenAPI schema fragment. */
export default function buildParamSchema(param: WadlParam): SchemaObject {
  let item: SchemaObject;
  if (param.linkResourceType !== undefined) {
    item = {
      type: "string",
      format: "uri",
      "x-lp-resource-type": param.linkResourceType,
    };
  } else {
    const dataTypeSchema = xsdSchema(param.dataType);
    if (dataTypeSchema !== undefined) {
      item = dataTypeSchema;
      if (param.options !== undefined) {
        // XML option values are strings; convert them only when every value
        // is representable by the declared scalar type.
        if (item.type === "integer" || item.type === "number") {
          const values = param.options.map(Number);
          if (
            values.every((value) =>
              item.type === "integer"
                ? Number.isSafeInteger(value)
                : Number.isFinite(value),
            )
          ) {
            item.enum = values;
          } else {
            item = { type: "string", enum: param.options };
          }
        } else if (item.type === "boolean") {
          if (
            param.options.every(
              (value) => value === "true" || value === "false",
            )
          ) {
            item.enum = param.options.map((value) => value === "true");
          } else {
            item = { type: "string", enum: param.options };
          }
        } else {
          item.enum = param.options;
        }
      }
    } else if (param.options !== undefined) {
      item = { type: "string", enum: param.options };
    } else if (INTEGER_PARAM_NAMES.has(param.name)) {
      item = { type: "integer" };
    } else if (param.name === "entries") {
      item = { type: "array", items: { type: "object" } };
    } else {
      item = { type: "string" };
    }
  }
  const schema: SchemaObject =
    param.repeating && item.type !== "array"
      ? { type: "array", items: item }
      : item;
  if (param.doc !== undefined) schema.description = param.doc;
  if (param.required) {
    const example = buildParamExample(param.name, schema);
    if (example !== undefined) schema.example = example;
  }
  return schema;
}

/** Choose a curated, enum, or type-based parameter example. */
function buildParamExample(name: string, schema: SchemaObject): unknown {
  if (schema.type === "array") return [];
  if (schema.enum?.length) return schema.enum[0];
  if (schema.type === "integer" || schema.type === "number") return 1;
  if (schema.type === "boolean") return true;
  if (schema.format === "byte") return "YQ==";
  if (schema.format === "date") return "2026-01-01";
  if (schema.format === "date-time") return "2026-01-01T00:00:00Z";
  const curatedExample = EXAMPLE_BY_PARAM[name];
  if (schema.format === "uri") {
    const hasUriScheme =
      curatedExample !== undefined &&
      /^[a-z][a-z\d+.-]*:/i.test(curatedExample);
    if (!hasUriScheme) return undefined;
  }
  return curatedExample ?? name;
}
