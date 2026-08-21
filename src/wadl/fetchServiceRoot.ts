/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { Result, type Result as ResultType } from "better-result";
import { WadlFetchError } from "./errors.js";
import fetchResource from "./fetchResource.js";

/**
 * Fetch the service-root JSON and retain only absolute HTTP(S) links.
 *
 * @note Impure — performs a network request.
 */
export default async function fetchServiceRoot(
  baseUrl: string,
): Promise<ResultType<Record<string, string>, WadlFetchError>> {
  const parsed = await fetchResource<unknown>({
    url: baseUrl,
    accept: "application/json",
    read: (response) => response.json() as Promise<unknown>,
    readErrorMessage: `Failed to parse service-root JSON from ${baseUrl}`,
  });
  return parsed.map((value) => {
    const links: Record<string, string> = {};
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      for (const [key, candidate] of Object.entries(value)) {
        if (typeof candidate === "string" && isWebUrl(candidate)) {
          links[key] = candidate;
        }
      }
    }
    return links;
  });
}

function isWebUrl(value: string): boolean {
  const parsed = Result.try({
    try: () => new URL(value),
    catch: () => undefined,
  });
  if (Result.isError(parsed)) return false;
  return parsed.value.protocol === "http:" || parsed.value.protocol === "https:";
}
