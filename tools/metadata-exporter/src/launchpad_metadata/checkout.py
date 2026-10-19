# Copyright 2026 Canonical Ltd.  This software is licensed under the
# GNU Lesser General Public License version 3 (see the file LICENSE).
"""Acquire and refresh a managed Launchpad clone without touching user checkouts."""

import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

LAUNCHPAD_REPOSITORY = "https://git.launchpad.net/launchpad"


def run_git(*arguments):
    """Keep stdout for queries while streaming Git diagnostics to stderr."""
    result = subprocess.run(
        ["git", *map(str, arguments)],
        check=True,
        stdout=subprocess.PIPE,
        text=True,
    )
    return result.stdout.strip()


def prepare_checkout(cache_directory, *, repository=None, refresh=False):
    """Clone once, reuse offline, and fast-forward only when explicitly requested.

    A clone is published only after Git succeeds. Existing directories must be
    normal clones of the expected repository; they are never replaced or reset.
    """
    repository = repository or LAUNCHPAD_REPOSITORY
    checkout = cache_directory / "launchpad"
    if checkout.exists() or checkout.is_symlink():
        if checkout.is_symlink() or not (checkout / ".git").is_dir():
            raise ValueError(f"Refusing unmanaged checkout directory: {checkout}")
        # Read the configured URL, not a URL expanded by Git's insteadOf rules.
        origin = run_git("-C", checkout, "config", "--get", "remote.origin.url")
        if origin != repository:
            raise ValueError(f"Managed checkout has a different origin: {checkout}")
        if refresh:
            changes = run_git(
                "-C", checkout, "status", "--porcelain", "--untracked-files=no"
            )
            if changes:
                raise ValueError(
                    f"Managed checkout has tracked local modifications: {checkout}"
                )
            print(f"Updating Launchpad in {checkout}", file=sys.stderr)
            run_git("-C", checkout, "pull", "--ff-only")
        return checkout

    cache_directory.mkdir(parents=True, exist_ok=True)
    print(f"Cloning Launchpad into {checkout}", file=sys.stderr)
    with TemporaryDirectory(prefix=".launchpad-", dir=cache_directory) as temporary:
        staged = Path(temporary) / "checkout"
        run_git(
            "clone",
            "--depth",
            "1",
            "--single-branch",
            "--progress",
            "--",
            repository,
            staged,
        )
        staged.rename(checkout)
    return checkout
