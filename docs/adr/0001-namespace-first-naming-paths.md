# ADR 0001: Namespace-first naming paths

- **Status:** Accepted
- **Scope:** OpenAPI operation IDs and their Launchpad naming metadata
- **Origin:** Adapted from the namespace-first naming paths ADR in
  `launchpad-typescript-client`.

## Context

Launchpad's WADL uses snake_case, kebab-case, and camelCase identifiers. Previously,
the converter combined a method ID and route labels into one hyphenated operation
ID. A name such as `git_repository-get-source-package` left readers to distinguish
the resource, its context, and the action themselves. Inherited route labels made
this harder.

OpenAPI operation IDs are lookup keys for documentation and generated clients.
They should group related operations, preserve source meaning, and remain stable
when other routes are added, removed, or reordered. The converter must not infer
naming hierarchy from URLs, descriptions, or the number of available routes.

## Decision

Put the subject first, any namespaces next, and the operation last:

```text
subject[.namespace...].operation
```

- **Subject:** The WADL resource type ID, such as `archive`, `git_repository`, or
  `projects`, normalized to lowerCamelCase. Scoped collection GETs use their
  parent entry's resource type.
- **Namespace:** An explicitly declared context or variant, such as `ppa` or
  `sourcePackage`. A path may have no namespaces, one, or several.
- **Operation:** For named methods, the declared `ws.op` value. For standard
  methods, the WADL method ID with the exact `<resourceTypeId>-` prefix removed
  once. If the method ID is absent, use the declared HTTP verb. Do not guess
  actions from descriptions or use opaque XML IDs for named methods.

Every component uses lowerCamelCase. Dots separate components, not words within
a component: use `sourcePackage`, not `source.package`.

These paths are names, not filesystem paths, URLs, or executable expressions.
They do not rename request or response fields, URL segments, or operation-selection
values sent to Launchpad.

### Component spelling

Source components must match `^[A-Za-z][A-Za-z0-9]*(?:[_-][A-Za-z0-9]+)*$`.
Normalized components must match `^[a-z][A-Za-z0-9]*$`:

- Normalize word separators and casing consistently: `source_package` and
  `source-package` become `sourcePackage`.
- Treat acronyms as words: `getByURL` becomes `getByUrl`, `API_client` becomes
  `apiClient`, and a standalone `PPA` becomes `ppa`.
- Preserve meaning. Do not singularize plural subjects, expand abbreviations,
  or replace source operation names with guessed synonyms. `project` and
  `projects` remain distinct.
- Prefer action verbs when defining new operations; retain the declared names
  of existing operations.
- Reject unsupported spelling. Do not silently remove characters, split a
  dotted source string into components, or erase distinctions in meaning.

Examples:

| Previous operation ID | Namespace-first operation ID |
| --- | --- |
| `archive-getPublishedSources-ppa` | `archive.ppa.getPublishedSources` |
| `git_repository-get-source-package` | `gitRepository.sourcePackage.get` |
| `person-get-me` | `person.me.get` |
| `projects-new_project` | `projects.newProject` |

### Namespace structure

Canonical route templates and parent branches declare optional `namespace`
arrays in `src/openapi/constants.ts`. Their types live in
`src/openapi/types.ts`. A multiword label stays in one component; inherited
contexts remain separate:

```text
archive.ppa.get
archiveDependency.archive.ppa.get
```

A parent branch's explicit namespace is prepended to the inherited route's
namespace. Do not reconstruct hierarchy by replacing hyphens or underscores
with dots. The URL `suffix` used to compose child routes is independent of naming.

Every generated operation exposes its normalized parts in
`x-launchpad-naming-path`, alongside its `operationId`:

```json
{
  "operationId": "archiveDependency.archive.ppa.get",
  "x-launchpad-naming-path": {
    "subject": "archiveDependency",
    "namespace": ["archive", "ppa"],
    "operation": "get"
  }
}
```

Do not automatically remove repeated labels. They may represent different
contexts. Only explicit source metadata can establish more precise names.

### Operations without namespaces and aliases

When no namespace is declared, add nothing:

```text
person.get
person.me.get
projects.newProject
```

Do not invent `default`, `canonical`, or numbered namespaces. Adding, removing,
or reordering other routes must not rename an existing operation.

Service-root aliases use the declared field identity, removing the terminal
`_collection_link` or `_link`, rather than deriving a label from the runtime URL.
For example, `me_link` supplies `me`; an uncatalogued resource type `polls`
reached through `polls_collection_link` uses `polls.polls.get`, even if it has
only one route.

A service-root link matching a canonical path deduplicates against that route
and retains its catalog naming metadata and parameters. Runtime links supplement
canonical routes rather than replacing them. Owners, identifiers, versions, and
other instance data remain request inputs, not inferred namespaces.

Scoped collection GETs inherit the parent route's namespace and append the
exported collection field's name, removing only the terminal `_collection_link`.
For example, `series_collection_link` on a distribution becomes
`distribution.series.get`; a collection beneath a runtime `me` alias retains
that context as `person.me.members.get`. The operation component comes from the
page resource's standard WADL method, stripping its own resource-type prefix,
not the parent's. Naming metadata never changes the declared page response or
adds the named-operation count switch.

The service-root GET retains the fixed name `serviceRoot.get` with an empty
namespace, independent of its XML method ID or declared response statuses.

### Uniqueness and stability

Complete operation IDs must be unique across the generated document, including
operations preserved in `x-launchpad-route-alternatives`. Normalization can turn
different source spellings into the same ID.

Unsupported spelling, conflicting discovered alias labels, and duplicate complete
IDs return `Err(ConversionError)` from `generateOpenApi`. ID collision messages
identify both source definitions, including their routes, HTTP methods, and
WADL method IDs when present. Do not
append numbers or choose whichever definition was found first.

Malformed checked-in catalog definitions—cycles, missing child URL suffixes,
or conflicting canonical metadata—remain programming exceptions.

This is a breaking naming migration with no compatibility aliases.

## Interface implications

OpenAPI `operationId` values remain ordinary string lookup keys. Consumers can
use `x-launchpad-naming-path` instead of guessing hierarchy from a flattened ID.

This ADR does not require nested client methods, dotted filenames, package export
paths, or dotted generated type names. A consumer that exposes nested objects
must independently reject operation/namespace prefix conflicts, such as
`person.get` and `person.get.details`. String lookup keys do not have that
structural restriction.

Never derive request URLs or `ws.op` values from operation IDs. For example,
`projects.newProject` still selects `ws.op=new_project`. URL templates,
wire fields, response schemas, and `x-launchpad-route-alternatives` remain
unchanged by the naming migration.

## Consequences

### Benefits

- One casing convention replaces mixed spelling styles.
- Dots distinguish subjects, contexts, and operations.
- Shared prefixes group operations for the same context.
- Explicit namespace arrays keep inherited contexts readable and stable.
- Structured metadata supports clients without requiring a nested interface.

### Costs

- Dotted IDs are more structured, but not necessarily shorter.
- Route metadata must store namespace boundaries rather than flattened suffixes.
- Conversion must validate spelling and reject normalized ID collisions.
- Consumers must regenerate their operation lookups after the breaking migration.
- Generated client names need their own conflict checks in addition to the
  converter's complete-ID checks.
