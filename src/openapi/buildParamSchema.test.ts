/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { assert, describe, expect, it } from "vitest";
import { sampleWadl } from "../../testing/fixtures.js";
import { parseWadl } from "../wadl/index.js";
import buildParamSchema from "./buildParamSchema.js";

describe("buildParamSchema", () => {
  describe("WADL parameter kinds", () => {
    it("maps links, enums, pagination values, arrays, and strings", () => {
      const model = parseWadl(sampleWadl).unwrap();
      const fullFields = model.representations["person-full"]?.fields;
      const pageFields = model.representations["person-page"]?.fields;
      assert(fullFields !== undefined);
      assert(pageFields !== undefined);

      expect(buildParamSchema(fullFields[0])).toEqual({
        type: "string",
        format: "uri",
        "x-lp-resource-type": "person",
        description: "The canonical URL.",
      });
      expect(buildParamSchema(fullFields[2])).toEqual({
        type: "string",
        enum: ["Open", "Moderated"],
        example: "Open",
      });
      expect(buildParamSchema(pageFields[0])).toEqual({
        type: "integer",
        example: 1,
      });
      expect(buildParamSchema(pageFields[2])).toEqual({
        type: "array",
        items: { type: "object" },
        example: [],
      });
      expect(buildParamSchema(fullFields[1])).toEqual({
        type: "string",
        description: "The name.",
        example: "ubuntu",
      });
    });
  });
});
