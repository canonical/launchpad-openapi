/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { Result } from "better-result";
import { afterEach, assert, describe, expect, it, vi } from "vitest";
import { sampleWadl, serviceRootLinks } from "../../testing/fixtures.js";
import { optionsSchema } from "./schemas.js";
import loadOpenApi from "./loadOpenApi.js";

const WADL_ACCEPT = "application/vd.sun.wadl+xml";

afterEach(() => vi.unstubAllGlobals());

describe("loadOpenApi", () => {
  it("fetches WADL and service-root links from a derived API URL", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) =>
      (init?.headers as Record<string, string> | undefined)?.Accept === WADL_ACCEPT
        ? new Response(sampleWadl)
        : Response.json(serviceRootLinks),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadOpenApi(
      optionsSchema.parse({
        instance: "launchpad.test",
        version: "1.0",
      }),
    );

    assert(Result.isOk(result));
    expect(result.value.info.version).toBe("1.0");
    expect(result.value.paths).toHaveProperty("/people/+me");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.launchpad.test/1.0/",
      expect.objectContaining({ headers: { Accept: WADL_ACCEPT } }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.launchpad.test/1.0/",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
  });

  it.each([
    ["staging", "https://api.staging.paddev.net/beta/"],
    ["qastaging", "http://api.qastaging.launchpad.net/beta/"],
  ] as const)(
    "uses the %s environment API base URL",
    async (environment, expectedUrl) => {
      const fetchMock = vi.fn(
        async (_url: string | URL | Request, init?: RequestInit) =>
          (init?.headers as Record<string, string> | undefined)?.Accept ===
          WADL_ACCEPT
            ? new Response(sampleWadl)
            : Response.json(serviceRootLinks),
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await loadOpenApi(
        optionsSchema.parse({ environment, version: "beta" }),
      );

      assert(Result.isOk(result));
      expect(result.value.info.version).toBe("beta");
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        expectedUrl,
        expect.objectContaining({ headers: { Accept: WADL_ACCEPT } }),
      );
    },
  );

  it("lets an explicit API base URL override an environment preset", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(sampleWadl))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadOpenApi(
      optionsSchema.parse({
        environment: "staging",
        apiUrl: "https://api.launchpad.test/",
        version: "custom",
      }),
    );

    assert(Result.isOk(result));
    expect(result.value.info.version).toBe("custom");
    expect(result.value.paths).not.toHaveProperty("/people/+me");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.launchpad.test/custom/",
      expect.any(Object),
    );
  });
});
