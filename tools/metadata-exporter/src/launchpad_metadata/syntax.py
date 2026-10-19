# Copyright 2026 Canonical Ltd.  This software is licensed under the
# GNU Lesser General Public License version 3 (see the file LICENSE).
"""Conservative AST parsing and exact, token-backed definition ranges."""

import ast
from hashlib import sha256

from asttokens import ASTTokens

UNKNOWN = object()


def parse_source(text, origin):
    """Parse without importing source; retain tokens for review evidence."""
    return ASTTokens(text, parse=True, filename=origin)


def compute_definition_digest(parsed, node):
    """Hash full original lines, including decorators and trailing comments.

    Normalize line endings exactly as the original exporter did so existing
    reviewed evidence remains valid when parsing gains token information.
    """
    start, end = parsed.get_text_positions(node, padded=True)
    lines = parsed.text.splitlines()[start[0] - 1 : end[0]]
    return sha256("\n".join(lines).encode()).hexdigest()


def literal(node):
    try:
        return ast.literal_eval(node)
    except (ValueError, TypeError):
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "dict"
        ):
            return {kw.arg: literal(kw.value) for kw in node.keywords if kw.arg}
        return UNKNOWN


def statements(nodes):
    """Module scope, including conditional imports, never function locals."""
    for node in nodes:
        yield node
        if isinstance(node, (ast.If, ast.Try)):
            yield from statements(node.body)
            yield from statements(node.orelse)
            if isinstance(node, ast.Try):
                yield from statements(node.finalbody)
                for handler in node.handlers:
                    yield from statements(handler.body)
