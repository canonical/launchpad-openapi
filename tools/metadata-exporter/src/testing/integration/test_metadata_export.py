# Copyright 2026 Canonical Ltd.  This software is licensed under the
# GNU Lesser General Public License version 3 (see the file LICENSE).

import json
import os
import subprocess
import sys
from pathlib import Path

from metadata_fixtures import create_launchpad_checkout

from launchpad_metadata import Source, export_catalog


def test_catalog_preserves_aliases_nullability_and_unresolved_declarations(tmp_path):
    source = Source(create_launchpad_checkout(tmp_path))
    catalog, origins = export_catalog(source)
    assert catalog == {
        "example": {"display_name": {"type": "string", "nullable": True}}
    }
    assert origins["example"]["fields"]["display_name"][0]["field"] == "title"
    assert source.unresolved[0]["field"] == "dynamic"
    assert source.unresolved[0]["reason"] == "unresolved or ambiguous marshaller"


def test_console_and_module_cli_write_the_same_catalog(tmp_path):
    checkout = create_launchpad_checkout(tmp_path / "launchpad")
    outputs = []
    for index, command in enumerate(
        (
            [sys.executable, "-m", "launchpad_metadata"],
            [
                str(
                    Path(sys.executable).parent
                    / (
                        "launchpad-metadata-export.exe"
                        if os.name == "nt"
                        else "launchpad-metadata-export"
                    )
                )
            ],
        )
    ):
        output = tmp_path / f"catalog-{index}"
        completed = subprocess.run(
            [*command, str(checkout), "--output", str(output)],
            cwd=tmp_path,
            check=True,
            capture_output=True,
            text=True,
        )
        assert json.loads(completed.stdout)["fields"] == 1
        provenance = json.loads((output / "provenance.json").read_text())
        assert provenance["redaction"]["value"] == "<redacted>"
        assert provenance["statistics"]["unresolved"] == 1
        assert provenance["dependency_versions"]["zope.schema"] == "1.0"
        outputs.append(output)
    for name in ("constants.ts", "provenance.json"):
        assert all(
            (output / name).read_bytes() == (outputs[0] / name).read_bytes()
            for output in outputs[1:]
        )


def test_project_entry_point_exports_catalog_from_unrelated_cwd(tmp_path):
    repository = next(
        ancestor
        for ancestor in Path(__file__).resolve().parents
        if (ancestor / "package.json").is_file()
    )
    project = repository / "tools/metadata-exporter"
    # uv can fall back to an ancestor project when this project is absent.
    assert (project / "pyproject.toml").is_file(), (
        f"Missing standalone exporter project: {project / 'pyproject.toml'}"
    )
    checkout = create_launchpad_checkout(tmp_path / "launchpad")
    unrelated_cwd = tmp_path / "unrelated"
    unrelated_cwd.mkdir()
    output = tmp_path / "catalog"
    completed = subprocess.run(
        [
            "uv",
            "run",
            "--locked",
            "--project",
            str(project),
            "launchpad-metadata-export",
            str(checkout),
            "--output",
            str(output),
        ],
        cwd=unrelated_cwd,
        capture_output=True,
        text=True,
    )
    assert completed.returncode == 0, completed.stderr
    assert json.loads(completed.stdout) == {
        "resources": 1,
        "fields": 1,
        "types": {"string": 1},
        "unresolved": 1,
    }
    constants = (output / "constants.ts").read_text()
    assert json.loads(constants.rsplit(" = ", 1)[1].rstrip(";\n")) == {
        "example": {"display_name": {"type": "string", "nullable": True}}
    }
    provenance = json.loads((output / "provenance.json").read_text())
    assert provenance["statistics"] == json.loads(completed.stdout)
    assert provenance["redaction"]["value"] == "<redacted>"
    assert provenance["dependency_versions"]["zope.schema"] == "1.0"
    assert provenance["registered_modules"] == ["lp.example"]
    origin = provenance["resources"]["example"]["fields"]["display_name"][0]
    assert origin["interface"] == "lp.example.IExample"
    assert origin["field"] == "title"
    assert origin["source"] == "lib/lp/example.py"
    assert provenance["source_sha256"][origin["source"]]
    assert provenance["unresolved"][0]["field"] == "dynamic"
    assert provenance["unresolved"][0]["reason"] == "unresolved or ambiguous marshaller"
