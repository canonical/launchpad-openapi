/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { stringify as stringifyYaml } from "yaml";
import type { OpenAPIObject } from "../openapi/index.js";
import type { OutputFormat } from "./schemas.js";

/**
 * Serialize an OpenAPI document with stable, diff-friendly formatting.
 *
 * JSON uses two-space indentation. Both formats end with a newline.
 */
export default function renderOpenApi(
  document: OpenAPIObject,
  format: OutputFormat,
): string {
  return format === "json"
    ? `${JSON.stringify(document, null, 2)}\n`
    : stringifyYaml(document, { lineWidth: 0 });
}
