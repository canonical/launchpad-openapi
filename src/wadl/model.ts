/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

/**
 * Typed WADL values built at the XML parsing boundary.
 *
 * Only the static `fromXml` methods accept parser-library types. Public model
 * instances expose plain WADL values, so downstream consumers neither traverse
 * XML nor depend on the XML parser's node representation.
 */

import { XmlElement } from "@rgrove/parse-xml";
import { localName } from "./xml.js";

/** A WADL parameter or representation field. */
export class WadlParam {
  private constructor(
    public readonly name: string,
    public readonly required: boolean,
    public readonly path: string | undefined,
    public readonly doc: string | undefined,
    public readonly linkResourceType: string | undefined,
    public readonly options: string[] | undefined,
  ) {}

  /** Read one `<param>` element; omit elements without a name. */
  static fromXml(raw: XmlElement): WadlParam | undefined {
    const name = raw.attributes.name;
    if (name === undefined) return undefined;
    const options = childElements(raw, "option").flatMap((option) => {
      const value = option.attributes.value;
      return value === undefined ? [] : [value];
    });
    return new WadlParam(
      name,
      raw.attributes.required === "true",
      raw.attributes.path,
      documentationText(raw),
      fragmentId(childElements(raw, "link")[0]?.attributes.resource_type),
      options.length === 0 ? undefined : options,
    );
  }
}

/** An application-level documentation block. */
export class WadlDocBlock {
  private constructor(
    public readonly title: string | undefined,
    public readonly text: string,
  ) {}

  /** Read one `<doc>` element; omit blocks with no text. */
  static fromXml(raw: XmlElement): WadlDocBlock | undefined {
    const text = normalizedText(raw);
    if (text === undefined) return undefined;
    return new WadlDocBlock(raw.attributes.title, text);
  }
}

/** A reusable JSON representation and its fields. */
export class WadlRepresentation {
  private constructor(public readonly fields: WadlParam[]) {}

  /** Read one reusable `<representation>` element. */
  static fromXml(raw: XmlElement): WadlRepresentation {
    return new WadlRepresentation(
      childElements(raw, "param").flatMap((param) => {
        const parsed = WadlParam.fromXml(param);
        return parsed === undefined ? [] : [parsed];
      }),
    );
  }
}

/** A WADL HTTP method with XML references resolved to fragment ids. */
export class WadlMethod {
  private constructor(
    public readonly id: string | undefined,
    public readonly httpMethod: string,
    public readonly doc: string | undefined,
    public readonly wsOp: string | undefined,
    public readonly formEncoded: boolean,
    public readonly params: WadlParam[],
    public readonly requestRepresentationId: string | undefined,
    public readonly responseRepresentationIds: string[],
  ) {}

  /** Read one `<method>` and lift the `ws.op` marker into method metadata. */
  static fromXml(raw: XmlElement): WadlMethod {
    const request = childElements(raw, "request")[0];
    const requestRepresentation = childElements(request, "representation")[0];
    const paramSource = requestRepresentation ?? request;
    let wsOp: string | undefined;
    const params: WadlParam[] = [];
    for (const rawParam of childElements(paramSource, "param")) {
      if (rawParam.attributes.name === "ws.op") {
        wsOp = rawParam.attributes.fixed;
        continue;
      }
      const param = WadlParam.fromXml(rawParam);
      if (param !== undefined) params.push(param);
    }
    const responseRepresentationIds: string[] = [];
    for (const response of childElements(raw, "response")) {
      for (const representation of childElements(response, "representation")) {
        const id = fragmentId(representation.attributes.href);
        if (id !== undefined) responseRepresentationIds.push(id);
      }
    }
    return new WadlMethod(
      raw.attributes.id,
      raw.attributes.name ?? "",
      documentationText(raw),
      wsOp,
      requestRepresentation?.attributes.mediaType ===
        "application/x-www-form-urlencoded",
      params,
      fragmentId(requestRepresentation?.attributes.href),
      responseRepresentationIds,
    );
  }
}

/** A Launchpad resource type and its operations. */
export class WadlResourceType {
  private constructor(
    public readonly id: string,
    public readonly doc: string | undefined,
    public readonly methods: WadlMethod[],
  ) {}

  /** Read one `<resource_type>` element; omit elements without an id. */
  static fromXml(raw: XmlElement): WadlResourceType | undefined {
    const id = raw.attributes.id;
    if (id === undefined) return undefined;
    return new WadlResourceType(
      id,
      documentationText(raw),
      childElements(raw, "method").map((method) => WadlMethod.fromXml(method)),
    );
  }
}

/** The typed Launchpad WADL document consumed by OpenAPI generation. */
export class WadlDocument {
  private constructor(
    public readonly baseUrl: string,
    public readonly docs: WadlDocBlock[],
    public readonly representations: Record<string, WadlRepresentation>,
    public readonly resourceTypes: Record<string, WadlResourceType>,
  ) {}

  /** Build a complete typed document from the `<application>` element. */
  static fromXml(application: XmlElement): WadlDocument {
    const docs = childElements(application, "doc").flatMap((doc) => {
      const parsed = WadlDocBlock.fromXml(doc);
      return parsed === undefined ? [] : [parsed];
    });
    const representations: Record<string, WadlRepresentation> = {};
    for (const raw of childElements(application, "representation")) {
      const id = raw.attributes.id;
      if (id !== undefined && raw.attributes.mediaType === "application/json") {
        representations[id] = WadlRepresentation.fromXml(raw);
      }
    }
    const resourceTypes: Record<string, WadlResourceType> = {};
    for (const raw of childElements(application, "resource_type")) {
      const resourceType = WadlResourceType.fromXml(raw);
      if (resourceType !== undefined) resourceTypes[resourceType.id] = resourceType;
    }
    const base = childElements(application, "resources")[0]?.attributes.base ?? "";
    return new WadlDocument(
      base.replace(/\/$/, ""),
      docs,
      representations,
      resourceTypes,
    );
  }
}

function childElements(
  parent: XmlElement | undefined,
  name: string,
): XmlElement[] {
  if (parent === undefined) return [];
  return parent.children.filter(
    (child): child is XmlElement =>
      child instanceof XmlElement && localName(child.name) === name,
  );
}

function normalizedText(element: XmlElement | undefined): string | undefined {
  if (element === undefined) return undefined;
  const text = element.text.replace(/\s+/g, " ").trim();
  return text === "" ? undefined : text;
}

function documentationText(element: XmlElement): string | undefined {
  // The model exposes one description per WADL element, so use its first
  // `<doc>`. XmlElement.text includes nested markup; normalize indentation and
  // line wrapping from the XML source into a single prose string.
  return normalizedText(childElements(element, "doc")[0]);
}

function fragmentId(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const hash = value.lastIndexOf("#");
  if (hash === -1 || hash === value.length - 1) return undefined;
  return value.slice(hash + 1);
}
