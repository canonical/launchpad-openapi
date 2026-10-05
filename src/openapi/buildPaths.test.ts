/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import type { PathsObject } from "openapi3-ts/oas30";
import { describe, expect, it, vi } from "vitest";
import {
  curatedPathsWadl,
  generatorEdgeWadl,
  routeCorrectionsWadl,
  sampleWadl,
  semanticRoutesWadl,
  serviceRootLinks,
} from "../../testing/fixtures.js";
import { parseWadl } from "../wadl/index.js";
import buildPaths from "./buildPaths.js";
import buildSchemas from "./buildSchemas.js";
import type * as Constants from "./constants.js";
import type { RouteCorrection } from "./types.js";

async function withRouteCorrections(
  overrides: Readonly<Record<string, RouteCorrection>>,
  check: (builder: typeof buildPaths) => void,
): Promise<void> {
  vi.resetModules();
  vi.doMock("./constants.js", async (importOriginal) => {
    const constants = await importOriginal<typeof Constants>();
    return {
      ...constants,
      ROUTE_CORRECTIONS: { ...constants.ROUTE_CORRECTIONS, ...overrides },
    };
  });
  try {
    // Reloading after doMock is required to isolate each catalog override.
    const { default: builder } = await import("./buildPaths.js");
    check(builder);
  } finally {
    vi.doUnmock("./constants.js");
    vi.resetModules();
  }
}

function sourceRoutes(paths: PathsObject): { path: string; item: unknown }[] {
  const routes: { path: string; item: unknown }[] = [];
  for (const [path, item] of Object.entries(paths)) {
    routes.push({ path, item });
    const alternatives: unknown = item["x-launchpad-route-alternatives"];
    if (alternatives === undefined) continue;
    if (!Array.isArray(alternatives)) {
      throw new Error(`Invalid route alternatives at ${path}`);
    }
    for (const alternative of alternatives) {
      if (
        typeof alternative !== "object" ||
        alternative === null ||
        typeof alternative.path !== "string" ||
        typeof alternative.resourceTypeId !== "string" ||
        typeof alternative.item !== "object" ||
        alternative.item === null
      ) {
        throw new Error(`Invalid route alternative at ${path}`);
      }
      routes.push({ path: alternative.path, item: alternative.item });
    }
  }
  return routes;
}

function sourceRoute(paths: PathsObject, path: string): unknown {
  const matches = sourceRoutes(paths).filter((route) => route.path === path);
  expect(matches, `Source route ${path}`).toHaveLength(1);
  return matches[0]?.item;
}

