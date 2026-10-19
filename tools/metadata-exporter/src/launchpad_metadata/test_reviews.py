# Copyright 2026 Canonical Ltd.  This software is licensed under the
# GNU Lesser General Public License version 3 (see the file LICENSE).

import ast

import pytest
from metadata_fixtures import EXAMPLE, create_launchpad_checkout

from launchpad_metadata.reviews import REVIEWED_VALUES, resolve_reviewed_value
from launchpad_metadata.source import Source


def test_changed_source_withdraws_review_without_repinning_evidence(
    tmp_path, monkeypatch
):
    root = create_launchpad_checkout(tmp_path)
    source = Source(root)
    symbol = "lp.example.IExample"
    monkeypatch.setitem(
        REVIEWED_VALUES,
        (symbol, "title"),
        {
            "schema": {"type": "string"},
            "semantics": "Test evidence review",
            "evidence": {symbol: source.definition_digest(symbol)},
        },
    )
    attributes = {"required": ("lp.example", ast.Constant(value=False))}
    value, reason = resolve_reviewed_value(
        source, symbol, "title", "zope.schema._field.Text", attributes, {}
    )
    assert value == {"type": "string", "nullable": True}
    assert reason is None
    # Applying nullability must not mutate the pinned review.
    assert REVIEWED_VALUES[(symbol, "title")]["schema"] == {"type": "string"}

    (root / "lib/lp/example.py").write_text(
        EXAMPLE.replace('exported_as="display_name"', 'exported_as="renamed"'),
        encoding="utf-8",
    )
    value, reason = resolve_reviewed_value(
        Source(root), symbol, "title", "zope.schema._field.Text", attributes, {}
    )
    assert value is None
    assert reason == "reviewed value evidence changed: lp.example.IExample"


@pytest.mark.parametrize(
    "metadata",
    [
        {"type": "integer"},
        {"type": "string", "format": "date-time"},
    ],
)
def test_changed_marshaller_withdraws_response_nullable_review(
    tmp_path, monkeypatch, metadata
):
    source = Source(create_launchpad_checkout(tmp_path))
    symbol = "lp.example.IExample"
    monkeypatch.setitem(
        REVIEWED_VALUES,
        (symbol, "title"),
        {
            "schema": {"type": "string", "responseNullable": True},
            "semantics": "Test response review",
            "evidence": {symbol: source.definition_digest(symbol)},
        },
    )
    value, reason = resolve_reviewed_value(
        source, symbol, "title", "zope.schema._field.Text", {}, metadata
    )
    assert value is None
    assert reason == "reviewed response marshaller type changed"
