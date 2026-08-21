/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { Result, type Result as ResultType } from "better-result";
import { WadlFetchError } from "./errors.js";

interface FetchResourceOptions<T> {
  url: string;
  accept: string;
  read: (response: Response) => Promise<T>;
  readErrorMessage: string;
}

/** Fetch and decode one Launchpad API resource. */
export default async function fetchResource<T>({
  url,
  accept,
  read,
  readErrorMessage,
}: FetchResourceOptions<T>): Promise<ResultType<T, WadlFetchError>> {
  return Result.gen(async function* () {
    const response = yield* Result.await(
      Result.tryPromise({
        try: () =>
          fetch(url, {
            headers: { Accept: accept },
            redirect: "follow",
          }),
        catch: (cause) =>
          new WadlFetchError({
            url,
            message: `Network request to ${url} failed`,
            cause,
          }),
      }),
    );
    if (!response.ok) {
      return yield* new WadlFetchError({
        url,
        status: response.status,
        message: `Request to ${url} failed: HTTP ${response.status}`,
      });
    }
    const body = yield* Result.await(
      Result.tryPromise({
        try: () => read(response),
        catch: (cause) =>
          new WadlFetchError({
            url,
            message: readErrorMessage,
            cause,
          }),
      }),
    );
    return Result.ok(body);
  });
}
