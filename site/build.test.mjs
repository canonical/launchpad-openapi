/*
 * Copyright 2026 Canonical Ltd. This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { siteOpenApi } from "../testing/fixtures.ts";

describe("static reference build", () => {
  it("embeds both specs unchanged and safely escapes HTML script delimiters", async () => {
    const directory = await mkdtemp(join(tmpdir(), "launchpad-site-build-"));
    try {
      const input = join(directory, "spec.json");
      const output = join(directory, "nested", "index.html");
      await writeFile(input, JSON.stringify(siteOpenApi));
      execFileSync(process.execPath, [
        fileURLToPath(new URL("./build.mjs", import.meta.url)),
        input,
        input,
        output,
      ]);
      const html = await readFile(output, "utf8");
      for (const environment of ["production", "qastaging"]) {
        const embedded = html.match(
          new RegExp(
            `<script id="spec-${environment}" type="application/json">([\\s\\S]*?)</script>`,
          ),
        );
        assert.ok(embedded, `Missing ${environment}`);
        assert.deepEqual(JSON.parse(embedded[1]), siteOpenApi);
      }
      assert.ok(!html.includes('<script>alert("injected")</script>'));
      assert.ok(html.includes("Launchpad API docs"));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
