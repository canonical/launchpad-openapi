# Copyright 2026 Canonical Ltd.  This software is licensed under the
# GNU Lesser General Public License version 3 (see the file LICENSE).
"""Small source-only checkout; none of these application modules may execute."""

import io
import shutil
import subprocess
import tarfile
from pathlib import Path
from textwrap import dedent

EXAMPLE = dedent("""\
    from zope.schema import Text
    from lazr.restful.declarations import exported, exported_as_webservice_entry

    raise RuntimeError("Launchpad source must not execute")

    @exported_as_webservice_entry("example")
    class IExample:
        title = exported(Text(required=False), exported_as="display_name")
        dynamic = exported(make_dynamic_field())
""")


DEPENDENCY_VERSIONS = dict.fromkeys(
    ("lazr.restful", "zope.schema", "zope.interface", "lazr.enum", "lazr.lifecycle"),
    "1.0",
)


def use_fresh_requirements(root):
    """Replace the generated combined manifest with tracked buildout pins."""
    (root / "requirements/combined.txt").unlink()
    (root / "requirements/ztk-versions.cfg").write_text(
        "[versions]\n"
        + "".join(
            f"{name} = {version}\n" for name, version in DEPENDENCY_VERSIONS.items()
        )
        + "\n[unrelated]\nzope.schema = 999\n",
        encoding="utf-8",
    )
    return root


def install_git_boundary(monkeypatch, source, *, repository=None):
    """Replace only Git subprocess I/O; clone/update real source fixture files.

    Queries return boundary responses, not a simulated Git object database.
    Unexpected subprocesses fail rather than reaching Git or the network.
    """
    repository = repository or "https://git.launchpad.net/launchpad"
    state = {
        "calls": [],
        "dirty": False,
        "clone_failure": False,
        "update_failure": False,
        "origin": repository,
    }

    def run(command, *args, **kwargs):
        command = [str(part) for part in command]
        assert command[0] == "git", f"Unexpected subprocess: {command}"
        arguments = command[1:]
        directory = Path(kwargs.get("cwd", "."))
        if arguments[:1] == ["-C"]:
            directory = Path(arguments[1])
            arguments = arguments[2:]
        state["calls"].append(arguments)
        operation = arguments[0]
        stdout = ""
        if operation == "clone":
            destination = Path(arguments[-1])
            assert repository in arguments
            assert "--depth=1" in arguments or any(
                arguments[index : index + 2] == ["--depth", "1"]
                for index in range(len(arguments))
            ), "Managed clones must be shallow"
            shutil.copytree(source, destination, dirs_exist_ok=True)
            (destination / ".git").mkdir(exist_ok=True)
            if state["clone_failure"]:
                raise subprocess.CalledProcessError(128, command, stderr="clone failed")
        elif operation == "remote" and arguments[1:] == ["get-url", "origin"]:
            stdout = state["origin"] + "\n"
        elif operation == "config" and arguments[-1] == "remote.origin.url":
            stdout = state["origin"] + "\n"
        elif operation == "rev-parse" and arguments[-1] == "--is-inside-work-tree":
            stdout = "true\n"
        elif operation == "status":
            stdout = " M lib/lp/example.py\n" if state["dirty"] else ""
        elif operation == "fetch":
            pass
        elif operation in ("pull", "merge"):
            assert "--ff-only" in arguments, "Refresh must not discard local history"
            if state["update_failure"]:
                raise subprocess.CalledProcessError(
                    128, command, stderr="Not fast-forward"
                )
            shutil.copytree(source / "lib", directory / "lib", dirs_exist_ok=True)
        else:
            raise AssertionError(f"Unexpected Git boundary call: {command}")
        return subprocess.CompletedProcess(command, 0, stdout=stdout, stderr="")

    monkeypatch.setattr("subprocess.run", run)
    return state


def forbid_subprocess(*args, **kwargs):
    raise AssertionError(
        "Explicit/cached checkout must not acquire source via subprocess"
    )


def create_launchpad_checkout(root):
    dependencies = {
        "lazr.restful": {
            "lazr/restful/configure.zcml": """
                <configure>
                  <adapter for="zope.schema.interfaces.IText lazr.restful.interfaces.IEntry"
                    provides="lazr.restful.interfaces.IFieldMarshaller"
                    factory="lazr.restful.marshallers.TextFieldMarshaller" />
                </configure>
            """,
            "lazr/restful/_resource.py": """
                class FieldUnmarshallerMixin:
                    REDACTED_VALUE = "<redacted>"
            """,
        },
        "zope.schema": {
            "zope/schema/__init__.py": "from ._field import Text",
            "zope/schema/interfaces.py": "class IText: pass",
            "zope/schema/_field.py": """
                from zope.interface import implementer
                from zope.schema.interfaces import IText

                @implementer(IText)
                class Text:
                    missing_value = None
            """,
        },
        "zope.interface": {
            "zope/interface/__init__.py": "from .declarations import implementer",
            # Only single inheritance is used by this fixture, so its pinned
            # resolution order has no conflicting/diamond declarations.
            "zope/interface/ro.py": """
                class C3:
                    pass

                def ro(node, **kwargs):
                    return [node] + [
                        ancestor for base in node.__bases__
                        for ancestor in ro(base)
                    ]
            """,
        },
        "lazr.enum": {},
        "lazr.lifecycle": {},
    }
    requirements = root / "requirements"
    requirements.mkdir(parents=True)
    (requirements / "combined.txt").write_text(
        "".join(f"{name}==1.0\n" for name in dependencies), encoding="utf-8"
    )
    (requirements / "launchpad.txt").write_text("", encoding="utf-8")
    archive_directory = root / "download-cache/dist"
    archive_directory.mkdir(parents=True)
    for package, modules in dependencies.items():
        with tarfile.open(
            archive_directory / f"{package}-1.0.tar.gz", "w:gz"
        ) as archive:
            for name, text in modules.items():
                data = dedent(text).encode()
                member = tarfile.TarInfo(f"{package}-1.0/src/{name}")
                member.size = len(data)
                archive.addfile(member, io.BytesIO(data))
    application = root / "lib/lp"
    application.mkdir(parents=True)
    (application / "example.py").write_text(EXAMPLE, encoding="utf-8")
    (application / "configure.zcml").write_text(
        '<configure xmlns:webservice="http://namespaces.canonical.com/webservice">'
        '<webservice:register module="lp.example" /></configure>',
        encoding="utf-8",
    )
    return root
