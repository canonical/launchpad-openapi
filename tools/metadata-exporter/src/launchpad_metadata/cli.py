# Copyright 2026 Canonical Ltd.  This software is licensed under the
# GNU Lesser General Public License version 3 (see the file LICENSE).
"""Export conservative JSON field metadata without importing Launchpad.

Only registered webservice interfaces and understood marshallers are used.
Dynamic declarations remain unconstrained and are recorded in provenance.json.
"""

import argparse
import json
import subprocess
from pathlib import Path

from platformdirs import user_cache_path

from .catalog import write_catalog
from .checkout import prepare_checkout
from .dependencies import ensure_source_archives
from .source import Source


def create_parser():
    """Default to managed source acquisition and repository-local output."""
    repository_directory = Path(__file__).resolve().parents[4]
    metadata_directory = repository_directory / "src/wadl/metadata"
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )
    parser.add_argument(
        "launchpad",
        type=Path,
        nargs="?",
        help="Existing Launchpad checkout (omit to clone automatically)",
    )
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=user_cache_path("launchpad-openapi") / "metadata",
        help="Managed checkout cache (used only without an explicit checkout)",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Fast-forward the managed Launchpad checkout before exporting",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=metadata_directory,
        help="Generated catalog directory",
    )
    return parser


def main(argv=None):
    """Read the checkout and write its generated catalog."""
    parser = create_parser()
    args = parser.parse_args(argv)
    if args.launchpad is not None and args.refresh:
        parser.error("--refresh cannot be used with an explicit Launchpad checkout")
    if args.launchpad is not None:
        checkout = args.launchpad.resolve()
    else:
        try:
            checkout = prepare_checkout(args.cache_dir.resolve(), refresh=args.refresh)
            ensure_source_archives(checkout)
        except (OSError, ValueError, subprocess.CalledProcessError) as error:
            detail = (
                error.stderr.strip()
                if isinstance(error, subprocess.CalledProcessError) and error.stderr
                else str(error)
            )
            parser.exit(1, f"{parser.prog}: {detail}\n")
    statistics = write_catalog(Source(checkout), args.output)
    print(json.dumps(statistics, sort_keys=True))
