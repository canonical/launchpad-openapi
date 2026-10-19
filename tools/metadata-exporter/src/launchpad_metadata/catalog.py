# Copyright 2026 Canonical Ltd.  This software is licensed under the
# GNU Lesser General Public License version 3 (see the file LICENSE).
"""Collect resource fields and write the TypeScript catalog and provenance."""

import ast
import json
import re
from collections import Counter
from hashlib import sha256

from .constants import DECLARATIONS
from .reviews import REVIEWED_VALUES, resolve_reviewed_value
from .schema import resolve_schema
from .syntax import literal


def export_catalog(source):
    resources = {}
    origins = {}
    registry = {}
    contributors = {}
    for module in sorted(source.registered_modules):
        module_source = source.module(module)
        if module_source is None:
            raise ValueError("Registered module unavailable: " + module)
        names = module_source["all"] or [
            name for name in module_source["symbols"] if not name.startswith("_")
        ]
        for name in names:
            qualified, node = source.definition(module + "." + name)
            if not isinstance(node, ast.ClassDef):
                continue
            owner = qualified.rsplit(".", 1)[0]
            for decorator in node.decorator_list:
                if (
                    not isinstance(decorator, ast.Call)
                    or source.resolve(source.reference(owner, decorator.func))
                    != DECLARATIONS + "exported_as_webservice_entry"
                ):
                    continue
                keywords = {kw.arg: kw.value for kw in decorator.keywords if kw.arg}
                contributes = keywords.get("contributes_to")
                if contributes is not None:
                    if isinstance(contributes, (ast.Tuple, ast.List)):
                        for target in contributes.elts:
                            target_name = source.resolve(
                                source.reference(owner, target)
                            )
                            contributors.setdefault(target_name, set()).add(qualified)
                    else:
                        source.unresolved.append(
                            {"interface": qualified, "reason": "dynamic contributes_to"}
                        )
                    continue
                singular = (
                    literal(decorator.args[0])
                    if decorator.args
                    else literal(keywords["singular_name"])
                    if "singular_name" in keywords
                    else None
                )
                if singular is None:
                    # Exact naming contract in lazr.restful.utils, not a
                    # guess from a WADL/resource name.
                    singular = re.sub(r"\B([A-Z])", r"_\1", node.name[1:]).lower()
                if not isinstance(singular, str):
                    source.unresolved.append(
                        {
                            "interface": qualified,
                            "reason": "dynamic exported resource name",
                        }
                    )
                    continue
                registry.setdefault(singular, set()).add(qualified)
    for resource, interfaces in sorted(registry.items()):
        output = {}
        declarations = {}
        conflicts = set()
        origins[resource] = {"interfaces": sorted(interfaces), "fields": {}}
        providers = set(interfaces)
        for interface in interfaces:
            providers.update(contributors.get(interface, ()))
        for provider in sorted(providers):
            fields = source.fields(provider)
            for field, (module, node, declaring) in sorted(fields.items()):
                expression = source.expression(module, node, fields)
                if not expression or expression[2] is None:
                    continue
                constructor, attrs, aliases = expression
                metadata, suffix, reason = resolve_schema(source, constructor, attrs)
                reviewed = False
                value, review_reason = resolve_reviewed_value(
                    source, declaring, field, constructor, attrs, metadata
                )
                if value is not None:
                    metadata, reason, reviewed = value, None, True
                    source.reviewed.add((declaring, field))
                elif review_reason:
                    reason = review_reason
                for alias in set(aliases):
                    wire = (alias or field) + suffix
                    provenance = {
                        "interface": declaring,
                        "field": field,
                        "constructor": constructor,
                        "source": source.module(module)["origin"],
                        "line": node.lineno,
                    }
                    if reviewed:
                        provenance["reviewed"] = True
                    origins[resource]["fields"].setdefault(wire, []).append(provenance)
                    if wire in declarations and declarations[wire] != metadata:
                        conflicts.add(wire)
                        source.unresolved.append(
                            {
                                "resource": resource,
                                "field": wire,
                                "reason": "conflicting serialized field declarations",
                            }
                        )
                    declarations[wire] = metadata
                    if metadata.get("type"):
                        output[wire] = metadata
                    if reason:
                        source.unresolved.append(
                            {
                                "resource": resource,
                                "field": wire,
                                "reason": reason,
                                **provenance,
                            }
                        )
        for wire in conflicts:
            output.pop(wire, None)
        resources[resource] = dict(sorted(output.items()))
    return resources, origins


