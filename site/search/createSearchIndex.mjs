/*
 * Copyright 2026 Canonical Ltd. This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { slugify } from "@scalar/helpers/string/slugify";
import Fuse from "fuse.js";

const methods = new Set([
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
]);
const keys = [
  ["title", 0.7],
  ["operationId", 0.6],
  ["parameters", 0.55],
  ["body", 0.55],
  ["path", 0.5],
  ["tag", 0.4],
  ["description", 0.3],
  ["method", 0.3],
  ["responseExamples", 0.25],
  ["parameterDescriptions", 0.2],
  ["bodyDescriptions", 0.2],
].map(([name, weight]) => ({ name, weight }));

function isHidden(value) {
  return value?.["x-internal"] === true || value?.["x-scalar-ignore"] === true;
}

/** Build a source-backed index. Called only in the search worker, never in the UI. */
export default function createSearchIndex(document, environment) {
  const entries = [];
  const fieldCache = new WeakMap();
  const referenceCache = new WeakMap();
  const tags = new Map((document.tags ?? []).map((tag) => [tag.name, tag]));
  const prefix = slugify(environment);

  function resolveRef(value) {
    const original = value;
    if (value && typeof value === "object" && referenceCache.has(value))
      return referenceCache.get(value);
    const visited = new Set();
    while (
      value &&
      typeof value === "object" &&
      typeof value.$ref === "string"
    ) {
      if (!value.$ref.startsWith("#/") || visited.has(value.$ref))
        return undefined;
      visited.add(value.$ref);
      const pointer = decodeURIComponent(value.$ref.slice(2))
        .split("/")
        .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));
      const target = pointer.reduce(
        (node, part) =>
          node && Object.hasOwn(node, part) ? node[part] : undefined,
        document,
      );
      if (!target) return undefined;
      const siblings = { ...value };
      delete siblings.$ref;
      value = Object.keys(siblings).length
        ? { ...target, ...siblings }
        : target;
    }
    if (original && typeof original === "object")
      referenceCache.set(original, value);
    return value;
  }

  function extractFields(input) {
    const schema = resolveRef(input);
    if (!schema || typeof schema !== "object")
      return { names: [], descriptions: [] };
    if (fieldCache.has(schema)) return fieldCache.get(schema);
    const names = new Set();
    const descriptions = new Set();
    const visited = new WeakSet();
    function visit(raw, depth = 0) {
      const node = resolveRef(raw);
      if (!node || typeof node !== "object" || visited.has(node)) return;
      visited.add(node);
      for (const variant of [
        ...(node.allOf ?? []),
        ...(node.anyOf ?? []),
        ...(node.oneOf ?? []),
      ])
        visit(variant, depth);
      for (const [name, property] of Object.entries(node.properties ?? {})) {
        names.add(name);
        const resolved = resolveRef(property);
        if (typeof resolved?.description === "string")
          descriptions.add(resolved.description);
        if (depth < 1) visit(property, depth + 1);
      }
    }
    visit(schema);
    const fields = { names: [...names], descriptions: [...descriptions] };
    fieldCache.set(schema, fields);
    return fields;
  }

  function getTagPrefix(name) {
    return name ? `${prefix}/tag/${slugify(name)}` : prefix;
  }

  entries.push({
    id: `${prefix}/description/introduction`,
    title: "Introduction",
    type: "heading",
    description: document.info?.description ?? "",
  });
  const usedTags = new Set();
  for (const [path, rawPath] of Object.entries(document.paths ?? {})) {
    const pathItem = resolveRef(rawPath);
    if (!pathItem || isHidden(pathItem)) continue;
    for (const [method, rawOperation] of Object.entries(pathItem)) {
      if (!methods.has(method)) continue;
      const operation = resolveRef(rawOperation);
      if (!operation || isHidden(operation)) continue;
      const parameters = new Map();
      for (const raw of [
        ...(pathItem.parameters ?? []),
        ...(operation.parameters ?? []),
      ]) {
        const parameter = resolveRef(raw);
        if (parameter)
          parameters.set(`${parameter.in}/${parameter.name}`, parameter);
      }
      const body = resolveRef(operation.requestBody);
      const fields = Object.values(body?.content ?? {}).map((media) =>
        extractFields(resolveRef(media)?.schema),
      );
      const responseExamples = [];
      for (const rawResponse of Object.values(operation.responses ?? {})) {
        for (const media of Object.values(
          resolveRef(rawResponse)?.content ?? {},
        )) {
          const resolved = resolveRef(media);
          for (const example of [
            resolved?.example,
            ...Object.values(resolved?.examples ?? {}).map(
              (value) => resolveRef(value)?.value,
            ),
          ]) {
            if (example !== undefined)
              responseExamples.push(
                typeof example === "string" ? example : JSON.stringify(example),
              );
          }
        }
      }
      for (const tag of operation.tags?.length ? operation.tags : [undefined]) {
        if (isHidden(tags.get(tag))) continue;
        if (tag) usedTags.add(tag);
        entries.push({
          id: `${getTagPrefix(tag)}/${method.toUpperCase()}${path}`,
          title: operation.summary?.trim() ? operation.summary : path,
          type: "operation",
          method: method.toUpperCase(),
          path,
          tag,
          operationId: operation.operationId,
          description: operation.description ?? "",
          parameters: [...parameters.values()].map((value) => value.name),
          parameterDescriptions: [...parameters.values()]
            .map((value) => value.description)
            .filter(Boolean),
          body: fields.flatMap((value) => value.names),
          bodyDescriptions: fields.flatMap((value) => value.descriptions),
          responseExamples,
        });
      }
    }
  }
  const hasRootModels = Object.values(document.components?.schemas ?? {}).some(
    (raw) => {
      const schema = resolveRef(raw);
      return schema && !isHidden(schema) && !schema["x-tags"]?.length;
    },
  );
  if (hasRootModels) {
    entries.push({ id: `${prefix}/models`, title: "Models", type: "heading" });
  }
  for (const [name, raw] of Object.entries(
    document.components?.schemas ?? {},
  )) {
    const schema = resolveRef(raw);
    if (!schema || isHidden(schema)) continue;
    const fields = extractFields(raw);
    for (const tag of schema["x-tags"]?.length
      ? schema["x-tags"]
      : [undefined]) {
      if (isHidden(tags.get(tag))) continue;
      if (tag) usedTags.add(tag);
      entries.push({
        id: `${getTagPrefix(tag)}/models/${slugify(name, { preserveCase: true })}`,
        title: schema.title || name,
        type: "model",
        description: schema.description ?? "",
        body: fields.names,
        bodyDescriptions: fields.descriptions,
      });
    }
  }
  for (const name of usedTags) {
    const tag = tags.get(name);
    entries.push({
      id: getTagPrefix(name),
      title: tag?.["x-displayName"] ?? name,
      type: "tag",
      description: tag?.description ?? "",
    });
  }
  const fuse = new Fuse(entries, {
    keys,
    threshold: 0.3,
    distance: 100,
    ignoreLocation: true,
    includeMatches: false,
    useExtendedSearch: true,
    findAllMatches: true,
  });
  return {
    search(query, limit = 25) {
      const matches = query.trim()
        ? fuse.search(query, { limit }).map((result) => result.item)
        : entries.slice(0, limit);
      // Never copy schema/description index payloads back onto the main thread.
      return matches.map(({ id, title, type, method, path }) => ({
        id,
        title,
        type,
        method,
        path,
      }));
    },
  };
}
