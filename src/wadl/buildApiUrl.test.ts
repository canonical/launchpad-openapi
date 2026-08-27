/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { Result } from "better-result";
import { assert, describe, expect, it } from "vitest";
import buildApiUrl from "./buildApiUrl.js";

describe("buildApiUrl", () => {
  it("uses explicit API URLs verbatim with one trailing slash", () => {
    expect(buildApiUrl("https://custom.test/api").unwrap()).toBe(
      "https://custom.test/api/",
    );
    expect(buildApiUrl("https://custom.test/api/").unwrap()).toBe(
      "https://custom.test/api/",
    );
  });

  it("derives API hosts from hostnames and instance URLs", () => {
    expect(buildApiUrl("launchpad.test", "devel").unwrap()).toBe(
      "https://api.launchpad.test/devel/",
    );
    expect(
      buildApiUrl("https://api.staging.test/path", "beta").unwrap(),
    ).toBe("https://api.staging.test/beta/");
  });

  it("returns a typed URL error for malformed instance URLs", () => {
    const result = buildApiUrl("https://", "devel");
    assert(Result.isError(result));
    expect(result.error._tag).toBe("WadlUrlError");
    expect(result.error.instance).toBe("https://");
  });
});
