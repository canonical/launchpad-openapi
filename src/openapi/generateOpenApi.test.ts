/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { Result } from "better-result";
import { assert, describe, expect, it } from "vitest";
import {
  emptyWadl,
  generatorEdgeWadl,
  sampleWadl,
  serviceRootLinks,
} from "../../testing/fixtures.js";
import { parseWadl } from "../wadl/index.js";
import { HYPERMEDIA_NOTE } from "./constants.js";
import generateOpenApi from "./generateOpenApi.js";

describe("generateOpenApi", () => {
  describe("complete documents", () => {
    it("assembles the full document from the sample WADL", () => {
      const model = parseWadl(sampleWadl).unwrap();
      const result = generateOpenApi(model, {
        version: "fixture",
        serviceRootLinks,
      });
      assert(Result.isOk(result));

      expect(result.value).toMatchSnapshot();
    });

    it("derives the version from the base URL and handles untitled metadata", () => {
      const sample = generateOpenApi(parseWadl(sampleWadl).unwrap()).unwrap();
      const edge = generateOpenApi(parseWadl(generatorEdgeWadl).unwrap()).unwrap();

      expect(sample.info.version).toBe("1.0");
      expect(edge.info.version).toBe("devel");
      expect(edge.info.description).toBe(HYPERMEDIA_NOTE);
      expect(edge.tags).toEqual([
        { name: "bug" },
        { name: "service-root" },
        { name: "unknown" },
      ]);
    });
  });

  describe("invalid model", () => {
    it("returns a typed error when no resource types exist", () => {
      const result = generateOpenApi(parseWadl(emptyWadl).unwrap());

      assert(Result.isError(result));
      expect(result.error._tag).toBe("ConversionError");
      expect(result.error.message).toBe(
        "WADL contains no resource types; not a Launchpad web service description",
      );
    });
  });
});
