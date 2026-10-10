/*
 * Copyright 2026 Canonical Ltd. This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const [productionPath, qastagingPath, outputPath = "site/dist/index.html"] =
  process.argv.slice(2);

if (!productionPath || !qastagingPath) {
  throw new Error(
    "Usage: node site/build.mjs <production.json> <qastaging.json> [output.html]",
  );
}

let html = await readFile(new URL("./index.html", import.meta.url), "utf8");
for (const [name, path] of [
  ["production", productionPath],
  ["qastaging", qastagingPath],
]) {
  const spec = JSON.parse(await readFile(path, "utf8"));
  // Keep source text from closing the HTML script element. Parsing the
  // embedded JSON recovers exactly the original OpenAPI document.
  const json = JSON.stringify(spec).replaceAll("<", "\\u003c");
  const marker = `<script id="spec-${name}" type="application/json"></script>`;
  if (!html.includes(marker)) throw new Error(`Missing spec marker: ${name}`);
  html = html.replace(
    marker,
    () =>
      `<script id="spec-${name}" type="application/json">\n${json}\n    </script>`,
  );
}
for (const [marker, entry, globalName] of [
  ["<!-- SEARCH_WORKER -->", "./search/search-worker.mjs", undefined],
  ["<!-- SEARCH_UI -->", "./search/createSearch.mjs", "LaunchpadSearch"],
]) {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL(entry, import.meta.url))],
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    globalName,
    minify: true,
    // esbuild escapes closing script tags in string literals for inline use.
    supported: { "inline-script": false },
  });
  if (!html.includes(marker))
    throw new Error(`Missing search marker: ${marker}`);
  html = html.replace(marker, () => bundle.outputFiles[0].text);
}
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, html);
console.log(`Built ${outputPath}`);
