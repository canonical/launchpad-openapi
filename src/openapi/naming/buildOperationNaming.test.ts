/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { describe, expect, it } from "vitest";
import buildOperationNaming from "./buildOperationNaming.js";

describe("buildOperationNaming", () => {
  it("uses one normalized path for the ID and structured metadata", () => {
    expect(
      buildOperationNaming({
        subject: "archive_dependency",
        namespace: ["archive", "PPA"],
        operation: "getByURL",
      }),
    ).toEqual({
      operationId: "archiveDependency.archive.ppa.getByUrl",
      "x-launchpad-naming-path": {
        subject: "archiveDependency",
        namespace: ["archive", "ppa"],
        operation: "getByUrl",
      },
    });
  });
});
