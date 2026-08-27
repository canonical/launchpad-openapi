/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

/**
 * Typed WADL parsing and retrieval API.
 * @module wadl
 */

export { default as buildApiUrl } from "./buildApiUrl.js";
export {
  WadlFetchError,
  WadlParseError,
  WadlUrlError,
} from "./errors.js";
export { default as fetchServiceRoot } from "./fetchServiceRoot.js";
export { default as fetchWadl } from "./fetchWadl.js";
export {
  WadlDocBlock,
  WadlDocument,
  WadlMethod,
  WadlParam,
  WadlRepresentation,
  WadlResourceType,
} from "./model.js";
export { default as parseWadl } from "./parseWadl.js";
