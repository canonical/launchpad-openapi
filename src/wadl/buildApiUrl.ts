/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { Result, type Result as ResultType } from "better-result";
import { API_HOST_PREFIX } from "./constants.js";
import { WadlUrlError } from "./errors.js";


/**
 * Build a Launchpad API root URL.
 *
 * An explicit API URL is preserved with a trailing slash. Otherwise the host
 * is derived from an instance hostname or URL and prefixed with `api.`.
 */
export default function buildApiUrl(
  apiUrl: string,
): ResultType<string, WadlUrlError>;
export default function buildApiUrl(
  instance: string,
  version: string,
): ResultType<string, WadlUrlError>;
export default function buildApiUrl(
  instanceOrApiUrl: string,
  version?: string,
): ResultType<string, WadlUrlError> {
  if (version === undefined) {
    return Result.ok(
      instanceOrApiUrl.endsWith("/")
        ? instanceOrApiUrl
        : `${instanceOrApiUrl}/`,
    );
  }
  const host: ResultType<string, WadlUrlError> =
    instanceOrApiUrl.includes("://")
      ? Result.try({
          try: () => new URL(instanceOrApiUrl).host,
          catch: () =>
            new WadlUrlError({
              instance: instanceOrApiUrl,
              message: `Invalid instance URL: ${instanceOrApiUrl}`,
            }),
        })
      : Result.ok(instanceOrApiUrl);
  return host.map((resolved) => {
    const apiHost = resolved.startsWith(API_HOST_PREFIX)
      ? resolved
      : `${API_HOST_PREFIX}${resolved}`;
    return `https://${apiHost}/${version}/`;
  });
}