function expectSemanticItem(
  paths: PathsObject,
  path: string,
  suffix?: string,
): void {
  const ending = suffix === undefined ? "" : `-${suffix}`;
  expect(sourceRoute(paths, path)).toMatchObject({
    get: { operationId: `semantic_item-get${ending}` },
  });
  expect(sourceRoute(paths, `${path}?ws.op=inspect`)).toMatchObject({
    get: { operationId: `semantic-source-inspect${ending}` },
  });
}

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

  describe("semantic operation IDs", () => {
    it.each([
      ["/{distribution}/+archive/{archive}", "distribution"],
      ["/{owner}/+archive/{distribution}/{archive}", "ppa"],
    ])(
      "labels standard and getPublishedSources archive operations at %s",
      (path, suffix) => {
        const model = parseWadl(curatedPathsWadl).unwrap();
        const paths = buildPaths(model, buildSchemas(model.representations));
        expect
          .soft(paths[path]?.get?.operationId)
          .toBe(`archive-get-${suffix}`);
        expect
          .soft(paths[`${path}?ws.op=getPublishedSources`]?.get?.operationId)
          .toBe(`archive-getPublishedSources-${suffix}`);
      },
    );

    it.each(["people/+me", "users/current"])(
      "keeps canonical IDs when me_link points to %s",
      (aliasPath) => {
        const model = parseWadl(sampleWadl).unwrap();
        const schemas = buildSchemas(model.representations);
        const canonical = buildPaths(model, schemas);
        const aliased = buildPaths(model, schemas, {
          me_link: `${model.baseUrl}/${aliasPath}`,
        });
        for (const verb of ["get", "put", "patch", "delete"] as const) {
          expect
            .soft(aliased["/{person}"]?.[verb]?.operationId)
            .toBe(canonical["/{person}"]?.[verb]?.operationId);
          expect
            .soft(aliased[`/${aliasPath}`]?.[verb]?.operationId)
            .toBe(`person-${verb}-me`);
        }
        expect
          .soft(aliased["/{person}?ws.op=getMembers"]?.get?.operationId)
          .toBe("person-getMembers");
        expect
          .soft(aliased[`/${aliasPath}?ws.op=getMembers`]?.get?.operationId)
          .toBe("person-getMembers-me");
      },
    );

    it("uses collection field identity rather than the alias URL as its label", () => {
      const model = parseWadl(sampleWadl).unwrap();
      const paths = buildPaths(model, buildSchemas(model.representations), {
        people_collection_link: `${model.baseUrl}/directory`,
      });
      expect.soft(paths["/people"]?.get?.operationId).toBe("people-get");
      expect
        .soft(paths["/directory"]?.get?.operationId)
        .toBe("people-get-people");
      expect
        .soft(paths["/directory?ws.op=getByName"]?.get?.operationId)
        .toBe("people-getByName-people");
    });

    it("keeps field-derived IDs for uncatalogued resources as root routes are added", () => {
      const model = parseWadl(routeCorrectionsWadl).unwrap();
      const root = model.representations["service-root-json"];
      const alias = root?.fields.find((field) => field.name === "me_link");
      if (root === undefined || alias === undefined) {
        throw new Error("Missing service-root alias fixture");
      }
      root.fields.push(
        {
          ...alias,
          name: "future_collection_link",
          linkResourceType: "unknown",
        },
        {
          ...alias,
          name: "other_collection_link",
          linkResourceType: "unknown",
        },
      );
      const schemas = buildSchemas(model.representations);
      const single = buildPaths(model, schemas, {
        future_collection_link: `${model.baseUrl}/future`,
      });
      const multiple = buildPaths(model, schemas, {
        future_collection_link: `${model.baseUrl}/future`,
        other_collection_link: `${model.baseUrl}/other`,
      });
      expect(single["/future"]?.get?.operationId).toBe("unknown-get-future");
      expect(multiple["/future"]?.get?.operationId).toBe("unknown-get-future");
      expect(multiple["/other"]?.get?.operationId).toBe("unknown-get-other");
    });

    it("deduplicates exact canonical root links without dropping canonical parameters", () => {
      const model = parseWadl(sampleWadl).unwrap();
      const schemas = buildSchemas(model.representations);
      const canonical = buildPaths(model, schemas);
      const linked = buildPaths(model, schemas, {
        people_collection_link: `${model.baseUrl}/people`,
        me_link: `${model.baseUrl}/{person}`,
      });
      expect(sourceRoute(linked, "/people")).toEqual(
        sourceRoute(canonical, "/people"),
      );
      expect(sourceRoute(linked, "/{person}")).toEqual(
        sourceRoute(canonical, "/{person}"),
      );
      expect(sourceRoute(linked, "/{person}?ws.op=getMembers")).toEqual(
        sourceRoute(canonical, "/{person}?ws.op=getMembers"),
      );
    });

    it.each([false, true])(
      "rejects conflicting root alias labels with reversed fields %s",
      (reversed) => {
        const model = parseWadl(sampleWadl).unwrap();
        const root = model.representations["service-root-json"];
        const alias = root?.fields.find((field) => field.name === "me_link");
        if (root === undefined || alias === undefined) {
          throw new Error("Missing service-root alias fixture");
        }
        root.fields.push({ ...alias, name: "current_person_link" });
        if (reversed) {
          root.fields.splice(
            0,
            root.fields.length,
            ...root.fields.toReversed(),
          );
        }
        const schemas = buildSchemas(model.representations);
        expect(() =>
          buildPaths(model, schemas, {
            me_link: `${model.baseUrl}/people/+me`,
            current_person_link: `${model.baseUrl}/people/+me`,
          }),
        ).toThrow(
          /Conflicting Launchpad route labels for person at \/people\/\+me/,
        );
      },
    );

    it("deduplicates root fields sharing an exact canonical path", () => {
      const model = parseWadl(sampleWadl).unwrap();
      const root = model.representations["service-root-json"];
      const alias = root?.fields.find((field) => field.name === "me_link");
      if (root === undefined || alias === undefined) {
        throw new Error("Missing service-root alias fixture");
      }
      root.fields.push({ ...alias, name: "current_person_link" });
      const schemas = buildSchemas(model.representations);
      const canonical = buildPaths(model, schemas);
      const linked = buildPaths(model, schemas, {
        me_link: `${model.baseUrl}/{person}`,
        current_person_link: `${model.baseUrl}/{person}`,
      });
      expect(sourceRoute(linked, "/{person}")).toEqual(
        sourceRoute(canonical, "/{person}"),
      );
    });

    it("deduplicates repeated root aliases with identical field identity", () => {
      const model = parseWadl(sampleWadl).unwrap();
      const root = model.representations["service-root-json"];
      const alias = root?.fields.find((field) => field.name === "me_link");
      if (root === undefined || alias === undefined) {
        throw new Error("Missing service-root alias fixture");
      }
      root.fields.push(alias);
      const paths = buildPaths(model, buildSchemas(model.representations), {
        me_link: `${model.baseUrl}/people/+me`,
      });
      expect(sourceRoute(paths, "/people/+me")).toMatchObject({
        get: { operationId: "person-get-me" },
      });
    });

    it("retains a canonical semantic suffix when a root alias exactly matches it", async () => {
      await withRouteCorrections(
        {
          person: {
            templates: [
              { template: "people/+me", operationSuffix: "canonical" },
            ],
          },
        },
        (builder) => {
          const model = parseWadl(sampleWadl).unwrap();
          const paths = builder(
            model,
            buildSchemas(model.representations),
            serviceRootLinks,
          );
          expect(sourceRoute(paths, "/people/+me")).toMatchObject({
            get: { operationId: "person-get-canonical" },
          });
          expect(
            sourceRoute(paths, "/people/+me?ws.op=getMembers"),
          ).toMatchObject({
            get: { operationId: "person-getMembers-canonical" },
          });
        },
      );
    });

    it.each([
      { name: "base only", variants: [] },
      { name: "inserted variants", variants: ["project", "distribution"] },
      { name: "reordered variants", variants: ["distribution", "project"] },
      { name: "removed project variant", variants: ["distribution"] },
    ])(
      "preserves IDs with $name, including an explicitly unsuffixed route",
      async ({ variants }) => {
        await withRouteCorrections(
          {
            semantic_item: {
              templates: [
                { template: "items/{item=one}" },
                ...variants.map((variant) => ({
                  template: `{${variant}=example}/+items/{item=one}`,
                  operationSuffix: variant,
                })),
              ],
            },
            semantic_child: {
              parents: [{ resourceType: "semantic_item" }],
              suffix: "+child/{child=two}",
            },
          },
          (builder) => {
            const model = parseWadl(semanticRoutesWadl).unwrap();
            const paths = builder(model, buildSchemas(model.representations));
            expectSemanticItem(paths, "/items/{item}");
            expect(
              sourceRoute(paths, "/items/{item}/+child/{child}"),
            ).toMatchObject({
              get: { operationId: "semantic_child-get" },
            });
            for (const variant of variants) {
              const path = `/{${variant}}/+items/{item}`;
              expectSemanticItem(paths, path, variant);
              expect(
                sourceRoute(paths, `${path}/+child/{child}`),
              ).toMatchObject({
                get: { operationId: `semantic_child-get-${variant}` },
              });
            }
            for (const variant of ["project", "distribution"]) {
              if (variants.includes(variant)) continue;
              expect(
                sourceRoutes(paths).map((route) => route.path),
              ).not.toContain(`/{${variant}}/+items/{item}`);
            }
          },
        );
      },
    );

    it.each([
      { reverseTemplates: false, reverseParents: false },
      { reverseTemplates: true, reverseParents: false },
      { reverseTemplates: false, reverseParents: true },
      { reverseTemplates: true, reverseParents: true },
    ])(
      "composes multi-parent labels and inherited children with $reverseTemplates/$reverseParents permutations",
      async ({ reverseTemplates, reverseParents }) => {
        const templates = [
          {
            template: "{distribution=ubuntu}/+archive/{archive=primary}",
            operationSuffix: "distribution",
          },
          {
            template:
              "{owner=~launchpad}/+archive/{distribution=ubuntu}/{archive=ppa}",
            operationSuffix: "ppa",
          },
        ];
        const parents = [
          { resourceType: "archive", operationSuffixPrefix: "archive" },
          { resourceType: "project", operationSuffixPrefix: "project" },
          {
            resourceType: "distribution",
            operationSuffixPrefix: "distribution",
          },
        ];
        await withRouteCorrections(
          {
            archive: {
              templates: reverseTemplates ? templates.toReversed() : templates,
            },
            project: { templates: [{ template: "{project=launchpad}" }] },
            distribution: {
              templates: [{ template: "{distribution=ubuntu}" }],
            },
            semantic_item: {
              parents: reverseParents ? parents.toReversed() : parents,
              suffix: "+item/{item=one}",
            },
            semantic_child: {
              parents: [{ resourceType: "semantic_item" }],
              suffix: "+child/{child=two}",
            },
          },
          (builder) => {
            const model = parseWadl(semanticRoutesWadl).unwrap();
            const paths = builder(model, buildSchemas(model.representations));
            for (const [path, suffix] of [
              [
                "/{distribution}/+archive/{archive}/+item/{item}",
                "archive-distribution",
              ],
              [
                "/{owner}/+archive/{distribution}/{archive}/+item/{item}",
                "archive-ppa",
              ],
              ["/{project}/+item/{item}", "project"],
              ["/{distribution}/+item/{item}", "distribution"],
            ]) {
              expectSemanticItem(paths, path, suffix);
              expect(
                sourceRoute(paths, `${path}/+child/{child}`),
              ).toMatchObject({
                get: { operationId: `semantic_child-get-${suffix}` },
              });
            }
          },
        );
      },
    );

    it.each([undefined, "explicit"])(
      "preserves missing source IDs and named fallbacks with suffix %s",
      async (operationSuffix) => {
        await withRouteCorrections(
          {
            anonymous_route: {
              templates: [{ template: "anonymous", operationSuffix }],
            },
          },
          (builder) => {
            const model = parseWadl(semanticRoutesWadl).unwrap();
            const paths = builder(model, buildSchemas(model.representations));
            const ending =
              operationSuffix === undefined ? "" : `-${operationSuffix}`;
            const standard = paths["/anonymous"]?.get;
            if (operationSuffix === undefined) {
              expect(standard).toBeDefined();
              expect(standard).not.toHaveProperty("operationId");
            } else {
              expect(standard?.operationId).toBe(
                `anonymous_route-get${ending}`,
              );
            }
            expect(paths["/anonymous?ws.op=inspect"]?.get?.operationId).toBe(
              `anonymous_route-inspect${ending}`,
            );
          },
        );
      },
    );

    it("deduplicates repeated templates with identical semantic metadata", async () => {
      await withRouteCorrections(
        {
          semantic_item: {
            templates: [
              { template: "items/{item=one}", operationSuffix: "item" },
              { template: "items/{item=one}", operationSuffix: "item" },
            ],
          },
        },
        (builder) => {
          const model = parseWadl(semanticRoutesWadl).unwrap();
          const paths = builder(model, buildSchemas(model.representations));
          expectSemanticItem(paths, "/items/{item}", "item");
        },
      );
    });

    it.each([undefined, "other"])(
      "rejects conflicting labels for one canonical template (%s)",
      async (otherSuffix) => {
        await withRouteCorrections(
          {
            semantic_item: {
              templates: [
                { template: "items/{item=one}", operationSuffix: "item" },
                { template: "items/{item=one}", operationSuffix: otherSuffix },
              ],
            },
          },
          (builder) => {
            const model = parseWadl(semanticRoutesWadl).unwrap();
            expect(() =>
              builder(model, buildSchemas(model.representations)),
            ).toThrow(
              /conflict.*items\/\{item(?:=one)?\}|items\/\{item(?:=one)?\}.*conflict/i,
            );
          },
        );
      },
    );

    it("rejects reused final IDs and reports both route and method origins", async () => {
      await withRouteCorrections(
        {
          semantic_item: {
            templates: [
              { template: "alpha/{item=one}", operationSuffix: "duplicate" },
              { template: "beta/{item=one}", operationSuffix: "duplicate" },
            ],
          },
        },
        (builder) => {
          const model = parseWadl(semanticRoutesWadl).unwrap();
          let failure: unknown;
          try {
            builder(model, buildSchemas(model.representations));
          } catch (error) {
            failure = error;
          }
          expect(failure).toBeInstanceOf(Error);
          if (!(failure instanceof Error))
            throw new Error("Expected an operation ID conflict");
          expect(failure.message).toContain("semantic_item-get-duplicate");
          expect(failure.message).toContain("/alpha/{item}");
          expect(failure.message).toContain("/beta/{item}");
          expect(failure.message).toMatch(/get/i);
        },
      );
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
        expect(new Set(actual)).toEqual(
          new Set(suffixes.map((suffix) => `${prefix}${suffix}`)),
        );
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
