/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { Result } from "better-result";
import { assert, describe, expect, it, vi } from "vitest";
import {
  emptyWadl,
  generatorEdgeWadl,
  sampleWadl,
  routeCorrectionsWadl,
  serviceRootLinks,
} from "../../../testing/fixtures.js";
import { parseWadl } from "../../wadl/index.js";
import { HYPERMEDIA_NOTE } from "../constants.js";
import type * as Constants from "../constants.js";
import { ConversionError } from "../errors.js";
import generateOpenApi from "./generateOpenApi.js";

describe("generateOpenApi", () => {
  describe("complete documents", () => {
    it("assembles resource and operation contracts from the sample WADL", () => {
      const model = parseWadl(sampleWadl).unwrap();
      const result = generateOpenApi(model, {
        version: "fixture",
        serviceRootLinks,
      });
      assert(Result.isOk(result));

      expect(result.value.openapi).toBe("3.0.3");
      expect(result.value.info.version).toBe("fixture");
      expect(result.value.servers).toEqual([
        { url: "https://api.launchpad.test/1.0" },
      ]);
      expect(result.value.components?.schemas?.["person-full"]).toMatchObject({
        type: "object",
        properties: {
          self_link: { type: "string", format: "uri" },
          name: { description: "The name." },
          subscription_policy: { type: "string", enum: ["Open", "Moderated"] },
        },
        required: ["name", "subscription_policy"],
      });
      expect(
        result.value.paths["/people"]?.get?.responses["200"],
      ).toMatchObject({
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/person-page" },
          },
        },
      });
      expect(
        result.value.paths["/people?ws.op=getByName"]?.get?.parameters,
      ).toMatchObject([
        {
          name: "name",
          in: "query",
          required: true,
          schema: { type: "string", example: "ubuntu" },
        },
      ]);
      expect(
        result.value.paths["/people/+me"]?.patch?.requestBody,
      ).toMatchObject({
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/person-diff" },
          },
        },
      });
    });

    it("derives the version from the base URL and handles untitled metadata", () => {
      const sample = generateOpenApi(parseWadl(sampleWadl).unwrap()).unwrap();
      const edge = generateOpenApi(
        parseWadl(generatorEdgeWadl).unwrap(),
      ).unwrap();

      expect(sample.info.version).toBe("1.0");
      expect(edge.info.version).toBe("devel");
      expect(edge.info.description).toBe(HYPERMEDIA_NOTE);
      expect(edge.tags).toEqual([{ name: "bug" }, { name: "service-root" }]);
    });
    it("reports WADL types that have no verified callable route", () => {
      const document = generateOpenApi(
        parseWadl(routeCorrectionsWadl).unwrap(),
      ).unwrap();

      expect(document["x-launchpad-route-coverage"]).toMatchObject({
        unresolved: ["unknown"],
        schemaOnly: ["git_target"],
      });
      expect(document.paths).not.toHaveProperty("/{unknown}");
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

    it("returns a typed error for conflicting service-root alias labels", () => {
      const model = parseWadl(sampleWadl).unwrap();
      const root = model.representations["service-root-json"];
      const alias = root?.fields.find((field) => field.name === "me_link");
      assert(root !== undefined && alias !== undefined);
      root.fields.push({ ...alias, name: "current_person_link" });

      const result = generateOpenApi(model, {
        serviceRootLinks: {
          me_link: `${model.baseUrl}/people/+me`,
          current_person_link: `${model.baseUrl}/people/+me`,
        },
      });

      assert(Result.isError(result));
      expect(result.error).toBeInstanceOf(ConversionError);
      expect(result.error.message).toContain("person");
      expect(result.error.message).toContain("/people/+me");
    });

    it("identifies both WADL methods when normalization collides on one route", () => {
      const model = parseWadl(sampleWadl).unwrap();
      const person = model.resourceTypes.person;
      const method = person?.methods.find(
        (candidate) => candidate.id === "person-get",
      );
      assert(person !== undefined && method !== undefined);
      person.methods.splice(
        0,
        person.methods.length,
        { ...method, id: "person-read_name" },
        { ...method, id: "person-readName" },
      );

      const result = generateOpenApi(model);

      assert(Result.isError(result));
      expect(result.error).toBeInstanceOf(ConversionError);
      expect(result.error.message).toContain("person.readName");
      expect(result.error.message).toContain("GET /{person}");
      expect(result.error.message).toContain('WADL method "person-read_name"');
      expect(result.error.message).toContain('WADL method "person-readName"');
    });

    it("returns a typed error for conflicting source operation names", () => {
      const model = parseWadl(
        sampleWadl.replace('id="person-get"', 'id="person-put"'),
      ).unwrap();

      const result = generateOpenApi(model);

      assert(Result.isError(result));
      expect(result.error).toBeInstanceOf(ConversionError);
      expect(result.error.message).toContain("person.put");
      expect(result.error.message).toContain("GET /{person}");
      expect(result.error.message).toContain("PUT /{person}");
    });
  });

  describe("invalid route catalog", () => {
    it("lets a cyclic route correction escape as an unexpected Error", async () => {
      vi.resetModules();
      vi.doMock("../constants.js", async (importOriginal) => {
        const constants = await importOriginal<typeof Constants>();
        return {
          ...constants,
          ROUTE_CORRECTIONS: {
            ...constants.ROUTE_CORRECTIONS,
            person: {
              parents: [{ resourceType: "person" }],
              suffix: "+child",
            },
          },
        };
      });
      try {
        // Reloading after doMock isolates the catalog; a static import is cached.
        const { default: generator } = await import("./generateOpenApi.js");
        let failure: unknown;
        try {
          generator(parseWadl(sampleWadl).unwrap());
        } catch (error) {
          failure = error;
        }

        assert(failure instanceof Error);
        expect(failure.constructor).toBe(Error);
        expect(failure.message).toMatch(/cyclic/i);
        expect(failure.message).toContain("person");
      } finally {
        vi.doUnmock("../constants.js");
        vi.resetModules();
      }
    });
  });
});
