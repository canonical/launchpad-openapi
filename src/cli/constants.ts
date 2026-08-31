/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

/** Default Launchpad instance hostname. */
export const DEFAULT_INSTANCE = "launchpad.net";

/** Default Launchpad web-service API version. */
export const DEFAULT_VERSION = "devel";

/** Named non-production Launchpad environments available as CLI presets. */
export const ENVIRONMENTS = ["staging", "qastaging"] as const;

/** A named non-production Launchpad environment. */
export type Environment = (typeof ENVIRONMENTS)[number];

/** API base URLs for named non-production Launchpad environments. */
export const ENVIRONMENT_API_URLS: Readonly<Record<Environment, string>> = {
  staging: "https://api.staging.paddev.net/",
  qastaging: "http://api.qastaging.launchpad.net/",
};

