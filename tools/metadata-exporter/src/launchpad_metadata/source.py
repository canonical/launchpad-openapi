# Copyright 2026 Canonical Ltd.  This software is licensed under the
# GNU Lesser General Public License version 3 (see the file LICENSE).
"""Resolve pinned dependency archives, imports, and interface declarations."""

import ast
import tarfile
import xml.etree.ElementTree as ET
from hashlib import sha256

from .constants import DECLARATIONS, ENUM_TYPES, JSON_PUBLISHABLE
from .dependencies import read_dependency_versions
from .syntax import compute_definition_digest, literal, parse_source, statements


class SpecificationNode:
    """AST-backed graph node consumed by the pinned Zope RO implementation."""

    def __init__(self, name):
        self.name = name
        self.__bases__ = ()


class Source:
    def __init__(self, root):
        self.root = root
        self.modules = {}
        self.archive_modules = {}
        self.specifications = {}
        self.hashes = {}
        self.adapters = []
        self.json_publishers = []
        self.vocabulary_utilities = {}
        self.unresolved = []
        self.reviewed = set()
        self.dependencies = read_dependency_versions(root, read_file=self.read_file)
        for package, version in self.dependencies.items():
            archive = (
                root / "download-cache/dist" / (package + "-" + version + ".tar.gz")
            )
            data = archive.read_bytes()
            self.hashes[str(archive.relative_to(root))] = sha256(data).hexdigest()
            with tarfile.open(archive) as contents:
                for member in contents.getmembers():
                    if "/src/" not in member.name or not member.isfile():
                        continue
                    relative = member.name.split("/src/", 1)[1]
                    stream = contents.extractfile(member)
                    if stream is None:
                        raise ValueError("Unreadable archive member: " + member.name)
                    text = stream.read().decode("utf8")
                    origin = str(archive.relative_to(root)) + ":" + member.name
                    if relative.endswith(".py"):
                        module = relative[:-3].replace("/", ".")
                        if module.endswith(".__init__"):
                            module = module[:-9]
                        self.archive_modules[module] = (
                            text,
                            origin,
                            relative.endswith("/__init__.py"),
                        )
                    elif relative == "lazr/restful/configure.zcml":
                        self.register_adapters(ET.fromstring(text))
        # ro.py is standalone stdlib code: execute the pinned implementation,
        # not Launchpad or Zope application imports, on our AST-backed graph.
        text, origin, _ = self.archive_modules["zope.interface.ro"]
        namespace = {"__name__": "launchpad_metadata_ro"}
        exec(compile(text, origin, "exec"), namespace)
        for flag in ("TRACK_BAD_IRO", "WARN_BAD_IRO", "STRICT_IRO"):
            setattr(namespace["C3"], flag, False)
        self.ro = namespace["ro"]
        # Include all application registrations, so unsupported overrides block
        # an otherwise known base marshaller instead of being silently ignored.
        self.registered_modules = set()
        for path in sorted((root / "lib/lp").rglob("*.zcml")):
            text = self.read_file(path)
            document = ET.fromstring(text)
            self.register_adapters(document)
            package = ".".join(path.parent.relative_to(root / "lib").parts)
            for element in document.iter():
                if (
                    element.get("provides")
                    != "zope.schema.interfaces.IVocabularyFactory"
                ):
                    continue
                name = element.get("name")
                component = element.get("component")
                if name and component:
                    if component.startswith("."):
                        component = package + component
                    self.vocabulary_utilities.setdefault(name, set()).add(component)
            for element in document.iter():
                if (
                    element.tag
                    == "{http://namespaces.canonical.com/webservice}register"
                ):
                    module = element.get("module")
                    if module:
                        self.registered_modules.add(module)

    def read_file(self, path):
        data = path.read_bytes()
        self.hashes[str(path.relative_to(self.root))] = sha256(data).hexdigest()
        return data.decode("utf8")

    def register_adapters(self, document):
        for node in document.iter():
            if node.tag.split("}")[-1] != "adapter":
                continue
            provides = node.get("provides")
            interfaces = node.get("for", "").split()
            if provides == "lazr.restful.interfaces.IFieldMarshaller" and interfaces:
                self.adapters.append((interfaces, node.get("factory", "")))
            elif provides in (JSON_PUBLISHABLE, None) and node.get("factory"):
                # Without ZCML provides/for, @implementer and @adapter decide.
                self.json_publishers.append(
                    (interfaces or None, provides, node.get("factory"))
                )

    def module(self, name):
        if name in self.modules:
            return self.modules[name]
        if name in self.archive_modules:
            text, origin, package = self.archive_modules[name]
        else:
            base = self.root / "lib" / name.replace(".", "/")
            path = base.with_suffix(".py")
            package = False
            if not path.is_file():
                path = base / "__init__.py"
                package = True
            if not path.is_file():
                self.modules[name] = None
                return None
            text = self.read_file(path)
            origin = str(path.relative_to(self.root))
        parsed = parse_source(text, origin)
        tree = parsed.tree
        result = {
            "tree": tree,
            "symbols": {},
            "origin": origin,
            "all": None,
            "parsed": parsed,
        }
        self.modules[name] = result
        symbols = result["symbols"]
        for node in statements(tree.body):
            if isinstance(node, (ast.ClassDef, ast.FunctionDef)):
                symbols[node.name] = node
            elif isinstance(node, ast.ImportFrom):
                parent = name if package else name.rsplit(".", 1)[0]
                prefix = (
                    parent.split(".")[: len(parent.split(".")) - node.level + 1]
                    if node.level
                    else []
                )
                imported = ".".join(prefix + ([node.module] if node.module else []))
                for alias in node.names:
                    if alias.name == "*":
                        other = self.module(imported)
                        if other:
                            for key in other["all"] or other["symbols"]:
                                if not key.startswith("_"):
                                    symbols[key] = imported + "." + key
                    else:
                        symbols[alias.asname or alias.name] = (
                            imported + "." + alias.name
                        )
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    symbols[alias.asname or alias.name.split(".")[0]] = (
                        alias.name if alias.asname else alias.name.split(".")[0]
                    )
            elif isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        symbols[target.id] = node.value
                        if target.id == "__all__":
                            value = literal(node.value)
                            result["all"] = value if isinstance(value, list) else None
        return result

    def resolve(self, qualified, seen=()):
        if qualified in seen or "." not in qualified:
            return qualified
        module, name = qualified.rsplit(".", 1)
        source = self.module(module)
        value = source["symbols"].get(name) if source else None
        if isinstance(value, str):
            return self.resolve(value, seen + (qualified,))
        if isinstance(value, (ast.Name, ast.Attribute)):
            return self.resolve(self.reference(module, value), seen + (qualified,))
        return qualified

    def reference(self, module, node):
        if isinstance(node, ast.Name):
            source = self.module(module)
            value = source["symbols"].get(node.id) if source else None
            return value if isinstance(value, str) else module + "." + node.id
        if isinstance(node, ast.Attribute):
            return self.reference(module, node.value) + "." + node.attr
        if isinstance(node, ast.IfExp):
            # Version-gated bases, such as zope.schema's `ITextLine if PY3
            # else IBytesLine`, select one branch on Launchpad's Python 3.
            is_python3 = self.python3_condition(module, node.test)
            if is_python3 is not None:
                return self.reference(module, node.body if is_python3 else node.orelse)
        return ""

    def python3_condition(self, module, node, seen=()):
        """Evaluate `sys.version_info[0] >= 3` flags and their negations."""
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not):
            value = self.python3_condition(module, node.operand, seen)
            return None if value is None else not value
        if isinstance(node, (ast.Name, ast.Attribute)):
            qualified, value = self.definition(self.reference(module, node))
            if (
                qualified in seen
                or not isinstance(value, ast.expr)
                or "." not in qualified
            ):
                return None
            return self.python3_condition(
                qualified.rsplit(".", 1)[0], value, seen + (qualified,)
            )
        if (
            isinstance(node, ast.Compare)
            and len(node.ops) == 1
            and isinstance(node.ops[0], ast.GtE)
            and isinstance(node.left, ast.Subscript)
            and literal(node.left.slice) == 0
            and self.reference(module, node.left.value) == "sys.version_info"
            and literal(node.comparators[0]) == 3
        ):
            return True
        return None

    def definition(self, qualified):
        qualified = self.resolve(qualified)
        if "." not in qualified:
            return qualified, None
        module, name = qualified.rsplit(".", 1)
        source = self.module(module)
        return qualified, source["symbols"].get(name) if source else None

    def ancestry(self, qualified, seen=()):
        qualified, node = self.definition(qualified)
        if qualified in seen:
            return set()
        result = {qualified}
        if isinstance(node, ast.ClassDef):
            module = qualified.rsplit(".", 1)[0]
            for base in node.bases:
                result.update(
                    self.ancestry(self.reference(module, base), seen + (qualified,))
                )
        return result

    def specification(self, qualified, implementation=False):
        qualified, node = self.definition(qualified)
        key = ("implements:" if implementation else "") + qualified
        if key in self.specifications:
            return self.specifications[key]
        specification = SpecificationNode(key)
        self.specifications[key] = specification
        if not isinstance(node, ast.ClassDef):
            return specification
        module = qualified.rsplit(".", 1)[0]
        bases = [
            self.specification(self.reference(module, base), implementation)
            for base in node.bases
        ]
        if not implementation:
            specification.__bases__ = tuple(bases)
            return specification
        inherited = {
            ancestor.name
            for base in bases
            for ancestor in self.ro(
                base, strict=False, log_changed_ro=False, use_legacy_ro=False
            )
        }
        declared = []
        for decorator in reversed(node.decorator_list):
            if isinstance(decorator, ast.Call) and self.resolve(
                self.reference(module, decorator.func)
            ) in (
                "zope.interface.declarations.implementer",
                "zope.schema._field.implementer_if_needed",
            ):
                declared.extend(
                    self.resolve(self.reference(module, argument))
                    for argument in decorator.args
                )
        # Bootstrapped schema classes receive classImplements declarations in
        # _field, after their original _bootstrapfields definitions.
        registration_modules = [module]
        if module == "zope.schema._bootstrapfields":
            registration_modules.append("zope.schema._field")
        registrations = []
        for owner in registration_modules:
            source = self.module(owner)
            for statement in statements(source["tree"].body):
                if not isinstance(statement, ast.Expr) or not isinstance(
                    statement.value, ast.Call
                ):
                    continue
                call = statement.value
                function = self.resolve(self.reference(owner, call.func))
                if (
                    function
                    not in (
                        "zope.interface.declarations.classImplements",
                        "zope.interface.declarations.classImplementsFirst",
                    )
                    or not call.args
                    or self.resolve(self.reference(owner, call.args[0])) != qualified
                ):
                    continue
                registrations.append(
                    (
                        function,
                        [
                            self.resolve(self.reference(owner, argument))
                            for argument in call.args[1:]
                        ],
                    )
                )
        for function, interfaces in registrations:
            for interface in interfaces:
                if function.endswith("classImplementsFirst") or any(
                    base in self.ancestry(interface) for base in declared
                ):
                    declared.insert(0, interface)
                else:
                    declared.append(interface)
        declared = list(
            dict.fromkeys(
                interface for interface in declared if interface not in inherited
            )
        )
        specification.__bases__ = tuple(
            self.specification(interface) for interface in declared
        ) + tuple(bases)
        return specification

    def order(self, qualified, implementation=False):
        return [
            node.name
            for node in self.ro(
                self.specification(qualified, implementation),
                strict=False,
                log_changed_ro=False,
                use_legacy_ro=False,
            )
        ]

    def fields(self, qualified, seen=()):
        result = {}
        # Specification.get selects the first direct field along __iro__.
        for ancestor in self.order(qualified):
            ancestor, node = self.definition(ancestor)
            if not isinstance(node, ast.ClassDef):
                continue
            module = ancestor.rsplit(".", 1)[0]
            for statement in node.body:
                if isinstance(statement, ast.Assign):
                    for target in statement.targets:
                        if isinstance(target, ast.Name):
                            result.setdefault(
                                target.id, (module, statement.value, ancestor)
                            )
        return result

    def expression(self, module, node, fields, seen=()):
        """Resolve known field wrappers/copies to constructor + attributes."""
        marker = (module, id(node))
        if marker in seen:
            return None
        seen = seen + (marker,)
        if isinstance(node, ast.Name) and node.id in fields:
            owner, value, _ = fields[node.id]
            return self.expression(owner, value, fields, seen)
        if isinstance(node, ast.Subscript):
            name = literal(node.slice)
            if isinstance(name, str):
                other = self.fields(self.reference(module, node.value))
                if name in other:
                    owner, value, _ = other[name]
                    return self.expression(owner, value, other, seen)
        if not isinstance(node, ast.Call):
            return None
        function = self.resolve(self.reference(module, node.func))
        keywords = {kw.arg: (module, kw.value) for kw in node.keywords if kw.arg}
        if function in (
            DECLARATIONS + "exported",
            "lazr.lifecycle.snapshot.doNotSnapshot",
            "lazr.restful.interface.copy_field",
        ):
            if not node.args:
                return None
            resolved = self.expression(module, node.args[0], fields, seen)
            if resolved and function == "lazr.restful.interface.copy_field":
                constructor, attrs, exports = resolved
                return constructor, {**attrs, **keywords}, exports
            if resolved and function == DECLARATIONS + "exported":
                constructor, attrs, exports = resolved
                names = []
                alias = (
                    literal(keywords["exported_as"][1])
                    if "exported_as" in keywords
                    else None
                )
                if alias is None or isinstance(alias, str):
                    names.append(alias)
                for annotation in node.args[1:]:
                    if (
                        isinstance(annotation, (ast.Tuple, ast.List))
                        and len(annotation.elts) == 2
                    ):
                        values = literal(annotation.elts[1])
                        if (
                            isinstance(values, dict)
                            and values.get("exported", True) is not False
                        ):
                            alias = values.get("exported_as")
                            if alias is None or isinstance(alias, str):
                                names.append(alias)
                return constructor, attrs, names
            return resolved
        positional = self.bind_positional(
            function, [(module, argument) for argument in node.args]
        )
        return function, {**positional, **keywords}, None

    def bind_positional(self, qualified, arguments, start=0, order=None):
        order = self.order(qualified) if order is None else order
        for index in range(start, len(order)):
            ancestor, node = self.definition(order[index])
            if not isinstance(node, ast.ClassDef):
                continue
            constructor = next(
                (
                    statement
                    for statement in node.body
                    if isinstance(statement, ast.FunctionDef)
                    and statement.name == "__init__"
                ),
                None,
            )
            if constructor is None:
                continue
            parameters = (constructor.args.posonlyargs + constructor.args.args)[1:]
            attributes = {
                parameter.arg: argument
                for parameter, argument in zip(parameters, arguments)
            }
            remaining = arguments[len(parameters) :]
            if not remaining or constructor.args.vararg is None:
                return attributes
            variable = constructor.args.vararg.arg
            if any(
                isinstance(part, ast.Name)
                and isinstance(part.ctx, ast.Store)
                and part.id == variable
                for part in ast.walk(constructor)
            ):
                return attributes
            # Forward only an unchanged positional tuple to super().__init__.
            # Unknown/custom positional transformations remain unresolved.
            for part in ast.walk(constructor):
                if (
                    not isinstance(part, ast.Call)
                    or not isinstance(part.func, ast.Attribute)
                    or part.func.attr != "__init__"
                ):
                    continue
                receiver = part.func.value
                if (
                    not isinstance(receiver, ast.Call)
                    or not isinstance(receiver.func, ast.Name)
                    or receiver.func.id != "super"
                ):
                    continue
                if (
                    len(part.args) == 1
                    and isinstance(part.args[0], ast.Starred)
                    and isinstance(part.args[0].value, ast.Name)
                    and part.args[0].value.id == variable
                ):
                    forwarded = self.bind_positional(
                        qualified, remaining, index + 1, order
                    )
                    return {**attributes, **forwarded}
            return attributes
        return {}

    def provided_order(self, qualified):
        for ancestor in self.order(qualified):
            ancestor, node = self.definition(ancestor)
            if not isinstance(node, ast.ClassDef):
                continue
            module = ancestor.rsplit(".", 1)[0]
            metaclasses = [kw.value for kw in node.keywords if kw.arg == "metaclass"]
            for base in node.bases:
                if (
                    isinstance(base, ast.Call)
                    and self.reference(module, base.func) == "six.with_metaclass"
                    and base.args
                ):
                    metaclasses.append(base.args[0])
            for metaclass in metaclasses:
                order = self.order(self.reference(module, metaclass), True)
                if any(not name.startswith("implements:") for name in order):
                    return order
        return []

    def class_attribute(self, qualified, name, seen=()):
        qualified, node = self.definition(qualified)
        if qualified in seen or not isinstance(node, ast.ClassDef):
            return None
        module = qualified.rsplit(".", 1)[0]
        for statement in node.body:
            if isinstance(statement, ast.Assign) and any(
                isinstance(target, ast.Name) and target.id == name
                for target in statement.targets
            ):
                return module, statement.value
        for base in node.bases:
            value = self.class_attribute(
                self.reference(module, base), name, seen + (qualified,)
            )
            if value is not None:
                return value
        return None

    def method(self, qualified, name, seen=()):
        for ancestor in self.order(qualified):
            ancestor, node = self.definition(ancestor)
            if not isinstance(node, ast.ClassDef):
                continue
            module = ancestor.rsplit(".", 1)[0]
            for statement in node.body:
                if isinstance(statement, ast.FunctionDef) and statement.name == name:
                    return module, statement
        return None

    def vocabulary(self, expression):
        if expression is None:
            return None
        module, node = expression
        name = literal(node)
        if isinstance(name, str):
            components = {
                self.resolve(component)
                for component in self.vocabulary_utilities.get(name, ())
            }
            if len(components) != 1:
                return None
            qualified = components.pop()
        else:
            qualified = self.resolve(self.reference(module, node))
        qualified, definition = self.definition(qualified)
        if isinstance(definition, ast.ClassDef):
            return qualified
        # An explicit factory returning one concrete vocabulary class is also
        # source-backed. Dynamic factory computations remain unresolved.
        if isinstance(definition, ast.FunctionDef):
            owner = qualified.rsplit(".", 1)[0]
            returned = [
                statement.value
                for statement in ast.walk(definition)
                if isinstance(statement, ast.Return)
            ]
            if returned and all(isinstance(value, ast.Call) for value in returned):
                classes = {
                    self.resolve(self.reference(owner, value.func))
                    for value in returned
                }
                if len(classes) == 1:
                    candidate = classes.pop()
                    if isinstance(self.definition(candidate)[1], ast.ClassDef):
                        return candidate
        return None

    def tokenized_value_is_string(self, vocabulary):
        method = self.method(vocabulary, "getTermByToken")
        if method is None:
            return False
        module, definition = method
        arguments = definition.args.posonlyargs + definition.args.args
        if len(arguments) != 2:
            return False
        token = arguments[1].arg
        # IVocabularyTokenized tokens are native strings (ITokenizedTerm).
        # Do not assume its values are strings: prove each returned term's
        # value is that token or another explicit string expression.
        if any(
            isinstance(node, ast.Name)
            and isinstance(node.ctx, ast.Store)
            and node.id == token
            for node in ast.walk(definition)
        ):
            return False
        returned = [
            node.value for node in ast.walk(definition) if isinstance(node, ast.Return)
        ]
        if not returned:
            return False
        for term in returned:
            if (
                not isinstance(term, ast.Call)
                or self.resolve(self.reference(module, term.func))
                != "zope.schema.vocabulary.SimpleTerm"
            ):
                return False
            value = (
                term.args[0]
                if term.args
                else next((kw.value for kw in term.keywords if kw.arg == "value"), None)
            )
            if isinstance(value, ast.Name) and value.id == token:
                continue
            if isinstance(value, ast.Constant) and isinstance(value.value, str):
                continue
            if (
                isinstance(value, ast.Call)
                and isinstance(value.func, ast.Name)
                and value.func.id == "str"
                and "str" not in self.module(module)["symbols"]
            ):
                continue
            return False
        return True

    def decorator_arguments(self, qualified, decorator):
        """Resolved arguments of a class decorator such as @implementer."""
        qualified, node = self.definition(qualified)
        if not isinstance(node, ast.ClassDef):
            return []
        module = qualified.rsplit(".", 1)[0]
        return [
            self.resolve(self.reference(module, argument))
            for call in node.decorator_list
            if isinstance(call, ast.Call)
            and self.resolve(self.reference(module, call.func)) in decorator
            for argument in call.args
        ]

    def declares_implementation(self, interface, value_class):
        """Whether the interface's module calls classImplements(value_class, interface)."""
        module = interface.rsplit(".", 1)[0]
        source = self.module(module) if "." in interface else None
        if source is None:
            return False
        for statement in statements(source["tree"].body):
            if not isinstance(statement, ast.Expr) or not isinstance(
                statement.value, ast.Call
            ):
                continue
            call = statement.value
            if (
                not call.args
                or self.resolve(self.reference(module, call.func))
                != "zope.interface.declarations.classImplements"
            ):
                continue
            arguments = [
                self.resolve(self.reference(module, argument)) for argument in call.args
            ]
            if arguments[0] == value_class and interface in arguments[1:]:
                return True
        return False

    def string_publisher(self, value_class):
        """Whether ResourceJSONEncoder serializes value_class as a string.

        The encoder adapts non-JSON values to IJSONPublishable. Accept only one
        matching registered adapter whose toDataForJSON always returns str().
        """
        provided = self.ancestry(value_class)
        factories = set()
        for interfaces, provides, factory in self.json_publishers:
            if provides is None:
                if self.resolve(JSON_PUBLISHABLE) not in self.decorator_arguments(
                    factory, ("zope.interface.declarations.implementer",)
                ):
                    continue
                if interfaces is None:
                    interfaces = self.decorator_arguments(
                        factory,
                        (
                            "zope.component.adapter",
                            "zope.component._declaration.adapter",
                        ),
                    )
            if interfaces is None or len(interfaces) != 1:
                continue
            interface = self.resolve(interfaces[0])
            if interface in provided or self.declares_implementation(
                interface, value_class
            ):
                factories.add(self.resolve(factory))
        if len(factories) != 1:
            return False
        method = self.method(factories.pop(), "toDataForJSON")
        if method is None:
            return False
        module, definition = method
        returned = [
            node.value for node in ast.walk(definition) if isinstance(node, ast.Return)
        ]
        return (
            bool(returned)
            and "str" not in self.module(module)["symbols"]
            and all(
                isinstance(value, ast.Call)
                and isinstance(value.func, ast.Name)
                and value.func.id == "str"
                for value in returned
            )
        )

    def is_enumerated_type(self, expression):
        module, node = expression
        ancestry = self.ancestry(self.resolve(self.reference(module, node)))
        return any(enum in ancestry for enum in ENUM_TYPES)

    def definition_digest(self, qualified):
        """SHA-256 of a module-level or class-member definition's source lines."""
        parts = qualified.split(".")
        source = None
        for split in range(len(parts) - 1, 0, -1):
            source = self.module(".".join(parts[:split]))
            if source is not None:
                break
        if source is None:
            return None
        body, node = source["tree"].body, None
        for name in parts[split:]:
            node = next(
                (
                    statement
                    for statement in statements(body)
                    if (
                        isinstance(statement, (ast.ClassDef, ast.FunctionDef))
                        and statement.name == name
                    )
                    or (
                        isinstance(statement, ast.Assign)
                        and any(
                            isinstance(target, ast.Name) and target.id == name
                            for target in statement.targets
                        )
                    )
                ),
                None,
            )
            if node is None:
                return None
            body = node.body if isinstance(node, ast.ClassDef) else []
        return compute_definition_digest(source["parsed"], node)
