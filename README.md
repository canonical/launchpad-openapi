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

Operation IDs use `subject[.namespace...].operation`, with lowerCamelCase
components: `archive.ppa.getPublishedSources`, `person.me.get`,
`gitRepository.sourcePackage.get`, and `projects.newProject`.
Each operation also exposes its separate `subject`, ordered `namespace` array,
and `operation` in `x-launchpad-naming-path`.

Names follow WADL definitions and explicit route or service-root alias metadata,
not runtime URLs or route counts. Unsupported spelling and duplicate IDs return
`Err(ConversionError)`; collisions identify both source definitions rather than
receiving numeric suffixes.

**This is a breaking naming migration with no compatibility aliases.** Regenerate
operation lookups in downstream consumers. URL templates, wire fields, `ws.op`
values, and response schemas are unchanged: `projects.newProject` still sends
`ws.op=new_project`.

See [ADR 0001: Namespace-first naming paths](docs/adr/0001-namespace-first-naming-paths.md)
for normalization, namespace inheritance, aliases, and stability guarantees.

### Collection GET controls

Resolved collection GET responses include optional `ws.start` and `ws.size` integer query parameters, plus the `memo` and `direction` string controls used by pagination links. Default and maximum page sizes are server-configured. Non-positive sizes fall back to the configured default; `direction=backwards` selects backward navigation. Existing WADL parameter declarations take precedence.

Named collection GETs additionally support `ws.show=total_size`, returning a non-negative JSON integer instead of a page. The optional query schema documents only the `total_size` literal; the server still ignores other strings. Omission or other values retain the page response. Their HTTP 200 JSON response schemas use `anyOf` for the existing page and the count, without changing shared page components. Standard collection GETs do not implement the count switch, and other statuses and non-JSON responses are not widened.

### Publication file responses

For binary publications, `binaryFileUrls` returns URI strings when `include_meta` is omitted or false, and objects with required `url` (URI string), `size` (integer), `sha1` (string), and `sha256` (string) when true. Source publications' `sourceFileUrls` uses the same switch, but its metadata has only `url`, `size`, and `sha256`, without `sha1`. These fields are non-null.

Both distribution and PPA routes describe the two homogeneous array shapes with `anyOf`: empty arrays are valid, but mixed URL/object arrays are not. These source-backed contracts supplement missing WADL responses without replacing declared response representations.

### Response field types

Missing response-property types are supplemented by bundled metadata extracted from Launchpad's exported Python interfaces and registered JSON field marshallers. The same catalog is used online and offline, including inherited fields, exported wire-name aliases, array items, and dictionary values.

When a marshaller passes a value through unchanged, the value is typed from its JSON encoding: enumerated `Choice(values=...)` items and `Timedelta` values have registered `str()` serializers, so both are strings. A few values are left undeclared by interfaces: a person's `time_zone` is only a runtime vocabulary, and a timeline's `landmarks` field is a bare `Field`. These are typed from a review of the model code that produces them. The exporter pins digests of the reviewed definitions and reports the field as unresolved once any of them changes.

Fields written by `lazr.restful`'s serializers, rather than by exported interfaces, are typed from those serializers. In entries, including entries missing from the catalog, `self_link`, `web_link`, and `resource_type_link` are URI strings and `http_etag` is a string. Collection pages and the service root type `resource_type_link` the same way.

WADL decides which properties are declared; no missing fields are invented. In `-full` responses, declared `self_link`, `web_link`, `resource_type_link`, and `http_etag` are required and `readOnly: true`, reflecting the serializer's response guarantees. Entries that do not publish web links still omit `web_link`. On collection pages and the service root, only declared `resource_type_link` gains this guarantee. Conditional pagination links and count fields remain optional; existing `start` and `entries` requirements and other WADL required flags are unchanged. These response guarantees do not apply to `-diff` or `-write` inputs, even if they declare serializer-named fields.

Explicit WADL types always take precedence, including unsupported types that remain unconstrained. Unknown fields and unresolved serializers remain unconstrained; names, descriptions, and example responses are not used to guess types.

Nullability is independent of WADL property-presence requirements. Declared optional fields with a `None` missing value permit null in both input and response schemas. Reference serializers additionally permit URL-or-null in `-full` responses, including nested references; that response-only allowance is excluded from `-diff` and `-write` inputs. These domains describe allowed values, not observations from sample responses.

`-full` components are also shared by PUT request bodies. Under OpenAPI 3.0.3, a required property marked `readOnly: true` is required only in responses, so clients need not submit the serializer-owned fields in PUT inputs. Response nullability remains shared with those requests; separate PUT input schemas are not currently generated.

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

The exporter resolves source declarations without importing or running Launchpad. `src/wadl/metadata/provenance.json` records dependency versions, source hashes, field origins, reviewed values, and unresolved declarations. A refresh that withdraws a review lists the changed definitions under `unresolved`; re-review them before updating the pinned digests in `export.py`. Regenerate OpenAPI and downstream clients after refreshing the catalog; conversion itself requires neither Python nor a Launchpad checkout.

## Static API reference page

`site/index.html` is the Scalar page template. Build a page with embedded fresh
specs from both environments:

```console
pnpm build
mkdir -p site/dist
node dist/index.js --format json --output site/dist/production.json
node dist/index.js --environment qastaging --format json --output site/dist/qastaging.json
pnpm build:site site/dist/production.json site/dist/qastaging.json
```

Deploy `site/dist/index.html` to a static web server and copy
`assets/launchpad-favicon.png` into an `assets/` directory beside it. The favicon
comes from [launchpad.net](https://launchpad.net/@@/favicon-32x32.png?v=2022).
Generated files are ignored by Git; the builder preserves the OpenAPI documents
unchanged.

Search uses one embedded Web Worker to build and cache an index per environment
and run fuzzy queries off the main thread. Only bounded result summaries return
to the page; stale query/source responses are discarded. The input-styled search
control sits in the sidebar below the environment picker, with formatted ⌘ K or
Ctrl K key badges. On mobile it appears below the global navigation. Clicking it
or pressing Ctrl/Cmd+K opens the dialog. Arrow keys and Enter select results; Escape closes
it and restores focus. Navigation still uses Scalar's existing section links.

Scalar's built-in search is disabled so it does not rebuild a second index on the
main thread. The worker and search library are bundled into the HTML at build
time, with no extra runtime dependency or deployed worker file. If a Content
Security Policy is configured, it must permit `worker-src blob:`. A blocked or
failed worker displays an accessible error without disabling the API reference;
search does not silently fall back to main-thread indexing.

Run browser regressions against the full generated page (requires CDN access):

```console
pnpm exec playwright install chromium
pnpm test:site
```

Alternatively, use an installed Chrome with `PLAYWRIGHT_CHANNEL=chrome pnpm test:site`.
Set `SITE_PAGE` to test another generated HTML file. Browser checks cover initial
search stalls, real worker execution, source isolation, worker failure handling,
keyboard navigation, and search-result/sidebar synchronization in both environments.

## License

Licensed under the [GNU Lesser General Public License version 3](LICENSE), which incorporates the [GNU General Public License version 3](COPYING).
