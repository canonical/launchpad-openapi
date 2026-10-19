# Copyright 2026 Canonical Ltd.  This software is licensed under the
# GNU Lesser General Public License version 3 (see the file LICENSE).
"""Read source dependency pins and acquire archives without running build code."""

import configparser
import json
import re
import sys
import urllib.parse
import urllib.request
from hashlib import sha256
from pathlib import Path
from tempfile import NamedTemporaryFile

SOURCE_PACKAGES = (
    "lazr.restful",
    "zope.schema",
    "zope.interface",
    "lazr.enum",
    "lazr.lifecycle",
)


def read_dependency_versions(root, read_file=None):
    """Resolve source pins, preserving bootstrapped-manifest compatibility.

    A fresh clone has tracked ZTK versions rather than generated combined.txt.
    Launchpad's own requirements override either base, as in its bootstrap.
    The optional reader lets Source record every manifest's original hash.
    """
    if read_file is None:

        def read_file(path):
            return path.read_text(encoding="utf-8")

    combined = root / "requirements/combined.txt"
    if combined.is_file():
        pins = dict(
            re.findall(r"^([\w.-]+)==([^\s]+)$", read_file(combined), re.MULTILINE)
        )
    else:
        configuration = configparser.ConfigParser(interpolation=None)
        configuration.optionxform = str
        configuration.read_string(read_file(root / "requirements/ztk-versions.cfg"))
        pins = dict(configuration.items("versions"))
    current = read_file(root / "requirements/launchpad.txt")
    pins.update(re.findall(r"^([\w.-]+)==([^\s]+)$", current, re.MULTILINE))
    result = {}
    for package in SOURCE_PACKAGES:
        version = pins.get(package)
        if version is None:
            raise ValueError("Missing pinned source dependency: " + package)
        result[package] = version
    return result


def download_source_archive(package, version, destination):
    """Verify PyPI's source archive digest before publishing it atomically."""
    release = urllib.parse.quote(version, safe="")
    metadata_url = f"https://pypi.org/pypi/{package}/{release}/json"
    print(f"Downloading {package}=={version} source", file=sys.stderr)
    with urllib.request.urlopen(metadata_url, timeout=60) as response:
        metadata = json.load(response)
    archives = [
        entry
        for entry in metadata.get("urls", [])
        if entry.get("packagetype") == "sdist"
        and entry.get("filename", "").endswith(".tar.gz")
    ]
    if len(archives) != 1:
        raise ValueError(f"Expected one source tarball for {package}=={version}")
    archive = archives[0]
    url = archive["url"]
    if not url.startswith("https://"):
        raise ValueError(f"Source archive URL must use HTTPS: {package}=={version}")
    with urllib.request.urlopen(url, timeout=60) as response:
        data = response.read()
    if sha256(data).hexdigest() != archive["digests"]["sha256"]:
        raise ValueError(f"Source archive SHA-256 mismatch: {package}=={version}")

    temporary = None
    try:
        with NamedTemporaryFile(
            dir=destination.parent, prefix=".source-", delete=False
        ) as stream:
            temporary = Path(stream.name)
            stream.write(data)
        temporary.replace(destination)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def ensure_source_archives(root):
    """Fetch only missing pinned archives; cached runs make no HTTP requests."""
    versions = read_dependency_versions(root)
    directory = root / "download-cache/dist"
    directory.mkdir(parents=True, exist_ok=True)
    for package, version in versions.items():
        destination = directory / f"{package}-{version}.tar.gz"
        if not destination.is_file():
            download_source_archive(package, version, destination)
