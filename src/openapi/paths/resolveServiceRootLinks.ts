/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import type { WadlRepresentation } from "../../wadl/index.js";
import type { RouteTemplate } from "../types.js";

/** Add exact service-root links without deriving URLs from WADL field names. */
export default function resolveServiceRootLinks(
  serviceRoot: WadlRepresentation | undefined,
  baseUrl: string,
  serviceRootLinks: Record<string, string> | undefined,
): Map<string, RouteTemplate[]> {
  const segments = new Map<string, RouteTemplate[]>();
  if (serviceRoot === undefined) return segments;
  for (const field of serviceRoot.fields) {
    const resourceTypeId = field.linkResourceType;
    if (resourceTypeId === undefined) continue;
    const runtimeLink = serviceRootLinks?.[field.name];
    if (typeof runtimeLink !== "string") continue;
    const prefix = `${baseUrl}/`;
    if (!runtimeLink.startsWith(prefix)) continue;
    const relative = runtimeLink.slice(prefix.length).replace(/\/$/, "");
    // A root self-link or query/fragment does not prove a resource route.
    if (
      relative &&
      !relative.startsWith("/") &&
      !relative.includes("?") &&
      !relative.includes("#")
    ) {
      const links = segments.get(resourceTypeId);
      const route = {
        template: relative,
        namespace: [field.name.replace(/(?:_collection)?_link$/, "")],
      };
      if (links === undefined) segments.set(resourceTypeId, [route]);
      else links.push(route);
    }
  }
  return segments;
}
