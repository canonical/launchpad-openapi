# Copyright 2026 Canonical Ltd.  This software is licensed under the
# GNU Lesser General Public License version 3 (see the file LICENSE).

import ast
from hashlib import sha256

from launchpad_metadata.syntax import (
    UNKNOWN,
    compute_definition_digest,
    literal,
    parse_source,
    statements,
)


def test_literals_do_not_evaluate_dynamic_expressions():
    assert literal(
        ast.parse("dict(required=False, missing_value=None)", mode="eval").body
    ) == {"required": False, "missing_value": None}
    assert literal(ast.parse("run_application()", mode="eval").body) is UNKNOWN


def test_statements_include_conditional_imports_but_not_function_locals():
    tree = ast.parse(
        "if flag:\n import first\nelse:\n import second\n"
        "try:\n import third\nexcept ImportError:\n import fourth\n"
        "finally:\n import fifth\n"
        "def local():\n import hidden\n"
    )
    imports = [
        alias.name
        for node in statements(tree.body)
        if isinstance(node, ast.Import)
        for alias in node.names
    ]
    assert imports == ["first", "second", "third", "fifth", "fourth"]


def test_definition_digest_keeps_decorators_unicode_and_full_source_lines():
    text = (
        '# ignored\r\n@review("é")\r\nclass Example:\r\n    value = "ñ"  # evidence\r\n'
    )
    parsed = parse_source(text, "example.py")
    node = parsed.tree.body[0]
    expected = '@review("é")\nclass Example:\n    value = "ñ"  # evidence'
    assert (
        compute_definition_digest(parsed, node) == sha256(expected.encode()).hexdigest()
    )
    expected_member = '    value = "ñ"  # evidence'
    assert (
        compute_definition_digest(parsed, node.body[0])
        == sha256(expected_member.encode()).hexdigest()
    )
