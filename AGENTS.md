# Agent guide

Start with [README.md](README.md) for purpose and usage; use `package.json` for current commands. The executable entry point is `src/index.ts`; conversion flows through `src/cli/`, `src/wadl/`, and `src/openapi/`.

Read the applicable guides in [docs/code-standards/](docs/code-standards/). Consult [docs/tooling/better-result.md](docs/tooling/better-result.md) when changing error handling.

## Respect

- Preserve WADL-derived semantics and produce valid OpenAPI 3.0.3; do not invent missing source information.
- Keep changes in the owning module and follow existing domain boundaries and export conventions.
- Use precise names for meaningful intermediate values; leave trivial one-use expressions inline.
- Test observable behavior: unit tests beside source, shared fixtures in `testing/`, integration tests in `src/testing/integration/`.
- For behavior changes, main coordinates **contract → RED → GREEN → QA**:
  the test agent confirms a meaningful failure before implementation;
  the implementation agent passes tests without weakening them;
  independent QA checks the contract and actual behavior.
  Report verification. Do not commit or push unless explicitly requested.
- Focus tests on meaningful contracts rather than every implementation detail.
- Write documentation that explains decisions and behavior, not code inventories.
