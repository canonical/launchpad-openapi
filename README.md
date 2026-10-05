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

Online conversion uses service-root links to supplement source-backed canonical routes; local-file conversion uses the same checked-in catalog. Unverified WADL types are reported in `x-launchpad-route-coverage` rather than assigned invented paths.

OpenAPI cannot represent two differently named templates with the same path shape. The first route is primary; every other canonical route and its operations remain in `x-launchpad-route-alternatives`, even for variants of the same resource type.

### Operation IDs

Canonical route variants have explicit semantic labels in `src/openapi/constants.ts`. The existing base-ID policy is unchanged: archive operations now use names such as `archive-getPublishedSources-distribution` and `archive-getPublishedSources-ppa`.

Route templates declare `template` and optional `operationSuffix`; parent branches declare `resourceType` and optional `operationSuffixPrefix`. Children inherit parent labels, with explicit prefixes distinguishing multi-parent targets. The URL `suffix` remains separate from operation naming. For a canonical catalog template, an absent operation suffix preserves the base ID even when routes are added, removed, or reordered.

Service-root aliases retain field identity (`me_link` produces the `me` label). An uncatalogued link-only route uses its field-derived label even when it is the only route: `polls-get` reached through `polls_collection_link` becomes `polls-get-polls`. Runtime route count never determines labels. Adding a matching canonical entry can change the ID through explicit catalog metadata; an entry without an operation suffix uses `polls-get`.

Links matching canonical paths deduplicate without changing canonical IDs or parameters. Conflicting discovered alias labels or final operation IDs return `Err(ConversionError)` from `generateOpenApi` rather than receiving numeric suffixes. Malformed checked-in catalog definitions (cycles, missing URL suffixes, or conflicting canonical metadata) remain programming exceptions.

This is a breaking naming migration with no compatibility aliases. URL templates, parameters, response schemas, and `x-launchpad-route-alternatives` are unchanged.

### Response field types

Missing response-property types are supplemented by bundled metadata extracted from Launchpad's exported Python interfaces and registered JSON field marshallers. The same catalog is used online and offline, including inherited fields, exported wire-name aliases, array items, and dictionary values.

Explicit WADL types always take precedence, including unsupported types that remain unconstrained. Unknown fields and unresolved serializers remain unconstrained; names, descriptions, and example responses are not used to guess types.

Nullability is independent of WADL property-presence requirements. Declared optional fields with a `None` missing value permit null in both input and response schemas. Reference serializers additionally permit URL-or-null in `-full` responses, including nested references; that response-only allowance is excluded from `-diff` and `-write` inputs. These domains describe allowed values, not observations from sample responses.

`-full` components are also shared by PUT request bodies. Their response nullability remains shared with those requests; separate PUT input schemas are not currently generated.

Launchpad's serializer substitutes `tag:launchpad.net:2008:redacted` when access to a field is denied. Newly recovered non-string response types include that exact alternative; downstream consumers can narrow it with ordinary type guards rather than casts or custom decoders. Explicit WADL types and pagination schemas are unchanged.

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

To refresh the field catalog, use Python 3.9+ and a bootstrapped Launchpad checkout containing its pinned `lazr.restful`, `zope.schema`, `zope.interface`, `lazr.enum`, and `lazr.lifecycle` source archives in `download-cache/dist`:

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

The exporter resolves source declarations without importing or running Launchpad. `src/wadl/metadata/provenance.json` records dependency versions, source hashes, field origins, and unresolved declarations. Regenerate OpenAPI and downstream clients after refreshing the catalog; conversion itself requires neither Python nor a Launchpad checkout.

## License

Licensed under the [GNU Lesser General Public License version 3](LICENSE), which incorporates the [GNU General Public License version 3](COPYING).
