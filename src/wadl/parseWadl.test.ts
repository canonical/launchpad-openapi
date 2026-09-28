/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { Result } from "better-result";
import { assert, describe, expect, it } from "vitest";
import {
  notWadl,
  responseStatusWadl,
  sampleWadl,
} from "../../testing/fixtures.js";
import { WadlDocument } from "./model.js";
import parseWadl from "./parseWadl.js";

describe("parseWadl", () => {
  it("parses the shared fixture into the complete typed model", () => {
    const result = parseWadl(sampleWadl);
    expect(Result.isOk(result)).toBe(true);
    const document = result.unwrap();
    expect(document).toBeInstanceOf(WadlDocument);
    expect(document.baseUrl).toBe("https://api.launchpad.test/1.0");
    expect(document.docs.map((doc) => doc.text)).toEqual([
      "The service. Read the guide.",
      "Version notes.",
      "Untitled application notes.",
    ]);
    expect(Object.keys(document.representations)).toEqual([
      "service-root-json",
      "person-full",
      "person-diff",
      "person-page",
    ]);
    expect(Object.keys(document.resourceTypes)).toEqual([
      "service-root",
      "people",
      "person",
      "person-page-resource",
      "HostedFile",
      "ScalarValue",
    ]);
  });

  it("lifts named-operation metadata and form parameters", () => {
    const document = parseWadl(sampleWadl).unwrap();
    const getByName = document.resourceTypes.people?.methods[1];
    const newTeam = document.resourceTypes.people?.methods[2];
    expect(getByName).toMatchObject({
      id: "people-getByName",
      httpMethod: "GET",
      wsOp: "getByName",
      formEncoded: false,
      responses: [
        { statusCodes: [], representations: [{ id: "person-full" }] },
      ],
    });
    expect(getByName?.params.map((param) => param.name)).toEqual(["name"]);
    expect(newTeam).toMatchObject({
      wsOp: "newTeam",
      formEncoded: true,
      responses: [],
    });
    expect(newTeam?.params[1]?.options).toEqual(["Open", "Moderated"]);
  });

  for (const status of ["201,400", "   "]) {
    it(`rejects malformed response status ${JSON.stringify(status)}`, () => {
      const wadl = responseStatusWadl.replace(
        'status="201"',
        `status="${status}"`,
      );
      const result = parseWadl(wadl);
      assert(Result.isError(result));
      expect(result.error._tag).toBe("WadlParseError");
    });
  }

  it("returns a typed error when the application root is missing", () => {
    const result = parseWadl(notWadl);
    assert(Result.isError(result));
    expect(result.error._tag).toBe("WadlParseError");
    expect(result.error.message).toBe(
      "Not a valid WADL document: missing <application> root element",
    );
  });

  it("returns a typed error when XML elements are mismatched", () => {
    const result = parseWadl("<application><resource_type></application>");
    assert(Result.isError(result));
    expect(result.error._tag).toBe("WadlParseError");
    expect(result.error.cause).toBeDefined();
    expect(result.error.message).toContain(
      "Missing end tag for element resource_type",
    );
  });

  it("rejects undefined entities other than Launchpad nbsp", () => {
    const result = parseWadl(
      "<application><doc>&unsupported;</doc></application>",
    );
    assert(Result.isError(result));
    expect(result.error.message).toContain(
      "Named entity isn't defined: &unsupported;",
    );
  });
});
