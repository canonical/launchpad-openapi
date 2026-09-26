/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { Result } from "better-result";
import { afterEach, assert, describe, expect, it, vi } from "vitest";
import { sampleWadl } from "../../testing/fixtures.js";
import fetchWadl from "./fetchWadl.js";

const url = "https://api.launchpad.test/1.0/";

afterEach(() => vi.unstubAllGlobals());

describe("fetchWadl", () => {
  it("fetches WADL with the negotiated media type", async () => {
    const fetchMock = vi.fn(
      async () => new Response(sampleWadl, { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchWadl(url).then((result) => result.unwrap()),
    ).resolves.toBe(sampleWadl);
    expect(fetchMock).toHaveBeenCalledWith(url, {
      headers: { Accept: "application/vd.sun.wadl+xml" },
      redirect: "follow",
    });
  });

  it("returns status details for non-success responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("missing", { status: 404 })),
    );
    const result = await fetchWadl(url);
    assert(Result.isError(result));
    expect(result.error).toMatchObject({
      _tag: "WadlFetchError",
      url,
      status: 404,
    });
  });

  it("wraps network and body-read failures", async () => {
    const networkFailure = new Error("offline");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw networkFailure;
      }),
    );
    const networkResult = await fetchWadl(url);
    assert(Result.isError(networkResult));
    expect(networkResult.error.cause).toBe(networkFailure);

    const bodyFailure = new Error("unreadable");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        text: async () => {
          throw bodyFailure;
        },
      })),
    );
    const bodyResult = await fetchWadl(url);
    assert(Result.isError(bodyResult));
    expect(bodyResult.error.cause).toBe(bodyFailure);
  });
});
