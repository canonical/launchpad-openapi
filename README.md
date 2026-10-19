# <img src="assets/launchpad-icon.svg" alt="" height="36"> Launchpad OpenAPI

Generate an OpenAPI 3.0.3 document for the Launchpad API in YAML or JSON. `launchpad-openapi` converts Launchpad's WADL service description into resource, operation, parameter, response, and component schema definitions.

You can fetch WADL from a Launchpad instance or convert a local file. Running the converter requires Node.js 24 or later; you do not need Python or a Launchpad checkout.

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

Catalog refreshes require Python 3.9+ and a bootstrapped Launchpad checkout containing its pinned `lazr.restful`, `zope.schema`, `zope.interface`, `lazr.enum`, and `lazr.lifecycle` source archives in `download-cache/dist`:

```console
pnpm metadata:export
pnpm format
pnpm check
pnpm typecheck
pnpm test
pnpm build
```

The default checkout is `../launchpad`, next to this repository, and output defaults to `src/wadl/metadata/`. Override either path when needed:

```console
pnpm metadata:export /path/to/launchpad
pnpm metadata:export /path/to/launchpad --output /path/to/catalog
```

The exporter resolves source declarations without importing or running Launchpad. `src/wadl/metadata/provenance.json` records dependency versions, source hashes, field origins, reviewed values, and unresolved declarations.

If a refresh withdraws a review, it lists the changed definitions under `unresolved`. Re-review those definitions before updating the pinned digests in `export.py`. Regenerate OpenAPI and downstream clients after refreshing the catalog.

## License

Licensed under the [GNU Lesser General Public License version 3](LICENSE), which incorporates the [GNU General Public License version 3](COPYING).
