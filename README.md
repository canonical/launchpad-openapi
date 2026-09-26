# <img src="assets/launchpad-icon.svg" alt="" height="36"> Launchpad OpenAPI

`launchpad-openapi` is a command-line converter for Launchpad's WADL service description. It produces an OpenAPI 3.0.3 document that describes Launchpad resources, operations, parameters, responses, and component schemas.

The converter can fetch a WADL document from a Launchpad instance or read one from a local file. Output is available as YAML or JSON.

## Requirements

- Node.js 24 or later

## Quick start

Install the CLI globally from npm:

```console
npm install --global @canonical/launchpad-openapi
```

Generate a YAML description of the default `https://api.launchpad.net/devel/` API:

```console
launchpad-openapi --output launchpad-openapi.yaml
```

Generate a YAML description of the `qastaging` environment:

```console
launchpad-openapi --environment qastaging --output launchpad-qastaging-openapi.yaml
```

## Usage

```text
launchpad-openapi [options] [command]
```

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

Output is written to standard output when `--output` is omitted. Source selection follows this precedence: `--input`, then `--api-url`, then `--environment`, then `--instance`.

### Convert a local WADL file

Use `--version` to identify the API version represented by the input:

```console
launchpad-openapi convert \
  --input path/to/launchpad.wadl \
  --version devel \
  --format json \
  --output launchpad-openapi.json
```

### Use a named Launchpad environment

```console
launchpad-openapi \
  --environment staging \
  --version devel \
  --output staging-openapi.yaml
```

Online conversion also reads the Launchpad service root to resolve top-level collection paths. If the service root is unavailable, conversion falls back to paths derived from the WADL document.

## Development

Install the locked development dependencies, then run the available checks or build:

```console
pnpm install --frozen-lockfile
pnpm format
pnpm check
pnpm typecheck
pnpm test
pnpm build
```

`pnpm format` formats source and configuration files; `pnpm check` runs Oxlint and verifies formatting without changing files.

The test suite covers WADL parsing, OpenAPI generation, CLI behavior, local-file conversion, and validation of generated output with an OpenAPI parser.

## License

Licensed under the [GNU Lesser General Public License version 3](LICENSE), which incorporates the [GNU General Public License version 3](COPYING).
