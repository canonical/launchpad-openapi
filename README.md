# <img src="assets/launchpad-icon.svg" alt="" height="36"> Launchpad OpenAPI

Generate an OpenAPI 3.0.3 document for the Launchpad API in YAML or JSON. `launchpad-openapi` converts Launchpad's WADL service description into resource, operation, parameter, response, and component schema definitions.

You can fetch WADL from a Launchpad instance or convert a local file. Running the converter requires Node.js 24 or later; you do not need Python or a Launchpad checkout.

## API reference

Browse the [Launchpad API reference](https://canonical.github.io/launchpad-openapi/)
with production and qastaging specs. The raw documents are also available as
[production JSON](https://canonical.github.io/launchpad-openapi/production.json)
and [qastaging JSON](https://canonical.github.io/launchpad-openapi/qastaging.json).

## Quick start

Install the CLI globally from npm:

```console
npm install --global @canonical/launchpad-openapi
```

Generate a YAML document for the default `https://api.launchpad.net/devel/` API:

```console
launchpad-openapi --output launchpad-openapi.yaml
```

## Choose your input

### Use a Launchpad environment

Generate a document for `qastaging` instead of the default instance:

```console
launchpad-openapi --environment qastaging --output launchpad-qastaging-openapi.yaml
```

The `staging` preset is also available. To select another source, use `--instance` for a Launchpad hostname or `--api-url` for an API base URL. Use `--version` to select the web-service API version; the default is `devel`.

### Convert a local WADL file

Use `--input` to read a file instead of fetching WADL. Set `--version` to identify the API version represented by the input:

```console
launchpad-openapi convert \
  --input path/to/launchpad.wadl \
  --version devel \
  --format json \
  --output launchpad-openapi.json
```

## Usage

```text
launchpad-openapi [options] [command]
```

Source selection follows this precedence: `--input`, then `--api-url`, then `--environment`, then `--instance`. Output defaults to YAML and goes to standard output when `--output` is omitted.

### Input options

- **`--input <file>`** — Read WADL from a local file instead of fetching it.
- **`--api-url <url>`** — Use an API base URL instead of an environment or instance.
- **`-e, --environment <name>`** — Use the `staging` or `qastaging` environment preset.
- **`--instance <host>`** — Set the Launchpad hostname. Defaults to `launchpad.net`.
- **`--version <value>`** — Set the web-service API version. Defaults to `devel`.

### Output options

- **`-o, --output <file>`** — Write the generated document to a file.
- **`--stdout`** — Write to standard output; cannot be combined with `--output`.
- **`--format <format>`** — Select `yaml` (the default) or `json`.

### General options

- **`-h, --help`** — Show the complete command help.

## Development

Install the locked development dependencies, then run the checks or build:

```console
pnpm install --frozen-lockfile
pnpm format
pnpm check
pnpm typecheck
pnpm test
pnpm build
```

`pnpm format` formats source and configuration files. `pnpm check` runs Oxlint and verifies formatting without changing files.

The test suite covers WADL parsing, OpenAPI generation, CLI behavior, local-file conversion, and validation of generated output with an OpenAPI parser.

### Refresh the field catalog

Catalog refreshes require [uv](https://docs.astral.sh/uv/getting-started/installation/) and Git. The exporter automatically shallow-clones the public Launchpad repository and downloads its five pinned dependency source archives from PyPI; no sibling checkout or Launchpad bootstrap is needed. The separate [metadata exporter project](tools/metadata-exporter/README.md) declares Python 3.9+ in its own `pyproject.toml` and selects Python 3.12 for development in `.python-version`. uv installs the locked exporter dependencies (including `asttokens` for AST source ranges) in `tools/metadata-exporter/.venv`:

```console
uv sync --locked --project tools/metadata-exporter
pnpm metadata:test
pnpm metadata:check
pnpm metadata:export
pnpm format
pnpm check
pnpm typecheck
pnpm test
pnpm build
```

The managed checkout lives in the operating system's user cache and is reused without network access once its archives are present. Use `--refresh` to update it, or `--cache-dir` to choose another cache location. Output still defaults to `src/wadl/metadata/`:

```console
pnpm metadata:export
pnpm metadata:export --refresh
pnpm metadata:export --cache-dir /path/to/cache --output /path/to/catalog
```

You can still pass an existing checkout explicitly. This bypasses cloning and downloading, so its pinned source archives must already be present in `download-cache/dist`:

```console
pnpm metadata:export /path/to/launchpad --output /path/to/catalog
```

`pnpm metadata:export` runs `uv run --locked --project tools/metadata-exporter launchpad-metadata-export`. You can also run `uv run --locked --project tools/metadata-exporter python -m launchpad_metadata` with the same arguments. All Python source, tests, and configuration live in `tools/metadata-exporter/`; `src/wadl/metadata/` contains only the generated catalog and TypeScript metadata code.

The exporter resolves source declarations without importing or running Launchpad. It uses the standalone resolution-order implementation from the pinned `zope.interface` archive, preserving Zope's interface precedence. `asttokens` tracks original source ranges while review hashes continue to cover complete lines, including decorators and trailing comments. `src/wadl/metadata/provenance.json` records dependency versions, source hashes, field origins, reviewed values, and unresolved declarations.

The Python tests use a small source-only checkout fixture and do not require a real Launchpad checkout. To format Python files, run `uv run --locked --directory tools/metadata-exporter ruff format .`; the existing `pnpm check` and `pnpm test` commands continue to check the TypeScript application.

If a refresh withdraws a review, it lists the changed definitions under `unresolved`. Re-review those definitions before updating the pinned digests in `tools/metadata-exporter/src/launchpad_metadata/reviews.py`. Regenerate OpenAPI and downstream clients after refreshing the catalog.

## Publishing

Development stays on Launchpad. See [mirroring and npm publishing](docs/publishing.md)
for the GitHub mirror, version-triggered releases, and npm trusted-publisher setup.

## License

Licensed under the [GNU Lesser General Public License version 3](LICENSE), which incorporates the [GNU General Public License version 3](COPYING).
