# Copyright 2026 Canonical Ltd.  This software is licensed under the
# GNU Lesser General Public License version 3 (see the file LICENSE).

import importlib
import io
import json
from hashlib import sha256
from urllib.error import URLError

import pytest
from metadata_fixtures import (
    DEPENDENCY_VERSIONS,
    create_launchpad_checkout,
    use_fresh_requirements,
)


@pytest.fixture
def dependencies():
    return importlib.import_module("launchpad_metadata.dependencies")


def test_fresh_manifests_resolve_versions_with_launchpad_overrides(
    tmp_path, dependencies
):
    root = use_fresh_requirements(create_launchpad_checkout(tmp_path))
    (root / "requirements/launchpad.txt").write_text("zope.schema==2.0\n")
    reads = []

    def read_file(path):
        reads.append(path.relative_to(root).as_posix())
        return path.read_text()

    assert dependencies.read_dependency_versions(root, read_file=read_file) == {
        **DEPENDENCY_VERSIONS,
        "zope.schema": "2.0",
    }
    assert set(reads) == {"requirements/ztk-versions.cfg", "requirements/launchpad.txt"}
    assert not (root / "requirements/combined.txt").exists()


def test_combined_manifest_remains_preferred_and_missing_pins_fail(
    tmp_path, dependencies
):
    root = create_launchpad_checkout(tmp_path)
    (root / "requirements/ztk-versions.cfg").write_text(
        "[versions]\nzope.schema = 999\n"
    )
    (root / "requirements/launchpad.txt").write_text("lazr.enum==2.0\n")
    assert dependencies.read_dependency_versions(root) == {
        **DEPENDENCY_VERSIONS,
        "lazr.enum": "2.0",
    }
    combined = root / "requirements/combined.txt"
    combined.write_text(combined.read_text().replace("lazr.lifecycle==1.0\n", ""))
    with pytest.raises(ValueError, match=r"lazr\.lifecycle"):
        dependencies.read_dependency_versions(root)


def install_http_boundary(monkeypatch, root, *, bad_hash=False, interrupted=False):
    """Mock urllib HTTP only; retain real manifests, filesystem, and archive bytes."""
    archive = root / "download-cache/dist/lazr.restful-1.0.tar.gz"
    payload = archive.read_bytes()
    archive.unlink()
    requests = []
    metadata_url = "https://pypi.org/pypi/lazr.restful/1.0/json"
    archive_url = "https://files.pythonhosted.org/packages/lazr.restful-1.0.tar.gz"

    class ArchiveResponse(io.BytesIO):
        def read(self, *args):
            assert not archive.exists(), (
                "Archive must not be published before verification"
            )
            if interrupted:
                raise URLError("interrupted download")
            return super().read(*args)

    def urlopen(request, *args, **kwargs):
        url = request if isinstance(request, str) else request.full_url
        requests.append(url)
        if url == metadata_url:
            return io.BytesIO(
                json.dumps(
                    {
                        "urls": [
                            {
                                "packagetype": "bdist_wheel",
                                "url": "https://invalid/wheel",
                            },
                            {
                                "packagetype": "sdist",
                                "filename": archive.name,
                                "url": archive_url,
                                "digests": {
                                    "sha256": "0" * 64
                                    if bad_hash
                                    else sha256(payload).hexdigest()
                                },
                            },
                        ]
                    }
                ).encode()
            )
        assert url == archive_url, f"Unexpected external HTTP: {url}"
        return ArchiveResponse(payload)

    monkeypatch.setattr("urllib.request.urlopen", urlopen)
    return archive, payload, requests, [metadata_url, archive_url]


def test_downloads_only_missing_sdist_verifies_hash_and_reuses_cache(
    tmp_path, monkeypatch, dependencies
):
    root = use_fresh_requirements(create_launchpad_checkout(tmp_path))
    archive, payload, requests, expected = install_http_boundary(monkeypatch, root)
    dependencies.ensure_source_archives(root)
    assert requests == expected
    assert archive.read_bytes() == payload
    dependencies.ensure_source_archives(root)
    assert requests == expected, "Cached archives must skip even PyPI metadata requests"
    assert sorted(path.name for path in archive.parent.iterdir()) == sorted(
        f"{package}-1.0.tar.gz" for package in DEPENDENCY_VERSIONS
    )


@pytest.mark.parametrize("failure", ["hash", "interrupted"])
def test_failed_download_leaves_no_archive_or_staging_file(
    tmp_path, monkeypatch, dependencies, failure
):
    root = create_launchpad_checkout(tmp_path)
    archive, _, requests, expected = install_http_boundary(
        monkeypatch,
        root,
        bad_hash=failure == "hash",
        interrupted=failure == "interrupted",
    )
    before = {path.name: path.read_bytes() for path in archive.parent.iterdir()}
    with pytest.raises(Exception):
        dependencies.ensure_source_archives(root)
    assert requests == expected
    assert not archive.exists()
    assert {path.name: path.read_bytes() for path in archive.parent.iterdir()} == before
