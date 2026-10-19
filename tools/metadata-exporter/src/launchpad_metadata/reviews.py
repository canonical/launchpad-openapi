# Copyright 2026 Canonical Ltd.  This software is licensed under the
# GNU Lesser General Public License version 3 (see the file LICENSE).
"""Digest-pinned reviews; changed evidence withdraws the reviewed schema."""

import json

from .schema import is_declared_nullable

# Serialized values interfaces leave undeclared or constrain only for input,
# reviewed against the model and marshaller. A changed declaration or evidence
# definition invalidates the review: the field is reported unresolved instead.
REVIEWED_VALUES = {
    ("lp.registry.interfaces.distroseries.IDistroSeriesPublic", "changeslist"): {
        "schema": {"type": "string", "responseNullable": True},
        "semantics": "DistroSeries.changeslist is a nullable Storm Unicode column; the text marshaller returns its value unchanged without validating the input-only required flag",
        "evidence": {
            "lp.registry.interfaces.distroseries.IDistroSeriesPublic.changeslist": "0f5e89ca45e2e8c340260e8eaa0523974a4089758a40673b580100e63b88c034",
            "lp.registry.model.distroseries.DistroSeries.changeslist": "4b3b94dad66e8420de1af3d2f84268e05b3cd28c04c791960f4a1d4ef99aaee4",
            "lazr.restful.marshallers.TextFieldMarshaller": "0458f64c3b3230eadd7ee5ccb87f44831282b462036cfb1a861d31141ac8d91c",
            "lazr.restful.marshallers.SimpleFieldMarshaller.unmarshall": "0f93dcbc8156596f79bb8038315d9be57ed434d1d61476280ef2276eacf19f03",
            "lazr.restful._resource.FieldUnmarshallerMixin._unmarshallField": "9bb41267da098341521ae2448c935fb6122d6ae7f24603947bb77b071822e1d4",
        },
    },
    ("lp.registry.interfaces.distroseries.IDistroSeriesPublic", "datereleased"): {
        "schema": {"type": "string", "format": "date-time", "responseNullable": True},
        "semantics": "DistroSeries.datereleased is a nullable Storm DateTime column; the datetime marshaller explicitly returns None for None without validating the input-only required flag",
        "evidence": {
            "lp.registry.interfaces.distroseries.IDistroSeriesPublic.datereleased": "0b2cab2a76d024525eaaf302d6cbf02281e6f0bd9358fa852f9be9517bc4c0e2",
            "lp.registry.model.distroseries.DistroSeries.datereleased": "f7ffb3bd6627b78122809322f32220694ebddcf6d1444829afb76b35477df67f",
            "lazr.restful.marshallers.DateTimeFieldMarshaller.unmarshall": "a82d03cfdf12985fdd1a130c001a629eaae23c572d71d7992a0a1e1365922ed7",
            "lazr.restful._resource.FieldUnmarshallerMixin._unmarshallField": "9bb41267da098341521ae2448c935fb6122d6ae7f24603947bb77b071822e1d4",
        },
    },
    ("lp.registry.interfaces.location.IHasLocation", "time_zone"): {
        "schema": {"type": "string"},
        "semantics": "Person.time_zone returns 'UTC' or PersonLocation.time_zone, a non-null Storm Unicode column",
        "evidence": {
            "lp.registry.interfaces.location.IHasLocation.time_zone": "7a8347203c1de3a3cf7a6b72fb2040dc03db6b3df3749ab23bfd4436d2f04be8",
            "lp.registry.model.person.Person.time_zone": "f37c1c4f292dfcb468d5ce20caee8fa210a31b8ff86bde1201e60e636f85e5c5",
            "lp.registry.model.personlocation.PersonLocation.time_zone": "505c1d33aa45f17ffdd4f269f366bdba1c54680bd5664e92be6eeb1aca7452b7",
        },
    },
    ("lp.registry.interfaces.productseries.ITimelineProductSeries", "landmarks"): {
        "schema": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": {"type": "string", "nullable": True},
            },
        },
        "semantics": "ProductSeries.getTimeline, the only TimelineProductSeries constructor call, stores dicts whose name, code_name, type, ISO date, and uri values are str or None",
        "evidence": {
            "lp.registry.interfaces.productseries.ITimelineProductSeries.landmarks": "25b9010c6086da3389967f637f4cf896390fd3fa1877e652938d2a8112c8cb82",
            "lp.registry.model.productseries.ProductSeries.getTimeline": "0d42e1d33e31a8036a546d6539c73929523c46d883d60d0b8d3055108271dde9",
            "lp.registry.model.productseries.TimelineProductSeries.__init__": "fc0194e07ae19112b47d50c9d0d8897703aa582d368abd9fe5af6a413ea48c37",
        },
    },
}


def resolve_reviewed_value(source, interface, field, constructor, attrs, metadata):
    """Apply a still-current review; otherwise explain why it is not applied."""
    review = REVIEWED_VALUES.get((interface, field))
    if review is None or (
        metadata.get("type") and not review["schema"].get("responseNullable")
    ):
        return None, None
    if review["schema"].get("responseNullable") and any(
        metadata.get(key) != review["schema"].get(key) for key in ("type", "format")
    ):
        return None, "reviewed response marshaller type changed"
    changed = sorted(
        symbol
        for symbol, digest in review["evidence"].items()
        if source.definition_digest(symbol) != digest
    )
    if changed:
        return None, "reviewed value evidence changed: " + ", ".join(changed)
    result = json.loads(json.dumps(review["schema"]))
    if is_declared_nullable(source, constructor, attrs):
        result["nullable"] = True
    return result, None
