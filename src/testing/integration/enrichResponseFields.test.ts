/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import type { ComponentsObject, SchemaObject } from "openapi3-ts/oas30";
import { describe, expect, it } from "vitest";
import { metadataEnrichmentWadl } from "../../../testing/fixtures.js";
import { generateOpenApi } from "../../openapi/index.js";
import { parseWadl } from "../../wadl/index.js";

type ComponentSchemas = NonNullable<ComponentsObject["schemas"]>;

function convert(wadl = metadataEnrichmentWadl) {
  const schemas = generateOpenApi(parseWadl(wadl).unwrap()).unwrap().components
    ?.schemas;
  if (schemas === undefined)
    throw new Error("Missing generated component schemas");
  return schemas;
}

function representation(schemas: ComponentSchemas, id: string): SchemaObject {
  const schema = schemas[id];
  if (schema === undefined || "$ref" in schema) {
    throw new Error(`Missing object representation ${id}`);
  }
  return schema;
}

function serializedValueField(
  schemas: ComponentSchemas,
  id: string,
  name: string,
): SchemaObject {
  const property = representation(schemas, id).properties?.[name];
  if (property === undefined || "$ref" in property) {
    throw new Error(`Missing field ${id}.${name}`);
  }
  if (property.oneOf === undefined) return property;
  expect(property.oneOf[1]).toEqual({
    type: "string",
    enum: ["tag:launchpad.net:2008:redacted"],
  });
  const value = property.oneOf[0];
  if (value === undefined || "$ref" in value) {
    throw new Error(`Missing serialized value domain ${id}.${name}`);
  }
  return value;
}

