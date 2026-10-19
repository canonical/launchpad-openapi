# Copyright 2026 Canonical Ltd.  This software is licensed under the
# GNU Lesser General Public License version 3 (see the file LICENSE).

from hashlib import sha256

from metadata_fixtures import (
    DEPENDENCY_VERSIONS,
    EXAMPLE,
    create_launchpad_checkout,
    use_fresh_requirements,
)

from launchpad_metadata.source import Source


def test_resolves_application_imports_and_pinned_archive_reexports(tmp_path):
    source = Source(create_launchpad_checkout(tmp_path))
    assert source.resolve("lp.example.Text") == "zope.schema._field.Text"
    assert source.module("lp.example")["origin"] == "lib/lp/example.py"
    assert source.definition("lp.example.IExample")[1].name == "IExample"
    assert source.module("lp.unavailable") is None


def test_definition_reviews_hash_original_decorated_lines(tmp_path):
    source = Source(create_launchpad_checkout(tmp_path))
    expected = EXAMPLE[EXAMPLE.index("@exported_as_webservice_entry") :].rstrip("\n")
    assert (
        source.definition_digest("lp.example.IExample")
        == sha256(expected.encode()).hexdigest()
    )
    assert source.definition_digest("lp.example.IExample.absent") is None


def test_fresh_manifests_support_source_resolution_and_provenance(tmp_path):
    root = use_fresh_requirements(create_launchpad_checkout(tmp_path))
    # Use a genuine override with its matching source archive.
    archive = root / "download-cache/dist/zope.schema-1.0.tar.gz"
    archive.rename(archive.with_name("zope.schema-2.0.tar.gz"))
    (root / "requirements/launchpad.txt").write_text("zope.schema==2.0\n")
    source = Source(root)
    assert source.dependencies == {**DEPENDENCY_VERSIONS, "zope.schema": "2.0"}
    assert source.resolve("lp.example.Text") == "zope.schema._field.Text"
    for manifest in ("requirements/ztk-versions.cfg", "requirements/launchpad.txt"):
        assert (
            source.hashes[manifest]
            == sha256((root / manifest).read_bytes()).hexdigest()
        )
    assert "requirements/combined.txt" not in source.hashes
    assert not (root / "requirements/combined.txt").exists()
