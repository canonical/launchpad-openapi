/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import type { Result as ResultType } from "better-result";
import { WADL_ACCEPT } from "./constants.js";
import { WadlFetchError } from "./errors.js";
import fetchResource from "./fetchResource.js";

/**
 * Fetch raw WADL XML from a Launchpad API root.
 *
 * @note Impure — performs a network request.
 */
export default async function fetchWadl(
  url: string,
): Promise<ResultType<string, WadlFetchError>> {
  return fetchResource({
    url,
    accept: WADL_ACCEPT,
    read: (response) => response.text(),
    readErrorMessage: `Failed to read response body from ${url}`,
  });
}
