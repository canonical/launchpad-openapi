/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import type { WadlParam } from "../wadl/index.js";
import { EXAMPLE_BY_PARAM, INTEGER_PARAM_NAMES } from "./constants.js";
import type { SchemaObject } from "./types.js";

/** Convert a WADL parameter into an OpenAPI schema fragment. */
export default function buildParamSchema(param: WadlParam): SchemaObject {
  let schema: SchemaObject;
  if (param.linkResourceType !== undefined) {
    schema = {
      type: "string",
      format: "uri",
      "x-lp-resource-type": param.linkResourceType,
    };
  } else if (param.options !== undefined) {
    schema = { type: "string", enum: param.options };
  } else if (INTEGER_PARAM_NAMES.has(param.name)) {
    schema = { type: "integer" };
  } else if (param.name === "entries") {
    schema = { type: "array", items: { type: "object" } };
  } else {
    schema = { type: "string" };
  }
  if (param.doc !== undefined) schema.description = param.doc;
  if (param.required) schema.example = buildParamExample(param.name, schema);
  return schema;
}

/** Choose a curated, enum, or type-based parameter example. */
function buildParamExample(name: string, schema: SchemaObject): unknown {
  const curated = EXAMPLE_BY_PARAM[name];
  if (curated !== undefined) return curated;
  if (schema.enum?.length) return schema.enum[0];
  if (schema.type === "integer") return 1;
  if (schema.type === "array") return [];
  return name;
}
