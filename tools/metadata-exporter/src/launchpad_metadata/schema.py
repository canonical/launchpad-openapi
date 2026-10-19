# Copyright 2026 Canonical Ltd.  This software is licensed under the
# GNU Lesser General Public License version 3 (see the file LICENSE).
"""Infer serialized schemas only for understood registered marshallers."""

from .constants import ENUM_ITEM, MARSHALLERS
from .syntax import literal


def is_declared_nullable(source, constructor, attrs):
    required = attrs.get("required")
    missing = attrs.get("missing_value") or source.class_attribute(
        constructor, "missing_value"
    )
    # Optional with the normal None missing value is the declared nullable
    # domain. Do not infer nullability from WADL presence or model samples.
    return bool(
        required
        and literal(required[1]) is False
        and missing is not None
        and literal(missing[1]) is None
    )


def resolve_schema(source, constructor, attrs):
    interfaces = [
        name
        for name in source.order(constructor, True)
        if not name.startswith("implements:")
    ]
    candidates = [
        (source.resolve(ifaces[0]), factory)
        for ifaces, factory in source.adapters
        if len(ifaces) == 2 and source.resolve(ifaces[0]) in interfaces
    ]
    winning_interface = next(
        (
            interface
            for interface in interfaces
            if any(candidate == interface for candidate, _ in candidates)
        ),
        None,
    )
    factories = {
        factory for interface, factory in candidates if interface == winning_interface
    }
    vocabulary = None
    value_class = None
    if factories == {"lazr.restful.marshallers.VocabularyLookupFieldMarshaller"}:
        if "values" in attrs and "vocabulary" not in attrs:
            # Choice(values=...) builds SimpleVocabulary.fromValues(values),
            # whose terms keep the iterated values themselves.
            if not source.is_enumerated_type(attrs["values"]):
                return {}, "", "dynamic or unsupported choice values"
            vocabulary = "zope.schema.vocabulary.SimpleVocabulary"
            value_class = ENUM_ITEM
        else:
            vocabulary = source.vocabulary(attrs.get("vocabulary"))
        if vocabulary is None:
            return {}, "", "dynamic or unsupported choice vocabulary"
        # Adapter lookup iterates argument __sro__ in order, not as an
        # unordered set of possible interfaces.
        provided = source.provided_order(vocabulary) or source.order(vocabulary, True)
        choices = []
        for ifaces, factory in source.adapters:
            if len(ifaces) != 3:
                continue
            field_interface = source.resolve(ifaces[0])
            vocabulary_interface = source.resolve(ifaces[2])
            vocabulary_specification = (
                "implements:" + vocabulary_interface
                if vocabulary_interface in source.ancestry(vocabulary)
                else vocabulary_interface
            )
            if field_interface in interfaces and vocabulary_specification in provided:
                choices.append(
                    (
                        (
                            interfaces.index(field_interface),
                            provided.index(vocabulary_specification),
                        ),
                        factory,
                    )
                )
        best = min((rank for rank, _ in choices), default=None)
        factories = {factory for rank, factory in choices if rank == best}
    if len(factories) != 1:
        return {}, "", "unresolved or ambiguous marshaller"
    factory = factories.pop()
    name = factory.removeprefix("lazr.restful.marshallers.")
    if name == "TokenizedVocabularyFieldMarshaller":
        # unmarshall returns the stored term value for ResourceJSONEncoder.
        if value_class is not None:
            if not source.string_publisher(value_class):
                return {}, "", "choice value serialization unresolved"
        elif vocabulary is None or not source.tokenized_value_is_string(vocabulary):
            return {}, "", "tokenized vocabulary value serialization unresolved"
        kind, format_, suffix = "string", None, ""
    elif name == "SimpleFieldMarshaller":
        # unmarshall returns the attribute unchanged; only a declared
        # value _type with a string IJSONPublishable adapter is known.
        declared = source.class_attribute(constructor, "_type")
        value_class = source.resolve(source.reference(*declared)) if declared else ""
        if not value_class or not source.string_publisher(value_class):
            return {}, "", "simple field value serialization unresolved"
        kind, format_, suffix = "string", None, ""
    elif name in MARSHALLERS:
        kind, format_, suffix = MARSHALLERS[name]
    else:
        return {}, "", "unsupported custom marshaller: " + factory
    result = {"type": kind}
    if format_:
        result["format"] = format_
    # Reference response serialization explicitly emits URL-or-None even
    # when required=True governs input validation, not response values.
    if name == "ObjectLookupFieldMarshaller":
        result["responseNullable"] = True
    if is_declared_nullable(source, constructor, attrs):
        result["nullable"] = True
    reason = None
    if kind in ("array", "object"):
        if kind == "array":
            result["items"] = {}
        child = attrs.get("value_type") or source.class_attribute(
            constructor, "value_type"
        )
        if child and literal(child[1]) is not None:
            expression = source.expression(child[0], child[1], {})
            if expression:
                nested, _, reason = resolve_schema(source, expression[0], expression[1])
                if nested.get("type"):
                    result["items" if kind == "array" else "additionalProperties"] = (
                        nested
                    )
            else:
                reason = "unsupported dynamic container value_type"
        else:
            reason = "container value_type not declared"
    return result, suffix, reason
