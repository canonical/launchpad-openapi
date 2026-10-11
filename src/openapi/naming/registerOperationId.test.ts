/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { describe, expect, it } from "vitest";
import { ConversionError } from "../errors.js";
import registerOperationId from "./registerOperationId.js";

describe("registerOperationId", () => {
  it("records distinct complete IDs without rewriting them", () => {
    const sources = new Map<string, string>();

    registerOperationId("person.get", sources, "person GET /{person}");
    registerOperationId("person.me.get", sources, "person GET /people/+me");

    expect([...sources]).toEqual([
      ["person.get", "person GET /{person}"],
      ["person.me.get", "person GET /people/+me"],
    ]);
  });

  it("reports both definitions for a collision without replacing the first", () => {
    const sources = new Map([["person.get", "person GET /{person}"]]);
    const registerDuplicate = () =>
      registerOperationId("person.get", sources, "person GET /another");

    expect(registerDuplicate).toThrow(ConversionError);
    expect(registerDuplicate).toThrow(
      "Conflicting Launchpad operation ID person.get: person GET /{person} and person GET /another",
    );
    expect(sources.get("person.get")).toBe("person GET /{person}");
  });
});
