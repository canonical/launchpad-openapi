/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import type { RouteTemplate } from "../types.js";

/**
 * Compose parent, package-type, and channel contexts without flattening labels.
 * Each template supplies explicit contexts; URL fragments do not determine names.
 */
export default function buildExternalPackageTemplates(
  parents: readonly Required<RouteTemplate>[],
  packageTypes: readonly Required<RouteTemplate>[],
  channels: readonly Required<RouteTemplate>[],
): RouteTemplate[] {
  return parents.flatMap((parent) =>
    packageTypes.flatMap((packageType) =>
      channels.map((channel) => ({
        template: `${parent.template}/+${packageType.template}/{package=firefox}${channel.template}`,
        namespace: [
          ...parent.namespace,
          ...packageType.namespace,
          ...channel.namespace,
        ],
      })),
    ),
  );
}
