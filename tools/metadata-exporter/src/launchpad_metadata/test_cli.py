# Copyright 2026 Canonical Ltd.  This software is licensed under the
# GNU Lesser General Public License version 3 (see the file LICENSE).

from pathlib import Path

from launchpad_metadata.cli import create_parser


def test_defaults_remain_anchored_to_repository_when_cwd_changes(tmp_path, monkeypatch):
    repository = next(
        ancestor
        for ancestor in Path(__file__).resolve().parents
        if (ancestor / "package.json").is_file()
    )
    monkeypatch.chdir(tmp_path)
    args = create_parser().parse_args([])
    assert args.output == repository / "src/wadl/metadata"
    assert args.launchpad is None


def test_explicit_paths_override_defaults():
    args = create_parser().parse_args(["/checkout", "--output", "/catalog"])
    assert args.launchpad == Path("/checkout")
    assert args.output == Path("/catalog")


def test_acquisition_options():
    args = create_parser().parse_args(["--cache-dir", "/cache", "--refresh"])
    assert args.launchpad is None
    assert args.cache_dir == Path("/cache")
    assert args.refresh is True
    assert create_parser().parse_args([]).refresh is False