describe("authoritative response field enrichment", () => {
  it("keeps response-only reference nullability out of diff and write inputs", () => {
    const schemas = convert();
    expect(
      serializedValueField(schemas, "project-full", "owner_link"),
    ).toMatchObject({
      type: "string",
      format: "uri",
      nullable: true,
    });
    for (const id of ["project-diff", "project-write"]) {
      expect(serializedValueField(schemas, id, "owner_link")).toEqual({
        type: "string",
        format: "uri",
        "x-lp-resource-type": "person",
      });
      expect(serializedValueField(schemas, id, "driver_link")).toEqual({
        type: "string",
        format: "uri",
        "x-lp-resource-type": "person",
        nullable: true,
      });
    }
  });

  it("separates nested reference item domains between responses and requests", () => {
    const schemas = convert();
    expect(
      serializedValueField(schemas, "builder-full", "processors").items,
    ).toEqual({
      type: "string",
      format: "uri",
      nullable: true,
    });
    expect(
      serializedValueField(schemas, "builder-diff", "processors").items,
    ).toEqual({
      type: "string",
      format: "uri",
    });
  });

  it("leaves pagination-like names unconstrained outside collection schemas", () => {
    const schemas = convert();
    for (const id of ["imaginary_project-full", "imaginary_project-diff"]) {
      for (const name of ["start", "total_size", "entries"]) {
        expect(serializedValueField(schemas, id, name)).toEqual({});
      }
    }
  });

  it("retains only the exact serializer redaction marker alongside recovered values", () => {
    const schemas = convert();
    expect(
      representation(schemas, "project-full").properties?.license_approved,
    ).toEqual({
      oneOf: [
        { type: "boolean" },
        { type: "string", enum: ["tag:launchpad.net:2008:redacted"] },
      ],
    });
    expect(
      representation(schemas, "project-full").properties?.licenses,
    ).toMatchObject({
      oneOf: [
        { type: "array", items: { type: "string" } },
        { type: "string", enum: ["tag:launchpad.net:2008:redacted"] },
      ],
    });
  });

  it("preserves null in declared nullable enum domains", () => {
    const schemas = convert();
    expect(serializedValueField(schemas, "project-full", "vcs")).toMatchObject({
      type: "string",
      enum: ["Bazaar", "Git", null],
      nullable: true,
    });
  });

  it("uses effective inherited privacy fields and positional collection item declarations", () => {
    const schemas = convert();
    expect(serializedValueField(schemas, "snap-full", "private")).toMatchObject(
      {
        type: "boolean",
        nullable: true,
      },
    );
    for (const [id, name] of [
      ["ci_build-full", "git_refs"],
      ["snap_build-full", "target_architectures"],
    ]) {
      expect(serializedValueField(schemas, id, name)).toMatchObject({
        type: "array",
        items: { type: "string" },
        nullable: true,
      });
    }
  });

  it("recovers strings across project, person, and archive interfaces", () => {
    const schemas = convert();

    for (const [id, name] of [
      ["project-full", "display_name"],
      ["person-full", "display_name"],
      ["archive-full", "name"],
    ] as const) {
      expect(serializedValueField(schemas, id, name)).toMatchObject({
        type: "string",
      });
    }
  });

  it("recovers integer, boolean, and floating-point fields across unrelated resources", () => {
    const schemas = convert();

    expect(serializedValueField(schemas, "bug-full", "id")).toMatchObject({
      type: "integer",
    });
    expect(serializedValueField(schemas, "bug-full", "private")).toMatchObject({
      type: "boolean",
    });
    expect(
      serializedValueField(schemas, "project-full", "active"),
    ).toMatchObject({
      type: "boolean",
    });
    expect(
      serializedValueField(schemas, "archive-full", "relative_build_score"),
    ).toMatchObject({
      type: "integer",
    });
    expect(
      serializedValueField(schemas, "person-full", "latitude"),
    ).toMatchObject({
      type: "number",
      nullable: true,
    });
  });

  it("retains declared collection item types instead of inventing string scalars", () => {
    const schemas = convert();

    expect(serializedValueField(schemas, "bug-full", "tags")).toMatchObject({
      type: "array",
      items: { type: "string" },
      nullable: true,
    });
    expect(
      serializedValueField(schemas, "project-full", "licenses"),
    ).toMatchObject({
      type: "array",
      items: { type: "string" },
    });
    expect(
      serializedValueField(
        schemas,
        "git_repository-full",
        "builder_constraints",
      ),
    ).toMatchObject({
      type: "array",
      items: { type: "string" },
      nullable: true,
    });
  });

  it("retains recursive dictionary value types and their independently declared nullability", () => {
    const schemas = convert();

    expect(
      serializedValueField(schemas, "project-full", "content_templates"),
    ).toMatchObject({
      type: "object",
      nullable: true,
      additionalProperties: {
        type: "object",
        nullable: true,
        additionalProperties: { type: "string", nullable: true },
      },
    });
    expect(representation(schemas, "project-full").required).toContain(
      "content_templates",
    );
  });

  it("uses declared nullable text and tuple domains without inferring nullability from WADL presence", () => {
    const schemas = convert();

    expect(
      serializedValueField(schemas, "archive-full", "signing_key_fingerprint"),
    ).toMatchObject({
      type: "string",
      nullable: true,
    });
    expect(representation(schemas, "archive-full").required).toContain(
      "signing_key_fingerprint",
    );
    expect(
      serializedValueField(schemas, "git_repository-full", "description"),
    ).toMatchObject({
      type: "string",
      nullable: true,
    });
    for (const id of ["git_repository-full", "git_repository-diff"]) {
      expect(
        serializedValueField(schemas, id, "builder_constraints"),
      ).toMatchObject({
        type: "array",
        nullable: true,
      });
    }
    expect(representation(schemas, "git_repository-full").required).toEqual([
      "builder_constraints",
    ]);
    expect(
      representation(schemas, "git_repository-diff").required,
    ).toBeUndefined();
    expect(
      serializedValueField(schemas, "git_repository-full", "owner_default"),
    ).toMatchObject({
      type: "boolean",
    });
    expect(
      serializedValueField(schemas, "git_repository-full", "owner_default"),
    ).not.toHaveProperty("nullable");
    expect(
      serializedValueField(schemas, "person-full", "display_name"),
    ).not.toHaveProperty("nullable");
  });

  it("shares interface field types across full, diff, and write without sharing WADL required flags", () => {
    const schemas = convert();

    for (const id of ["project-full", "project-diff", "project-write"]) {
      expect(serializedValueField(schemas, id, "display_name")).toMatchObject({
        type: "string",
      });
    }
    expect(representation(schemas, "project-full").required).toContain(
      "display_name",
    );
    expect(representation(schemas, "project-diff").required).toBeUndefined();
    expect(representation(schemas, "project-write").required).toContain(
      "display_name",
    );
    expect(
      serializedValueField(schemas, "project-diff", "licenses"),
    ).toMatchObject({
      type: "string",
    });
    expect(
      serializedValueField(schemas, "project-diff", "licenses"),
    ).not.toHaveProperty("items");
  });

  it.each([
    "xsd:unsupported",
    "foreign:string",
    "unbound:string",
    "xsd:string:malformed",
    ":string",
    "",
  ])(
    "does not replace an explicit unsupported WADL type %j with metadata",
    (type) => {
      const schemas = convert(
        metadataEnrichmentWadl.replace(
          '<wadl:param name="licenses" required="true"/>',
          `<wadl:param name="licenses" required="true" type="${type}"/>`,
        ),
      );

      expect(serializedValueField(schemas, "project-full", "licenses")).toEqual(
        {},
      );
      expect(representation(schemas, "project-full").required).toContain(
        "licenses",
      );
    },
  );

  it("preserves explicit scalar types even when authoritative metadata declares an array", () => {
    const schemas = convert(
      metadataEnrichmentWadl.replace(
        '<wadl:param name="licenses" required="true"/>',
        '<wadl:param name="licenses" required="true" type="xsd:integer"/>',
      ),
    );

    expect(
      serializedValueField(schemas, "project-full", "licenses"),
    ).toMatchObject({
      type: "integer",
    });
    expect(
      serializedValueField(schemas, "project-full", "licenses"),
    ).not.toHaveProperty("items");
  });

  it("preserves an explicit array shape on a metadata-known scalar", () => {
    const schemas = convert(
      metadataEnrichmentWadl.replace(
        '<wadl:param name="display_name" required="true"/>',
        '<wadl:param name="display_name" required="true" type="xsd:string" repeating="true"/>',
      ),
    );

    expect(
      serializedValueField(schemas, "project-full", "display_name"),
    ).toMatchObject({
      type: "array",
    });
    expect(
      serializedValueField(schemas, "project-full", "display_name").items,
    ).toEqual({
      type: "string",
    });
  });

  it("does not attach a nullable metadata type to an explicit foreign type", () => {
    const schemas = convert(
      metadataEnrichmentWadl.replace(
        '<wadl:param name="signing_key_fingerprint" required="true" type="xsd:string"/>',
        '<wadl:param name="signing_key_fingerprint" required="true" type="foreign:string"/>',
      ),
    );

    expect(
      serializedValueField(schemas, "archive-full", "signing_key_fingerprint"),
    ).toEqual({});
    expect(representation(schemas, "archive-full").required).toContain(
      "signing_key_fingerprint",
    );
  });

  it("leaves unknown fields and resource names unconstrained without guessing from names or prose", () => {
    const schemas = convert();

    expect(serializedValueField(schemas, "project-full", "count")).toEqual({
      description: "An integer count, or null.",
    });
    expect(
      serializedValueField(schemas, "project-full", "opaque_payload"),
    ).toEqual({});
    expect(
      serializedValueField(schemas, "imaginary_project-full", "display_name"),
    ).toEqual({});
    expect(
      serializedValueField(schemas, "imaginary_project-full", "active"),
    ).toEqual({});
    expect(
      serializedValueField(schemas, "imaginary_project-full", "tags"),
    ).toEqual({});
    expect(representation(schemas, "project-full").required).toContain("count");
    expect(representation(schemas, "imaginary_project-full").required).toEqual([
      "display_name",
    ]);
  });

  it("keeps page properties WADL-backed rather than borrowing full-resource metadata", () => {
    const schemas = convert();

    expect(
      serializedValueField(schemas, "person-page", "display_name"),
    ).toEqual({});
    expect(
      serializedValueField(schemas, "person-page", "total_size"),
    ).toMatchObject({
      type: "integer",
    });
    expect(
      serializedValueField(schemas, "person-page", "entries"),
    ).toMatchObject({
      type: "array",
      items: { $ref: "#/components/schemas/person-full" },
    });
    expect(
      serializedValueField(schemas, "person-page", "entries"),
    ).not.toHaveProperty("nullable");
    expect(representation(schemas, "person-page").required).toEqual([
      "total_size",
      "entries",
    ]);
  });
});
