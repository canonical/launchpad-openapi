/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

/** Return an XML qualified name without its namespace prefix. */
export function localName(qualifiedName: string): string {
  return qualifiedName.slice(qualifiedName.lastIndexOf(":") + 1);
}
