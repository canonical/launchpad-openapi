/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

/** Known JSON serialization shape; absent members remain unconstrained. */
export type SerializedFieldMetadata = {
  readonly type?:
    | "string"
    | "boolean"
    | "integer"
    | "number"
    | "array"
    | "object";
  readonly format?: string;
  /** Declared optional field accepts None in both input and response domains. */
  readonly nullable?: boolean;
  /** Response marshaller permits None even when input validation requires a value. */
  readonly responseNullable?: boolean;
  readonly items?: SerializedFieldMetadata;
  readonly additionalProperties?: SerializedFieldMetadata;
};
