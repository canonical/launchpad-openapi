/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { describe, expect, it } from "vitest";
import {
  curatedPathsWadl,
  generatorEdgeWadl,
  sampleWadl,
  serviceRootLinks,
} from "../../testing/fixtures.js";
import { parseWadl } from "../wadl/index.js";
import buildPaths from "./buildPaths.js";
import buildSchemas from "./buildSchemas.js";

describe("buildPaths", () => {
  describe("service root and top-level resources", () => {
    it("builds the service root and fallback collection paths", () => {
      const model = parseWadl(sampleWadl).unwrap();
      const paths = buildPaths(model, buildSchemas(model.representations));

      expect(paths["/"]?.get).toMatchObject({
        tags: ["service-root"],
        operationId: "service-root-get",
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/service-root-json",
                },
              },
            },
          },
        },
      });
      expect(paths).toHaveProperty("/people");
      expect(paths).toHaveProperty("/me");
    });

    it("prefers usable runtime links and falls back from unusable ones", () => {
      const model = parseWadl(sampleWadl).unwrap();
      const schemas = buildSchemas(model.representations);
      const runtimePaths = buildPaths(model, schemas, serviceRootLinks);
      const invalidPaths = buildPaths(model, schemas, {
        people_collection_link: "https://other.test/people",
        me_link: `${model.baseUrl}#fragment`,
      });
      const emptyPaths = buildPaths(model, schemas, {
        people_collection_link: model.baseUrl,
        me_link: `${model.baseUrl}/people/+me/`,
      });

      expect(runtimePaths).toHaveProperty("/people");
      expect(runtimePaths).toHaveProperty("/people/+me");
      expect(invalidPaths).toHaveProperty("/people");
      expect(invalidPaths).toHaveProperty("/me");
      expect(emptyPaths).toHaveProperty("/people");
      expect(emptyPaths).toHaveProperty("/people/+me");
    });

    it("emits a body-less root response when its schema is absent", () => {
      const model = parseWadl(sampleWadl).unwrap();
      expect(buildPaths(model, {})["/"]?.get?.responses["200"]).toEqual({
        description: "Successful response",
      });
    });
  });

  describe("resource paths", () => {
    it("builds standard and named operations on top-level paths", () => {
      const model = parseWadl(sampleWadl).unwrap();
      const paths = buildPaths(
        model,
        buildSchemas(model.representations),
        serviceRootLinks,
      );

      expect(paths["/people"]?.get?.summary).toBe("List people");
      expect(paths["/people?ws.op=getByName"]?.get?.operationId).toBe(
        "people-getByName",
      );
      expect(paths["/people?ws.op=newTeam"]?.post?.requestBody).toBeDefined();
      expect(paths["/people/+me"]).toMatchObject({
        get: { summary: "Get person" },
        put: { summary: "Replace person" },
        patch: { summary: "Update person" },
        delete: { summary: "Delete person" },
      });
      expect(paths["/people/+me?ws.op=getMembers"]?.get).toBeDefined();
    });

    it("uses numeric curated strings as examples, not defaults, on standard and named operations", () => {
      const model = parseWadl(generatorEdgeWadl).unwrap();
      const paths = buildPaths(model, buildSchemas(model.representations));
      const standard = paths["/bugs/{id}"]?.get;
      const named = paths["/bugs/{id}?ws.op=isActive"]?.get;

      expect(standard?.operationId).toBe("bug-get");
      expect(named?.operationId).toBe("bug-isActive");
      for (const operation of [standard, named]) {
        const parameters = operation?.parameters?.filter(
          (parameter) => "in" in parameter && parameter.in === "path",
        );
        expect.soft(parameters).toEqual([
          expect.objectContaining({
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", example: "1" },
          }),
        ]);
        expect.soft(parameters?.[0]).not.toHaveProperty("default");
      }
    });

    it.each([
      {
        path: "/{distribution}/+archive/{archive}",
        operationId: "archive-get",
        examples: [
          ["distribution", "ubuntu"],
          ["archive", "primary"],
        ],
      },
      {
        path: "/{owner}/{project}/+git/{repository}",
        operationId: "git_repository-get",
        examples: [
          ["owner", "~launchpad"],
          ["project", "launchpad"],
          ["repository", "launchpad"],
        ],
      },
    ])(
      "preserves names and example values in $path",
      ({ path, operationId, examples }) => {
        const model = parseWadl(curatedPathsWadl).unwrap();
        const paths = buildPaths(model, buildSchemas(model.representations));
        const operation = paths[path]?.get;

        expect(operation?.operationId).toBe(operationId);
        expect.soft(operation?.parameters).toEqual(
          examples.map(([name, example]) =>
            expect.objectContaining({
              name,
              in: "path",
              required: true,
              schema: { type: "string", example },
            }),
          ),
        );
        operation?.parameters?.forEach((parameter) => {
          expect.soft(parameter).not.toHaveProperty("default");
        });
      },
    );

    it("keeps unknown-resource placeholders required without invented examples or defaults", () => {
      const model = parseWadl(generatorEdgeWadl).unwrap();
      const paths = buildPaths(model, buildSchemas(model.representations));
      const parameters = paths["/{unknown}"]?.get?.parameters;

      expect(parameters).toEqual([
        expect.objectContaining({
          name: "unknown",
          in: "path",
          required: true,
          schema: { type: "string" },
        }),
      ]);
      expect(parameters?.[0]).not.toHaveProperty("example");
      expect(parameters?.[0]).not.toHaveProperty("examples");
      expect(parameters?.[0]).not.toHaveProperty("default");
    });

    it("skips special, page, unsupported, and verbless POST resources", () => {
      const sample = parseWadl(sampleWadl).unwrap();
      const edge = parseWadl(generatorEdgeWadl).unwrap();
      const samplePaths = buildPaths(
        sample,
        buildSchemas(sample.representations),
      );
      const edgePaths = buildPaths(edge, buildSchemas(edge.representations));

      expect(
        Object.keys(samplePaths).some((path) => path.includes("HostedFile")),
      ).toBe(false);
      expect(
        Object.keys(samplePaths).some((path) =>
          path.includes("person-page-resource"),
        ),
      ).toBe(false);
      expect(edgePaths).not.toHaveProperty("/{empty-resource}");
      expect(edgePaths["/bugs/{id}"]).not.toHaveProperty("post");
      expect(
        Object.keys(edgePaths).some((path) => path.includes("unsupported")),
      ).toBe(false);
    });
  });
});
