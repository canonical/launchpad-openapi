/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { Result } from "better-result";
import { afterEach, assert, describe, expect, it, vi } from "vitest";
import fetchServiceRoot from "./fetchServiceRoot.js";

const url = "https://api.launchpad.test/1.0/";

afterEach(() => vi.unstubAllGlobals());

describe("fetchServiceRoot", () => {
  it("returns only string-valued links from JSON", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        people_collection_link: `${url}people`,
        fruit: "banana",
        legacy_link: "ftp://api.launchpad.test/legacy",
        relative_link: "/relative",
        count: 2,
        absent: null,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchServiceRoot(url).then((result) => result.unwrap()),
    ).resolves.toEqual({ people_collection_link: `${url}people` });
    expect(fetchMock).toHaveBeenCalledWith(url, {
      headers: { Accept: "application/json" },
      redirect: "follow",
    });
  });

  it("returns an empty map for non-object JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(["not", "links"])));
    await expect(
      fetchServiceRoot(url).then((result) => result.unwrap()),
    ).resolves.toEqual({});
  });

  it("wraps response, network, and JSON failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("failure", { status: 503 })),
    );
    const responseResult = await fetchServiceRoot(url);
    assert(Result.isError(responseResult));
    expect(responseResult.error.status).toBe(503);

    const networkFailure = new Error("offline");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw networkFailure;
      }),
    );
    const networkResult = await fetchServiceRoot(url);
    assert(Result.isError(networkResult));
    expect(networkResult.error.cause).toBe(networkFailure);

    const jsonFailure = new Error("invalid JSON");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => {
          throw jsonFailure;
        },
      })),
    );
    const jsonResult = await fetchServiceRoot(url);
    assert(Result.isError(jsonResult));
    expect(jsonResult.error.cause).toBe(jsonFailure);
  });
});
