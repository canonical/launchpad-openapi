/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { describe, expect, it } from "vitest";
import {
  curatedPathsWadl,
  generatorEdgeWadl,
  routeCorrectionsWadl,
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
      expect(paths).toHaveProperty("/{person}");
    });

    it("keeps canonical routes when root links are missing or invalid", () => {
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
      const prefixCollision = buildPaths(model, schemas, {
        me_link: `${model.baseUrl}2/people/+me`,
      });

      expect(runtimePaths).toHaveProperty("/people");
      expect(runtimePaths).toHaveProperty("/people/+me");
      expect(invalidPaths).toHaveProperty("/people");
      expect(invalidPaths).toHaveProperty("/{person}");
      expect(emptyPaths).toHaveProperty("/people");
      expect(emptyPaths).toHaveProperty("/people/+me");
      expect(prefixCollision).not.toHaveProperty("/2/people/+me");
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
        examples: [
          ["distribution", "ubuntu"],
          ["archive", "primary"],
        ],
      },
      {
        path: "/{owner}/{project}/+git/{repository}",
        examples: [
          ["owner", "~launchpad"],
          ["project", "launchpad"],
          ["repository", "launchpad"],
        ],
      },
    ])("preserves names and example values in $path", ({ path, examples }) => {
      const model = parseWadl(curatedPathsWadl).unwrap();
      const paths = buildPaths(model, buildSchemas(model.representations));
      const operation = paths[path]?.get;

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
    });

    it("exposes distinct bug-task targets and named person URLs without invented paths", () => {
      const model = parseWadl(routeCorrectionsWadl).unwrap();
      const paths = buildPaths(model, buildSchemas(model.representations), {
        me_link: `${model.baseUrl}/people/+me`,
        specifications_collection_link: `${model.baseUrl}/`,
      });
      const sourceTask =
        paths["/{distribution}/+source/{source}/+bug/{id}"]?.get;
      const ppaTask =
        paths["/{owner}/+archive/{distribution}/{archive}/+bug/{id}"]?.get;
      expect(sourceTask?.tags).toContain("bug_task");
      expect(ppaTask?.tags).toContain("bug_task");
      expect(sourceTask?.operationId).not.toBe(ppaTask?.operationId);
      expect(paths).not.toHaveProperty("/{bug_task}");
      expect(paths).not.toHaveProperty("/{unknown}");
      expect(paths["/people/+me"]?.get?.tags).toContain("person");
      expect(paths["/{person}"]?.get?.tags).toContain("person");
      expect(paths["/specs"]?.get?.tags).toContain("specifications");
      expect(paths).not.toHaveProperty("/specifications");
      expect(paths["/{person}"]?.["x-launchpad-route-alternatives"]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "/{team}",
            resourceTypeId: "team",
            item: expect.objectContaining({
              get: expect.objectContaining({ tags: ["team"] }),
            }),
          }),
        ]),
      );
    });
    it("retains same-shape OCI routes in complete documents", () => {
      const model = parseWadl(routeCorrectionsWadl).unwrap();
      const paths = buildPaths(model, buildSchemas(model.representations));
      for (const [resourceType, suffix] of [
        ["oci_project", ""],
        ["oci_project_series", "/+series/{series}"],
      ]) {
        const primary = paths[`/{distribution}/+oci/{oci_project}${suffix}`];
        expect(primary?.get?.tags).toEqual([resourceType]);
        expect(primary?.["x-launchpad-route-alternatives"]).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: `/{project}/+oci/{oci_project}${suffix}`,
              resourceTypeId: resourceType,
              item: expect.objectContaining({
                get: expect.objectContaining({
                  parameters: expect.arrayContaining([
                    expect.objectContaining({
                      in: "path",
                      name: "project",
                      schema: expect.objectContaining({ example: "launchpad" }),
                    }),
                  ]),
                }),
              }),
            }),
          ]),
        );
      }
    });
    it("uses an accepted GPG fingerprint length in the request example", () => {
      const model = parseWadl(routeCorrectionsWadl).unwrap();
      const paths = buildPaths(model, buildSchemas(model.representations));
      expect(
        paths["/{person}/+gpg-keys/{fingerprint}"]?.get?.parameters,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "fingerprint",
            schema: expect.objectContaining({
              example: expect.stringMatching(/^[A-F0-9]{40}$/),
            }),
          }),
        ]),
      );
    });
    it("emits only traversable external package channel shapes", () => {
      const model = parseWadl(routeCorrectionsWadl).unwrap();
      const paths = buildPaths(model, buildSchemas(model.representations));
      const suffixes = [
        "",
        "/+risk/{risk}",
        "/+track/{track}/+risk/{risk}",
        "/+risk/{risk}/+branch/{branch}",
        "/+track/{track}/+risk/{risk}/+branch/{branch}",
      ];
      for (const [resourceType, prefix] of [
        ["external_package", "/{distribution}/+snap/{package}"],
        ["external_package_series", "/{distribution}/{series}/+snap/{package}"],
        [
          "external_package_series",
          "/{distribution}/+series/{series}/+snap/{package}",
        ],
      ]) {
        const actual = Object.entries(paths)
          .filter(
            ([path, item]) =>
              path.startsWith(prefix) && item.get?.tags?.includes(resourceType),
          )
          .map(([path]) => path);
        expect(actual).toEqual(suffixes.map((suffix) => `${prefix}${suffix}`));
      }
    });
    it("uses archive permission path and required query selectors", () => {
      const model = parseWadl(routeCorrectionsWadl).unwrap();
      const paths = buildPaths(model, buildSchemas(model.representations));
      const permission =
        paths["/{distribution}/+archive/{archive}/+upload/{user}"]?.get;

      expect(permission?.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "type",
            in: "query",
            required: true,
            schema: expect.objectContaining({
              type: "string",
              enum: ["component", "packagename", "packageset", "pocket"],
            }),
          }),
          expect.objectContaining({
            name: "item",
            in: "query",
            required: true,
          }),
          expect.objectContaining({
            name: "series",
            in: "query",
            required: false,
          }),
        ]),
      );
      expect(
        paths["/{owner}/+archive/{distribution}/{archive}/+queue-admin/{user}"]
          ?.get,
      ).toBeDefined();
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
