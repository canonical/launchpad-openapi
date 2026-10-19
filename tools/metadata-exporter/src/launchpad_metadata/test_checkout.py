# Copyright 2026 Canonical Ltd.  This software is licensed under the
# GNU Lesser General Public License version 3 (see the file LICENSE).

import importlib

import pytest
from metadata_fixtures import create_launchpad_checkout, install_git_boundary


@pytest.fixture
def prepare_checkout():
    return importlib.import_module("launchpad_metadata.checkout").prepare_checkout


@pytest.fixture
def git_boundary(tmp_path, monkeypatch):
    source = create_launchpad_checkout(tmp_path / "remote")
    state = install_git_boundary(monkeypatch, source, repository=source.as_uri())
    return source, state


def snapshot(root):
    return {
        path.relative_to(root): path.read_bytes()
        for path in root.rglob("*")
        if path.is_file()
    }


def test_clone_is_shallow_reused_offline_and_refreshed_only_on_request(
    tmp_path, prepare_checkout, git_boundary
):
    remote, git = git_boundary
    cache = tmp_path / "cache"
    checkout = prepare_checkout(cache, repository=remote.as_uri())
    assert checkout == cache / "launchpad"
    assert sum(call[0] == "clone" for call in git["calls"]) == 1
    original = snapshot(checkout)
    updated_source = remote / "lib/lp/example.py"
    updated_source.write_text(updated_source.read_text() + "\n# upstream change\n")
    git["calls"].clear()
    assert prepare_checkout(cache, repository=remote.as_uri()) == checkout
    assert snapshot(checkout) == original
    assert not any(
        call[0] in ("clone", "fetch", "pull", "merge") for call in git["calls"]
    )
    assert prepare_checkout(cache, repository=remote.as_uri(), refresh=True) == checkout
    assert any(call[0] in ("pull", "merge") for call in git["calls"])
    assert (checkout / "lib/lp/example.py").read_bytes() == updated_source.read_bytes()


def test_refresh_preserves_tracked_edits(tmp_path, prepare_checkout, git_boundary):
    remote, git = git_boundary
    cache = tmp_path / "cache"
    checkout = prepare_checkout(cache, repository=remote.as_uri())
    (checkout / "lib/lp/example.py").write_text("# local edits\n")
    before = snapshot(checkout)
    git["dirty"] = True
    git["calls"].clear()
    with pytest.raises(Exception) as error:
        prepare_checkout(cache, repository=remote.as_uri(), refresh=True)
    assert not isinstance(error.value, AssertionError), "Unexpected Git boundary call"
    assert any(call[0] == "status" for call in git["calls"])
    assert snapshot(checkout) == before
    assert not any(call[0] in ("pull", "merge") for call in git["calls"])


def test_refresh_refuses_non_fast_forward(tmp_path, prepare_checkout, git_boundary):
    remote, git = git_boundary
    cache = tmp_path / "cache"
    checkout = prepare_checkout(cache, repository=remote.as_uri())
    before = snapshot(checkout)
    git["update_failure"] = True
    with pytest.raises(Exception) as error:
        prepare_checkout(cache, repository=remote.as_uri(), refresh=True)
    assert not isinstance(error.value, AssertionError), "Unexpected Git boundary call"
    assert any(call[0] in ("pull", "merge") for call in git["calls"])
    assert snapshot(checkout) == before


@pytest.mark.parametrize("existing_git", [False, True])
def test_refuses_unmanaged_directory_without_overwriting(
    tmp_path, prepare_checkout, git_boundary, existing_git
):
    remote, git = git_boundary
    cache = tmp_path / "cache"
    checkout = cache / "launchpad"
    checkout.mkdir(parents=True)
    if existing_git:
        (checkout / ".git").mkdir()
        git["origin"] = (tmp_path / "other").as_uri()
    (checkout / "keep.txt").write_text("precious\n")
    before = snapshot(checkout)
    with pytest.raises(Exception) as error:
        prepare_checkout(cache, repository=remote.as_uri())
    assert not isinstance(error.value, AssertionError), "Unexpected Git boundary call"
    assert snapshot(checkout) == before
    assert not any(
        call[0] in ("clone", "fetch", "pull", "merge") for call in git["calls"]
    )


def test_failed_clone_cleans_stage_and_can_retry(
    tmp_path, prepare_checkout, git_boundary
):
    remote, git = git_boundary
    cache = tmp_path / "cache"
    git["clone_failure"] = True
    with pytest.raises(Exception) as error:
        prepare_checkout(cache, repository=remote.as_uri())
    assert not isinstance(error.value, AssertionError), "Unexpected Git boundary call"
    assert any(call[0] == "clone" for call in git["calls"])
    assert not (cache / "launchpad").exists()
    assert not cache.exists() or list(cache.iterdir()) == []
    git["clone_failure"] = False
    checkout = prepare_checkout(cache, repository=remote.as_uri())
    assert (checkout / "lib/lp/example.py").read_bytes() == (
        remote / "lib/lp/example.py"
    ).read_bytes()
    assert list(cache.iterdir()) == [checkout]
