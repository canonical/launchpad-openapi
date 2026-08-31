/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { describe, expect, it } from "vitest";
import { sampleWadl } from "../../testing/fixtures.js";
import { generateOpenApi } from "../openapi/index.js";
import { parseWadl } from "../wadl/index.js";
import renderOpenApi from "./renderOpenApi.js";

const document = generateOpenApi(parseWadl(sampleWadl).unwrap()).unwrap();

describe("renderOpenApi", () => {
  it("renders pretty JSON with a trailing newline", () => {
    const output = renderOpenApi(document, "json");

    expect(output.endsWith("\n")).toBe(true);
    expect(JSON.parse(output)).toEqual(document);
    expect(output).toContain('\n  "openapi": "3.0.3"');
  });

  it("renders YAML without wrapping long lines", () => {
    const output = renderOpenApi(document, "yaml");

    expect(output.endsWith("\n")).toBe(true);
    expect(output).toContain("openapi: 3.0.3");
    expect(output).toContain("The service. Read the guide.");
  });
});
