# Launchpad metadata exporter

This Python project refreshes the field catalog consumed by the TypeScript
WADL-to-OpenAPI converter. Python is needed only for catalog maintenance, not
for running the converter.

## Setup and checks

Install [uv](https://docs.astral.sh/uv/getting-started/installation/), then run
these commands from this directory:

```console
uv sync --locked
uv run --locked pytest
uv run --locked ruff check .
uv run --locked ruff format --check .
```

The project supports Python 3.9+ and selects Python 3.12 for development.
Its interpreter, dependencies, lockfile, tests, and virtual environment are
independent of the repository's Node.js project. `asttokens` provides AST
source ranges; `platformdirs` selects the operating system's user cache.
pytest and Ruff are development dependencies.

To format Python files, run `uv run --locked ruff format .`.

## Refresh the catalog

Install Git, then run the exporter without a checkout path:

```console
uv run --locked launchpad-metadata-export
uv run --locked launchpad-metadata-export --refresh
uv run --locked python -m launchpad_metadata --cache-dir /path/to/cache --output /path/to/catalog
```

On the first run, it shallow-clones `https://git.launchpad.net/launchpad` into
`launchpad` inside its user-cache directory. It reads Launchpad's tracked
requirements and downloads only the pinned `lazr.restful`, `zope.schema`,
`zope.interface`, `lazr.enum`, and `lazr.lifecycle` source tarballs from PyPI.
Downloads are verified against PyPI's SHA-256 digests and saved atomically;
no dependencies are built or installed and no Launchpad bootstrap is run.

Later runs reuse that checkout and its archives without network access.
`--refresh` fast-forwards the managed checkout before exporting and downloads
any newly required archives. It refuses to update a checkout with tracked
local modifications. `--cache-dir` overrides the operating system's user-cache
location. Clone/download diagnostics go to stderr; stdout remains JSON statistics.

For an existing checkout, pass its path explicitly:

```console
uv run --locked launchpad-metadata-export /path/to/launchpad
```

Explicit checkouts are never cloned, updated, or downloaded into. They must
already contain the five source archives in `download-cache/dist`; both
bootstrapped `requirements/combined.txt` and fresh tracked requirements are
supported. `--refresh` is only for managed checkouts.

Generated files default to the repository's `src/wadl/metadata/` directory,
regardless of the current working directory. Explicit relative checkout,
cache, and output paths are resolved from the current working directory.

From the repository root, `pnpm metadata:export`, `pnpm metadata:test`, and
`pnpm metadata:check` select this project automatically. There is no Python
entry point under `src/wadl/`.

## Source-only extraction

Launchpad application modules are parsed, never imported or executed. The
exporter uses the standalone resolution-order implementation from Launchpad's
pinned `zope.interface` archive to preserve interface precedence.

Dynamic declarations and unsupported marshallers remain unconstrained and are
reported in `provenance.json`. Reviewed values are pinned to hashes of complete
source lines, including decorators and trailing comments; changed evidence
withdraws the review. Re-review those definitions before updating
`src/launchpad_metadata/reviews.py`.

Tests use a small source-only checkout fixture and need no real Launchpad
checkout. The repository's [license](../../LICENSE) applies.
