/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { XmlElement, XmlText } from "@rgrove/parse-xml";
import { describe, expect, it } from "vitest";
import {
  WadlDocBlock,
  WadlDocument,
  WadlMethod,
  WadlParam,
  WadlRepresentation,
  WadlResourceType,
} from "./model.js";

function element(
  name: string,
  children: XmlElement["children"] = [],
  attributes: Record<string, string> = {},
): XmlElement {
  return new XmlElement(`wadl:${name}`, attributes, children);
}

function text(value: string): XmlText {
  return new XmlText(value);
}

describe("WadlParam.fromXml", () => {
  it("maps attributes, mixed docs, links, and defined enum values", () => {
    const raw = element(
      "param",
      [
        element("doc", [
          text("Current "),
          element("strong", [text("status")]),
          text("."),
        ]),
        element("link", [], {
          resource_type: "https://example.test/#person",
        }),
        element("option", [], { value: "Open" }),
        element("option"),
        element("option", [], { value: "Moderated" }),
      ],
      { name: "status", required: "true", path: "$['status']" },
    );
    expect(WadlParam.fromXml(raw)).toMatchObject({
      name: "status",
      required: true,
      path: "$['status']",
      doc: "Current status.",
      linkResourceType: "person",
      options: ["Open", "Moderated"],
    });
  });

  it("omits unnamed params, empty options, and invalid link fragments", () => {
    expect(WadlParam.fromXml(element("param"))).toBeUndefined();
    expect(
      WadlParam.fromXml(
        element(
          "param",
          [
            element("option"),
            element("link", [], { resource_type: "trailing#" }),
          ],
          {
            name: "plain",
          },
        ),
      ),
    ).toMatchObject({ name: "plain", required: false });
  });
});

describe("WadlDocBlock.fromXml", () => {
  it("normalizes titled text and omits empty blocks", () => {
    expect(
      WadlDocBlock.fromXml(
        element("doc", [text(" Hello\n"), element("b", [text("world")])], {
          title: "Intro",
        }),
      ),
    ).toMatchObject({ title: "Intro", text: "Hello world" });
    expect(WadlDocBlock.fromXml(element("doc"))).toBeUndefined();
  });
});

describe("WadlRepresentation.fromXml", () => {
  it("retains only named fields", () => {
    expect(
      WadlRepresentation.fromXml(
        element("representation", [
          element("param", [], { name: "name" }),
          element("param", [], { required: "true" }),
        ]),
      ).fields,
    ).toMatchObject([{ name: "name", required: false }]);
  });
});

describe("WadlMethod.fromXml", () => {
  it("keeps response statuses, media types, and valid references grouped", () => {
    const method = WadlMethod.fromXml(
      element(
        "method",
        [
          element("doc", [text("Find a person.")]),
          element("request", [
            element("param", [], { name: "ws.op", fixed: "find" }),
            element("param", [], { name: "name", required: "true" }),
          ]),
          element(
            "response",
            [
              element("doc", [text("A person was found.")]),
              element("representation", [], {
                href: "#person-full",
                mediaType: "application/json",
              }),
              element("representation", [], { href: "without-fragment" }),
              element("representation", [], { href: "trailing#" }),
            ],
            { status: "200 206" },
          ),
          element(
            "response",
            [
              element("representation", [], {
                href: "#person-diff",
                mediaType: "application/json",
              }),
            ],
            { status: "400" },
          ),
        ],
        { id: "people-find", name: "GET" },
      ),
    );
    expect(method).toMatchObject({
      id: "people-find",
      httpMethod: "GET",
      doc: "Find a person.",
      wsOp: "find",
      formEncoded: false,
      params: [{ name: "name", required: true }],
      responses: [
        { statusCodes: ["200", "206"], doc: "A person was found." },
        { statusCodes: ["400"] },
      ],
    });
    expect(method.responses[0]?.representations).toContainEqual({
      id: "person-full",
      mediaType: "application/json",
    });
    expect(method.responses[1]?.representations).toContainEqual({
      id: "person-diff",
      mediaType: "application/json",
    });
    expect(
      method.responses.flatMap((response) =>
        response.representations.flatMap((representation) =>
          representation.id === undefined ? [] : [representation.id],
        ),
      ),
    ).toEqual(["person-full", "person-diff"]);
  });

  it("reads form params and request representation references", () => {
    const method = WadlMethod.fromXml(
      element(
        "method",
        [
          element("request", [
            element(
              "representation",
              [
                element("param", [], { name: "ws.op" }),
                element("param", [], { name: "display_name" }),
              ],
              {
                mediaType: "application/x-www-form-urlencoded",
                href: "#person-diff",
              },
            ),
          ]),
        ],
        { name: "POST" },
      ),
    );
    expect(method.formEncoded).toBe(true);
    expect(method.wsOp).toBeUndefined();
    expect(method.requestRepresentationId).toBe("person-diff");
    expect(method.params).toMatchObject([
      { name: "display_name", required: false },
    ]);
  });
});

describe("WadlResourceType.fromXml", () => {
  it("maps identified resource types and omits unidentified ones", () => {
    expect(
      WadlResourceType.fromXml(
        element(
          "resource_type",
          [
            element("doc", [text("A person.")]),
            element("method", [], { name: "GET" }),
          ],
          { id: "person" },
        ),
      ),
    ).toMatchObject({
      id: "person",
      doc: "A person.",
      methods: [{ httpMethod: "GET" }],
    });
    expect(WadlResourceType.fromXml(element("resource_type"))).toBeUndefined();
  });
});

describe("WadlDocument.fromXml", () => {
  it("collects JSON representations and identified resource types in order", () => {
    const document = WadlDocument.fromXml(
      element("application", [
        element("resources", [], {
          base: "https://api.example.test/devel/",
        }),
        element("doc", [text("First")], { title: "One" }),
        element("doc"),
        element("representation", [], {
          id: "json",
          mediaType: "application/json",
        }),
        element("representation", [], {
          id: "html",
          mediaType: "application/xhtml+xml",
        }),
        element("representation", [], { mediaType: "application/json" }),
        element("resource_type", [], { id: "one" }),
        element("resource_type"),
      ]),
    );
    expect(document.baseUrl).toBe("https://api.example.test/devel");
    expect(document.docs).toMatchObject([{ title: "One", text: "First" }]);
    expect(Object.keys(document.representations)).toEqual(["json"]);
    expect(Object.keys(document.resourceTypes)).toEqual(["one"]);
  });

  it("uses an empty base when resources are absent", () => {
    expect(WadlDocument.fromXml(element("application")).baseUrl).toBe("");
  });
});
