/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { describe, expect, it } from "vitest";
import type { RouteTemplate } from "../types.js";
import resolveResourceRoutes from "./resolveResourceRoutes.js";

describe("resolveResourceRoutes", () => {
  describe("conservative route resolution", () => {
    it("does not invent a canonical route for an unknown type with a concrete alias", () => {
      expect(
        resolveResourceRoutes("unknown", undefined, new Map(), new Set()),
      ).toEqual([]);
      expect(
        resolveResourceRoutes(
          "unknown",
          [{ template: "future/current", namespace: ["current"] }],
          new Map(),
          new Set(),
        ),
      ).toEqual([
        { base: "/future/current", pathParams: [], namespace: ["current"] },
      ]);
    });

    it("coalesces resolved templates differing only in examples and absent versus empty context", () => {
      const templates = new Map<string, readonly RouteTemplate[]>([
        [
          "person",
          [
            { template: "people/{person=alice}" },
            { template: "people/{person=bob}", namespace: [] },
          ],
        ],
      ]);
      const routes = resolveResourceRoutes(
        "person",
        undefined,
        templates,
        new Set(),
      );

      expect(routes).toHaveLength(1);
      expect(routes[0]).toMatchObject({
        base: "/people/{person}",
        pathParams: [
          {
            name: "person",
            in: "path",
            required: true,
            schema: { type: "string", example: "alice" },
          },
        ],
      });
    });

    it("rejects conflicting contexts after example-bearing templates normalize to one path", () => {
      const templates = new Map<string, readonly RouteTemplate[]>([
        [
          "person",
          [
            { template: "people/{person=alice}", namespace: ["primary"] },
            { template: "people/{person=bob}" },
          ],
        ],
      ]);

      expect(() =>
        resolveResourceRoutes("person", undefined, templates, new Set()),
      ).toThrow(
        "Conflicting Launchpad route labels for person at /people/{person}",
      );
    });
  });
});
