/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { describe, expect, it } from "vitest";
import { ConversionError } from "../errors.js";
import normalizeNamingPath from "./normalizeNamingPath.js";

describe("normalizeNamingPath", () => {
  describe("component spelling", () => {
    it.each([
      ["source_package", "sourcePackage"],
      ["source-package", "sourcePackage"],
      ["sourcePackage", "sourcePackage"],
      ["getByURL", "getByUrl"],
      ["API_client", "apiClient"],
      ["PPA", "ppa"],
      ["get_a_b", "getAB"],
      ["projects", "projects"],
      ["version2", "version2"],
    ])("normalizes %s to %s in every component", (source, normalized) => {
      expect(
        normalizeNamingPath({
          subject: source,
          namespace: [source],
          operation: source,
        }),
      ).toEqual({
        subject: normalized,
        namespace: [normalized],
        operation: normalized,
      });
    });

    it.each([
      "",
      "1name",
      "source.package",
      "two words",
      "name!",
      "a__b",
      "a-",
      "café",
    ])("rejects unsupported spelling %j with the source path", (component) => {
      for (const path of [
        { subject: component, namespace: [], operation: "get" },
        { subject: "subject", namespace: [component], operation: "get" },
        { subject: "subject", namespace: [], operation: component },
      ]) {
        expect(() => normalizeNamingPath(path)).toThrow(ConversionError);
        expect(() => normalizeNamingPath(path)).toThrow(
          `Unsupported naming component ${JSON.stringify(component)} in ${JSON.stringify(path)}`,
        );
      }
    });
  });

  describe("namespace structure", () => {
    it("retains ordered, multiword, and repeated contexts without mutating the source", () => {
      const path = {
        subject: "review",
        namespace: ["API_client", "source-package", "source_package"],
        operation: "getByURL",
      };

      expect(normalizeNamingPath(path)).toEqual({
        subject: "review",
        namespace: ["apiClient", "sourcePackage", "sourcePackage"],
        operation: "getByUrl",
      });
      expect(path.namespace).toEqual([
        "API_client",
        "source-package",
        "source_package",
      ]);
    });

    it("leaves an undeclared namespace empty", () => {
      expect(
        normalizeNamingPath({
          subject: "projects",
          namespace: [],
          operation: "new_project",
        }),
      ).toEqual({
        subject: "projects",
        namespace: [],
        operation: "newProject",
      });
    });
  });
});
