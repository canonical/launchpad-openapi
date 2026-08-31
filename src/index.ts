#!/usr/bin/env node
/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import { Result } from "better-result";
import { runCli } from "./cli/index.js";

const result = await runCli(process.argv.slice(2));
if (Result.isError(result)) {
  process.stderr.write(`${result.error.message}\n`);
  process.exitCode = 1;
}