def generate_catalog(source):
    """Build catalog and provenance from the same source-resolution session."""
    catalog, origins = export_catalog(source)
    redacted_attribute = source.class_attribute(
        "lazr.restful._resource.FieldUnmarshallerMixin", "REDACTED_VALUE"
    )
    if redacted_attribute is None:
        raise ValueError("Authoritative entry-field redaction constant is missing")
    redacted_value = literal(redacted_attribute[1])
    if not isinstance(redacted_value, str):
        raise ValueError("Authoritative entry-field redaction constant is not a string")
    stats = Counter(
        field["type"] for fields in catalog.values() for field in fields.values()
    )
    source_digest = sha256(
        json.dumps(source.hashes, sort_keys=True).encode()
    ).hexdigest()
    provenance = {
        "method": "conservative Python AST/import/interface and ZCML adapter extraction, plus digest-pinned reviews of serialized values interfaces leave undeclared or constrain only for input",
        "nullable_semantics": "declared required=False with None missing value accepts None for inputs and responses",
        "response_nullable_semantics": "reference marshaller or digest-pinned model/serializer review permits None in responses, independent of input validation",
        "redaction": {
            "value": redacted_value,
            "source": source.module(redacted_attribute[0])["origin"],
            "line": redacted_attribute[1].lineno,
            "semantics": "FieldUnmarshallerMixin._unmarshallField substitutes this exact string when field access or unmarshalling raises Unauthorized",
        },
        "dependency_versions": source.dependencies,
        "reviewed_values": [
            {
                "interface": interface,
                "field": field,
                **REVIEWED_VALUES[(interface, field)],
            }
            for interface, field in sorted(source.reviewed)
        ],
        "registered_modules": sorted(source.registered_modules),
        "vocabulary_utilities": {
            name: sorted(components)
            for name, components in sorted(source.vocabulary_utilities.items())
        },
        "source_sha256": dict(sorted(source.hashes.items())),
        "source_digest": source_digest,
        "resources": origins,
        "unresolved": sorted(
            source.unresolved, key=lambda value: json.dumps(value, sort_keys=True)
        ),
        "statistics": {
            "resources": len(catalog),
            "fields": sum(map(len, catalog.values())),
            "types": dict(sorted(stats.items())),
            "unresolved": len(source.unresolved),
        },
    }
    return catalog, provenance


def write_catalog(source, output):
    """Write generated files, creating the output directory when needed."""
    catalog, provenance = generate_catalog(source)
    redacted_value = provenance["redaction"]["value"]
    output.mkdir(parents=True, exist_ok=True)
    header = (
        '/*\n * Copyright 2026 Canonical Ltd.  This software is licensed under the\n * GNU Lesser General Public License version 3 (see the file LICENSE).\n */\n\n// Generated by pnpm metadata:export; source hashes and unresolved fields: provenance.json.\nimport type { SerializedFieldMetadata } from "../types.js";\n\nexport const REDACTED_FIELD_VALUE = '
        + json.dumps(redacted_value)
        + ";\n\n// prettier-ignore\nexport const RESOURCE_FIELD_METADATA: Readonly<\n  Record<string, Readonly<Record<string, SerializedFieldMetadata>>>\n> = "
    )
    (output / "constants.ts").write_text(
        header + json.dumps(catalog, indent=2, sort_keys=True) + ";\n"
    )
    (output / "provenance.json").write_text(
        json.dumps(provenance, indent=2, sort_keys=True) + "\n"
    )
    return provenance["statistics"]
