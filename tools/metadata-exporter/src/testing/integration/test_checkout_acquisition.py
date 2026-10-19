# Copyright 2026 Canonical Ltd.  This software is licensed under the
# GNU Lesser General Public License version 3 (see the file LICENSE).

import json
from hashlib import sha256

import pytest
from metadata_fixtures import (
    create_launchpad_checkout,
    forbid_subprocess,
    install_git_boundary,
    use_fresh_requirements,
)

from launchpad_metadata.cli import main


def forbid_http(*args, **kwargs):
    pytest.fail("Cached/explicit source archives must not make HTTP requests")


def test_default_cli_clones_official_url_into_cache_and_reuses_offline(
    tmp_path, monkeypatch, capfd
):
    remote = use_fresh_requirements(create_launchpad_checkout(tmp_path / "remote"))
    git = install_git_boundary(monkeypatch, remote)
    monkeypatch.setattr("urllib.request.urlopen", forbid_http)
    monkeypatch.chdir(tmp_path)
    cache = tmp_path / "cache"
    output = tmp_path / "catalog"
    arguments = ["--cache-dir", str(cache), "--output", str(output)]
    main(arguments)
    captured = capfd.readouterr()
    statistics = json.loads(captured.out)
    assert statistics == {
        "resources": 1,
        "fields": 1,
        "types": {"string": 1},
        "unresolved": 1,
    }
    assert "clon" in captured.err.lower(), "Git progress belongs on stderr"
    checkout = cache / "launchpad"
    clones = [call for call in git["calls"] if call[0] == "clone"]
    assert len(clones) == 1
    assert "https://git.launchpad.net/launchpad" in clones[0]
    # The subprocess boundary also asserts that clone requests depth 1.
    assert (checkout / "lib/lp/example.py").read_bytes() == (
        remote / "lib/lp/example.py"
    ).read_bytes()
    provenance = json.loads((output / "provenance.json").read_text())
    assert provenance["statistics"] == statistics
    assert "requirements/ztk-versions.cfg" in provenance["source_sha256"]
    assert not (checkout / "requirements/combined.txt").exists()
    remote.rename(tmp_path / "unavailable")
    git["calls"].clear()
    main(arguments)
    assert json.loads(capfd.readouterr().out) == statistics
    assert not any(
        call[0] in ("clone", "fetch", "pull", "merge") for call in git["calls"]
    )


def test_cli_refresh_updates_managed_source_before_export(tmp_path, monkeypatch, capfd):
    remote = use_fresh_requirements(create_launchpad_checkout(tmp_path / "remote"))
    git = install_git_boundary(monkeypatch, remote)
    monkeypatch.setattr("urllib.request.urlopen", forbid_http)
    cache = tmp_path / "cache"
    output = tmp_path / "catalog"
    arguments = ["--cache-dir", str(cache), "--output", str(output)]
    main(arguments)
    capfd.readouterr()
    source = remote / "lib/lp/example.py"
    source.write_text(source.read_text() + "\n# upstream change\n")
    git["calls"].clear()
    main([*arguments, "--refresh"])
    assert json.loads(capfd.readouterr().out)["fields"] == 1
    assert any(call[0] in ("pull", "merge") for call in git["calls"])
    assert (cache / "launchpad/lib/lp/example.py").read_bytes() == source.read_bytes()
    provenance = json.loads((output / "provenance.json").read_text())
    assert (
        provenance["source_sha256"]["lib/lp/example.py"]
        == sha256(source.read_bytes()).hexdigest()
    )


def test_explicit_checkout_is_offline_and_does_not_populate_cache(
    tmp_path, monkeypatch, capfd
):
    checkout = use_fresh_requirements(create_launchpad_checkout(tmp_path / "explicit"))
    monkeypatch.setattr("subprocess.run", forbid_subprocess)
    monkeypatch.setattr("urllib.request.urlopen", forbid_http)
    cache = tmp_path / "cache"
    main(
        [
            str(checkout),
            "--cache-dir",
            str(cache),
            "--output",
            str(tmp_path / "catalog"),
        ]
    )
    assert json.loads(capfd.readouterr().out)["fields"] == 1
    assert not cache.exists()
    assert not (checkout / ".git").exists()


def test_refresh_with_explicit_checkout_is_rejected_before_any_work(
    tmp_path, monkeypatch, capfd
):
    checkout = create_launchpad_checkout(tmp_path / "explicit")
    monkeypatch.setattr("subprocess.run", forbid_subprocess)
    monkeypatch.setattr("urllib.request.urlopen", forbid_http)
    output = tmp_path / "catalog"
    with pytest.raises(SystemExit) as error:
        main([str(checkout), "--refresh", "--output", str(output)])
    assert error.value.code == 2
    captured = capfd.readouterr()
    assert captured.out == ""
    assert "--refresh" in captured.err
    assert any(
        word in captured.err.lower() for word in ("explicit", "positional", "checkout")
    )
    assert not output.exists()
