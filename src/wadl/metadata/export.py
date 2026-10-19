#!/usr/bin/env python3
# Copyright 2026 Canonical Ltd.  This software is licensed under the
# GNU Lesser General Public License version 3 (see the file LICENSE).
"""Export conservative JSON field metadata without importing Launchpad.

Usage: python3 src/wadl/metadata/export.py [LAUNCHPAD] [--output DIRECTORY]

Only registered webservice interfaces and registered, understood marshallers
are used. Imports, interface inheritance, exported aliases, copied fields and
snapshot wrappers are resolved structurally. Dynamic expressions/custom
marshallers remain unconstrained and are recorded in provenance.json.
"""

import argparse
import ast
from collections import Counter
from hashlib import sha256
import json
from pathlib import Path
import re
import tarfile
import xml.etree.ElementTree as ET


UNKNOWN = object()
DECLARATIONS = "lazr.restful.declarations."
JSON_PUBLISHABLE = "lazr.restful.interfaces.IJSONPublishable"
# lazr.enum's metaclass collects only BaseItem class attributes as items, so
# iterating an enumerated type yields BaseItem instances.
ENUM_TYPES = ("lazr.enum._enum.EnumeratedType", "lazr.enum._enum.DBEnumeratedType")
ENUM_ITEM = "lazr.enum._enum.BaseItem"
# Contracts of these implementations in pinned lazr.restful/marshallers.py.
# The adapter registry selects them; these are NOT field-name overrides.
MARSHALLERS = {
    "BoolFieldMarshaller": ("boolean", None, ""),
    "IntFieldMarshaller": ("integer", None, ""),
    "FloatFieldMarshaller": ("number", None, ""),
    "TextFieldMarshaller": ("string", None, ""),
    "DateTimeFieldMarshaller": ("string", "date-time", ""),
    "DateFieldMarshaller": ("string", "date", ""),
    "BytesFieldMarshaller": ("string", "uri", "_link"),
    "ObjectLookupFieldMarshaller": ("string", "uri", "_link"),
    "CollectionFieldMarshaller": ("string", "uri", "_collection_link"),
    "AbstractCollectionFieldMarshaller": ("array", None, ""),
    "SetFieldMarshaller": ("array", None, ""),
    "DictFieldMarshaller": ("object", None, ""),
    "SimpleVocabularyLookupFieldMarshaller": ("string", None, ""),
}
# Serialized values interfaces leave undeclared or constrain only for input,
# reviewed against the model and marshaller. A changed declaration or evidence
# definition invalidates the review: the field is reported unresolved instead.
REVIEWED_VALUES = {
    ("lp.registry.interfaces.distroseries.IDistroSeriesPublic", "changeslist"): {
        "schema": {"type": "string", "responseNullable": True},
        "semantics": "DistroSeries.changeslist is a nullable Storm Unicode column; the text marshaller returns its value unchanged without validating the input-only required flag",
        "evidence": {
            "lp.registry.interfaces.distroseries.IDistroSeriesPublic.changeslist": "0f5e89ca45e2e8c340260e8eaa0523974a4089758a40673b580100e63b88c034",
            "lp.registry.model.distroseries.DistroSeries.changeslist": "4b3b94dad66e8420de1af3d2f84268e05b3cd28c04c791960f4a1d4ef99aaee4",
            "lazr.restful.marshallers.TextFieldMarshaller": "0458f64c3b3230eadd7ee5ccb87f44831282b462036cfb1a861d31141ac8d91c",
            "lazr.restful.marshallers.SimpleFieldMarshaller.unmarshall": "0f93dcbc8156596f79bb8038315d9be57ed434d1d61476280ef2276eacf19f03",
            "lazr.restful._resource.FieldUnmarshallerMixin._unmarshallField": "9bb41267da098341521ae2448c935fb6122d6ae7f24603947bb77b071822e1d4",
        },
    },
    ("lp.registry.interfaces.distroseries.IDistroSeriesPublic", "datereleased"): {
        "schema": {"type": "string", "format": "date-time", "responseNullable": True},
        "semantics": "DistroSeries.datereleased is a nullable Storm DateTime column; the datetime marshaller explicitly returns None for None without validating the input-only required flag",
        "evidence": {
            "lp.registry.interfaces.distroseries.IDistroSeriesPublic.datereleased": "0b2cab2a76d024525eaaf302d6cbf02281e6f0bd9358fa852f9be9517bc4c0e2",
            "lp.registry.model.distroseries.DistroSeries.datereleased": "f7ffb3bd6627b78122809322f32220694ebddcf6d1444829afb76b35477df67f",
            "lazr.restful.marshallers.DateTimeFieldMarshaller.unmarshall": "a82d03cfdf12985fdd1a130c001a629eaae23c572d71d7992a0a1e1365922ed7",
            "lazr.restful._resource.FieldUnmarshallerMixin._unmarshallField": "9bb41267da098341521ae2448c935fb6122d6ae7f24603947bb77b071822e1d4",
        },
    },
    ("lp.registry.interfaces.location.IHasLocation", "time_zone"): {
        "schema": {"type": "string"},
        "semantics": "Person.time_zone returns 'UTC' or PersonLocation.time_zone, a non-null Storm Unicode column",
        "evidence": {
            "lp.registry.interfaces.location.IHasLocation.time_zone": "7a8347203c1de3a3cf7a6b72fb2040dc03db6b3df3749ab23bfd4436d2f04be8",
            "lp.registry.model.person.Person.time_zone": "f37c1c4f292dfcb468d5ce20caee8fa210a31b8ff86bde1201e60e636f85e5c5",
            "lp.registry.model.personlocation.PersonLocation.time_zone": "505c1d33aa45f17ffdd4f269f366bdba1c54680bd5664e92be6eeb1aca7452b7",
        },
    },
    ("lp.registry.interfaces.productseries.ITimelineProductSeries", "landmarks"): {
        "schema": {"type": "array", "items": {"type": "object", "additionalProperties": {"type": "string", "nullable": True}}},
        "semantics": "ProductSeries.getTimeline, the only TimelineProductSeries constructor call, stores dicts whose name, code_name, type, ISO date, and uri values are str or None",
        "evidence": {
            "lp.registry.interfaces.productseries.ITimelineProductSeries.landmarks": "25b9010c6086da3389967f637f4cf896390fd3fa1877e652938d2a8112c8cb82",
            "lp.registry.model.productseries.ProductSeries.getTimeline": "0d42e1d33e31a8036a546d6539c73929523c46d883d60d0b8d3055108271dde9",
            "lp.registry.model.productseries.TimelineProductSeries.__init__": "fc0194e07ae19112b47d50c9d0d8897703aa582d368abd9fe5af6a413ea48c37",
        },
    },
}


def literal(node):
    try:
        return ast.literal_eval(node)
    except (ValueError, TypeError):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "dict":
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
        self.dependencies = {}
        requirements = self.read_file(root / "requirements/combined.txt")
        current = self.read_file(root / "requirements/launchpad.txt")
        pins = dict(re.findall(r"^([\w.-]+)==([^\s]+)$", requirements + "\n" + current, re.M))
        for package in ("lazr.restful", "zope.schema", "zope.interface", "lazr.enum", "lazr.lifecycle"):
            version = pins.get(package)
            if version is None:
                raise ValueError("Missing pinned source dependency: " + package)
            archive = root / "download-cache/dist" / (package + "-" + version + ".tar.gz")
            data = archive.read_bytes()
            self.hashes[str(archive.relative_to(root))] = sha256(data).hexdigest()
            self.dependencies[package] = version
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
                        self.archive_modules[module] = (text, origin, relative.endswith("/__init__.py"))
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
                if element.get("provides") != "zope.schema.interfaces.IVocabularyFactory":
                    continue
                name = element.get("name")
                component = element.get("component")
                if name and component:
                    if component.startswith("."):
                        component = package + component
                    self.vocabulary_utilities.setdefault(name, set()).add(component)
            for element in document.iter():
                if element.tag == "{http://namespaces.canonical.com/webservice}register":
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
                self.json_publishers.append((interfaces or None, provides, node.get("factory")))

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
        tree = ast.parse(text, filename=origin)
        result = {"tree": tree, "symbols": {}, "origin": origin, "all": None, "text": text}
        self.modules[name] = result
        symbols = result["symbols"]
        for node in statements(tree.body):
            if isinstance(node, (ast.ClassDef, ast.FunctionDef)):
                symbols[node.name] = node
            elif isinstance(node, ast.ImportFrom):
                parent = name if package else name.rsplit(".", 1)[0]
                prefix = parent.split(".")[:len(parent.split(".")) - node.level + 1] if node.level else []
                imported = ".".join(prefix + ([node.module] if node.module else []))
                for alias in node.names:
                    if alias.name == "*":
                        other = self.module(imported)
                        if other:
                            for key in other["all"] or other["symbols"]:
                                if not key.startswith("_"):
                                    symbols[key] = imported + "." + key
                    else:
                        symbols[alias.asname or alias.name] = imported + "." + alias.name
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    symbols[alias.asname or alias.name.split(".")[0]] = alias.name if alias.asname else alias.name.split(".")[0]
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
            if qualified in seen or not isinstance(value, ast.expr) or "." not in qualified:
                return None
            return self.python3_condition(qualified.rsplit(".", 1)[0], value, seen + (qualified,))
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
                result.update(self.ancestry(self.reference(module, base), seen + (qualified,)))
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
        bases = [self.specification(self.reference(module, base), implementation) for base in node.bases]
        if not implementation:
            specification.__bases__ = tuple(bases)
            return specification
        inherited = {ancestor.name for base in bases for ancestor in self.ro(base, strict=False, log_changed_ro=False, use_legacy_ro=False)}
        declared = []
        for decorator in reversed(node.decorator_list):
            if isinstance(decorator, ast.Call) and self.resolve(self.reference(module, decorator.func)) in (
                "zope.interface.declarations.implementer",
                "zope.schema._field.implementer_if_needed",
            ):
                declared.extend(self.resolve(self.reference(module, argument)) for argument in decorator.args)
        # Bootstrapped schema classes receive classImplements declarations in
        # _field, after their original _bootstrapfields definitions.
        registration_modules = [module]
        if module == "zope.schema._bootstrapfields":
            registration_modules.append("zope.schema._field")
        registrations = []
        for owner in registration_modules:
            source = self.module(owner)
            for statement in statements(source["tree"].body):
                if not isinstance(statement, ast.Expr) or not isinstance(statement.value, ast.Call):
                    continue
                call = statement.value
                function = self.resolve(self.reference(owner, call.func))
                if function not in ("zope.interface.declarations.classImplements", "zope.interface.declarations.classImplementsFirst") or not call.args or self.resolve(self.reference(owner, call.args[0])) != qualified:
                    continue
                registrations.append((function, [self.resolve(self.reference(owner, argument)) for argument in call.args[1:]]))
        for function, interfaces in registrations:
            for interface in interfaces:
                if function.endswith("classImplementsFirst") or any(base in self.ancestry(interface) for base in declared):
                    declared.insert(0, interface)
                else:
                    declared.append(interface)
        declared = list(dict.fromkeys(interface for interface in declared if interface not in inherited))
        specification.__bases__ = tuple(self.specification(interface) for interface in declared) + tuple(bases)
        return specification

    def order(self, qualified, implementation=False):
        return [
            node.name for node in self.ro(
                self.specification(qualified, implementation),
                strict=False, log_changed_ro=False, use_legacy_ro=False,
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
                            result.setdefault(target.id, (module, statement.value, ancestor))
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
        if function in (DECLARATIONS + "exported", "lazr.lifecycle.snapshot.doNotSnapshot", "lazr.restful.interface.copy_field"):
            if not node.args:
                return None
            resolved = self.expression(module, node.args[0], fields, seen)
            if resolved and function == "lazr.restful.interface.copy_field":
                constructor, attrs, exports = resolved
                return constructor, {**attrs, **keywords}, exports
            if resolved and function == DECLARATIONS + "exported":
                constructor, attrs, exports = resolved
                names = []
                alias = literal(keywords["exported_as"][1]) if "exported_as" in keywords else None
                if alias is None or isinstance(alias, str):
                    names.append(alias)
                for annotation in node.args[1:]:
                    if isinstance(annotation, (ast.Tuple, ast.List)) and len(annotation.elts) == 2:
                        values = literal(annotation.elts[1])
                        if isinstance(values, dict) and values.get("exported", True) is not False:
                            alias = values.get("exported_as")
                            if alias is None or isinstance(alias, str):
                                names.append(alias)
                return constructor, attrs, names
            return resolved
        positional = self.bind_positional(function, [(module, argument) for argument in node.args])
        return function, {**positional, **keywords}, None

    def bind_positional(self, qualified, arguments, start=0, order=None):
        order = self.order(qualified) if order is None else order
        for index in range(start, len(order)):
            ancestor, node = self.definition(order[index])
            if not isinstance(node, ast.ClassDef):
                continue
            constructor = next((statement for statement in node.body if isinstance(statement, ast.FunctionDef) and statement.name == "__init__"), None)
            if constructor is None:
                continue
            parameters = (constructor.args.posonlyargs + constructor.args.args)[1:]
            attributes = {parameter.arg: argument for parameter, argument in zip(parameters, arguments)}
            remaining = arguments[len(parameters):]
            if not remaining or constructor.args.vararg is None:
                return attributes
            variable = constructor.args.vararg.arg
            if any(isinstance(part, ast.Name) and isinstance(part.ctx, ast.Store) and part.id == variable for part in ast.walk(constructor)):
                return attributes
            # Forward only an unchanged positional tuple to super().__init__.
            # Unknown/custom positional transformations remain unresolved.
            for part in ast.walk(constructor):
                if not isinstance(part, ast.Call) or not isinstance(part.func, ast.Attribute) or part.func.attr != "__init__":
                    continue
                receiver = part.func.value
                if not isinstance(receiver, ast.Call) or not isinstance(receiver.func, ast.Name) or receiver.func.id != "super":
                    continue
                if len(part.args) == 1 and isinstance(part.args[0], ast.Starred) and isinstance(part.args[0].value, ast.Name) and part.args[0].value.id == variable:
                    forwarded = self.bind_positional(qualified, remaining, index + 1, order)
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
                if isinstance(base, ast.Call) and self.reference(module, base.func) == "six.with_metaclass" and base.args:
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
            if isinstance(statement, ast.Assign) and any(isinstance(target, ast.Name) and target.id == name for target in statement.targets):
                return module, statement.value
        for base in node.bases:
            value = self.class_attribute(self.reference(module, base), name, seen + (qualified,))
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
            components = {self.resolve(component) for component in self.vocabulary_utilities.get(name, ())}
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
            returned = [statement.value for statement in ast.walk(definition) if isinstance(statement, ast.Return)]
            if returned and all(isinstance(value, ast.Call) for value in returned):
                classes = {self.resolve(self.reference(owner, value.func)) for value in returned}
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
        if any(isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store) and node.id == token for node in ast.walk(definition)):
            return False
        returned = [node.value for node in ast.walk(definition) if isinstance(node, ast.Return)]
        if not returned:
            return False
        for term in returned:
            if not isinstance(term, ast.Call) or self.resolve(self.reference(module, term.func)) != "zope.schema.vocabulary.SimpleTerm":
                return False
            value = term.args[0] if term.args else next((kw.value for kw in term.keywords if kw.arg == "value"), None)
            if isinstance(value, ast.Name) and value.id == token:
                continue
            if isinstance(value, ast.Constant) and isinstance(value.value, str):
                continue
            if isinstance(value, ast.Call) and isinstance(value.func, ast.Name) and value.func.id == "str" and "str" not in self.module(module)["symbols"]:
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
            if isinstance(call, ast.Call) and self.resolve(self.reference(module, call.func)) in decorator
            for argument in call.args
        ]

    def declares_implementation(self, interface, value_class):
        """Whether the interface's module calls classImplements(value_class, interface)."""
        module = interface.rsplit(".", 1)[0]
        source = self.module(module) if "." in interface else None
        if source is None:
            return False
        for statement in statements(source["tree"].body):
            if not isinstance(statement, ast.Expr) or not isinstance(statement.value, ast.Call):
                continue
            call = statement.value
            if not call.args or self.resolve(self.reference(module, call.func)) != "zope.interface.declarations.classImplements":
                continue
            arguments = [self.resolve(self.reference(module, argument)) for argument in call.args]
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
                if self.resolve(JSON_PUBLISHABLE) not in self.decorator_arguments(factory, ("zope.interface.declarations.implementer",)):
                    continue
                if interfaces is None:
                    interfaces = self.decorator_arguments(factory, ("zope.component.adapter", "zope.component._declaration.adapter"))
            if interfaces is None or len(interfaces) != 1:
                continue
            interface = self.resolve(interfaces[0])
            if interface in provided or self.declares_implementation(interface, value_class):
                factories.add(self.resolve(factory))
        if len(factories) != 1:
            return False
        method = self.method(factories.pop(), "toDataForJSON")
        if method is None:
            return False
        module, definition = method
        returned = [node.value for node in ast.walk(definition) if isinstance(node, ast.Return)]
        return (
            bool(returned)
            and "str" not in self.module(module)["symbols"]
            and all(isinstance(value, ast.Call) and isinstance(value.func, ast.Name) and value.func.id == "str" for value in returned)
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
                    if (isinstance(statement, (ast.ClassDef, ast.FunctionDef)) and statement.name == name)
                    or (isinstance(statement, ast.Assign) and any(isinstance(target, ast.Name) and target.id == name for target in statement.targets))
                ),
                None,
            )
            if node is None:
                return None
            body = node.body if isinstance(node, ast.ClassDef) else []
        start = min([node.lineno] + [decorator.lineno for decorator in getattr(node, "decorator_list", [])])
        lines = source["text"].splitlines()[start - 1:node.end_lineno]
        return sha256("\n".join(lines).encode()).hexdigest()

    def declared_nullable(self, constructor, attrs):
        required = attrs.get("required")
        missing = attrs.get("missing_value") or self.class_attribute(constructor, "missing_value")
        # Optional with the normal None missing value is the declared nullable
        # domain. Do not infer nullability from WADL presence or model samples.
        return bool(required and literal(required[1]) is False and missing is not None and literal(missing[1]) is None)

    def reviewed_value(self, interface, field, constructor, attrs, metadata):
        """Apply a still-current review; otherwise explain why it is not applied."""
        review = REVIEWED_VALUES.get((interface, field))
        if review is None or (metadata.get("type") and not review["schema"].get("responseNullable")):
            return None, None
        if review["schema"].get("responseNullable") and any(metadata.get(key) != review["schema"].get(key) for key in ("type", "format")):
            return None, "reviewed response marshaller type changed"
        changed = sorted(symbol for symbol, digest in review["evidence"].items() if self.definition_digest(symbol) != digest)
        if changed:
            return None, "reviewed value evidence changed: " + ", ".join(changed)
        result = json.loads(json.dumps(review["schema"]))
        if self.declared_nullable(constructor, attrs):
            result["nullable"] = True
        return result, None

    def schema(self, constructor, attrs):
        interfaces = [name for name in self.order(constructor, True) if not name.startswith("implements:")]
        candidates = [(self.resolve(ifaces[0]), factory) for ifaces, factory in self.adapters if len(ifaces) == 2 and self.resolve(ifaces[0]) in interfaces]
        winning_interface = next((interface for interface in interfaces if any(candidate == interface for candidate, _ in candidates)), None)
        factories = {factory for interface, factory in candidates if interface == winning_interface}
        vocabulary = None
        value_class = None
        if factories == {"lazr.restful.marshallers.VocabularyLookupFieldMarshaller"}:
            if "values" in attrs and "vocabulary" not in attrs:
                # Choice(values=...) builds SimpleVocabulary.fromValues(values),
                # whose terms keep the iterated values themselves.
                if not self.is_enumerated_type(attrs["values"]):
                    return {}, "", "dynamic or unsupported choice values"
                vocabulary = "zope.schema.vocabulary.SimpleVocabulary"
                value_class = ENUM_ITEM
            else:
                vocabulary = self.vocabulary(attrs.get("vocabulary"))
            if vocabulary is None:
                return {}, "", "dynamic or unsupported choice vocabulary"
            # Adapter lookup iterates argument __sro__ in order, not as an
            # unordered set of possible interfaces.
            provided = self.provided_order(vocabulary) or self.order(vocabulary, True)
            choices = []
            for ifaces, factory in self.adapters:
                if len(ifaces) != 3:
                    continue
                field_interface = self.resolve(ifaces[0])
                vocabulary_interface = self.resolve(ifaces[2])
                vocabulary_specification = "implements:" + vocabulary_interface if vocabulary_interface in self.ancestry(vocabulary) else vocabulary_interface
                if field_interface in interfaces and vocabulary_specification in provided:
                    choices.append(((interfaces.index(field_interface), provided.index(vocabulary_specification)), factory))
            best = min((rank for rank, _ in choices), default=None)
            factories = {factory for rank, factory in choices if rank == best}
        if len(factories) != 1:
            return {}, "", "unresolved or ambiguous marshaller"
        factory = factories.pop()
        name = factory.removeprefix("lazr.restful.marshallers.")
        if name == "TokenizedVocabularyFieldMarshaller":
            # unmarshall returns the stored term value for ResourceJSONEncoder.
            if value_class is not None:
                if not self.string_publisher(value_class):
                    return {}, "", "choice value serialization unresolved"
            elif vocabulary is None or not self.tokenized_value_is_string(vocabulary):
                return {}, "", "tokenized vocabulary value serialization unresolved"
            kind, format_, suffix = "string", None, ""
        elif name == "SimpleFieldMarshaller":
            # unmarshall returns the attribute unchanged; only a declared
            # value _type with a string IJSONPublishable adapter is known.
            declared = self.class_attribute(constructor, "_type")
            value_class = self.resolve(self.reference(*declared)) if declared else ""
            if not value_class or not self.string_publisher(value_class):
                return {}, "", "simple field value serialization unresolved"
            kind, format_, suffix = "string", None, ""
        elif name in MARSHALLERS:
            kind, format_, suffix = MARSHALLERS[name]
        else:
            return {}, "", "unsupported custom marshaller: " + factory
        result = {"type": kind}
        if format_:
            result["format"] = format_
        # Reference response serialization explicitly emits URL-or-None even
        # when required=True governs input validation, not response values.
        if name == "ObjectLookupFieldMarshaller":
            result["responseNullable"] = True
        if self.declared_nullable(constructor, attrs):
            result["nullable"] = True
        reason = None
        if kind in ("array", "object"):
            if kind == "array":
                result["items"] = {}
            child = attrs.get("value_type") or self.class_attribute(constructor, "value_type")
            if child and literal(child[1]) is not None:
                expression = self.expression(child[0], child[1], {})
                if expression:
                    nested, _, reason = self.schema(expression[0], expression[1])
                    if nested.get("type"):
                        result["items" if kind == "array" else "additionalProperties"] = nested
                else:
                    reason = "unsupported dynamic container value_type"
            else:
                reason = "container value_type not declared"
        return result, suffix, reason

    def export(self):
        resources = {}
        origins = {}
        registry = {}
        contributors = {}
        for module in sorted(self.registered_modules):
            source = self.module(module)
            if source is None:
                raise ValueError("Registered module unavailable: " + module)
            names = source["all"] or [name for name in source["symbols"] if not name.startswith("_")]
            for name in names:
                qualified, node = self.definition(module + "." + name)
                if not isinstance(node, ast.ClassDef):
                    continue
                owner = qualified.rsplit(".", 1)[0]
                for decorator in node.decorator_list:
                    if not isinstance(decorator, ast.Call) or self.resolve(self.reference(owner, decorator.func)) != DECLARATIONS + "exported_as_webservice_entry":
                        continue
                    keywords = {kw.arg: kw.value for kw in decorator.keywords if kw.arg}
                    contributes = keywords.get("contributes_to")
                    if contributes is not None:
                        if isinstance(contributes, (ast.Tuple, ast.List)):
                            for target in contributes.elts:
                                target_name = self.resolve(self.reference(owner, target))
                                contributors.setdefault(target_name, set()).add(qualified)
                        else:
                            self.unresolved.append({"interface": qualified, "reason": "dynamic contributes_to"})
                        continue
                    singular = literal(decorator.args[0]) if decorator.args else literal(keywords["singular_name"]) if "singular_name" in keywords else None
                    if singular is None:
                        # Exact naming contract in lazr.restful.utils, not a
                        # guess from a WADL/resource name.
                        singular = re.sub(r"\B([A-Z])", r"_\1", node.name[1:]).lower()
                    if not isinstance(singular, str):
                        self.unresolved.append({"interface": qualified, "reason": "dynamic exported resource name"})
                        continue
                    registry.setdefault(singular, set()).add(qualified)
        for resource, interfaces in sorted(registry.items()):
            output = {}
            declarations = {}
            conflicts = set()
            origins[resource] = {"interfaces": sorted(interfaces), "fields": {}}
            providers = set(interfaces)
            for interface in interfaces:
                providers.update(contributors.get(interface, ()))
            for provider in sorted(providers):
                fields = self.fields(provider)
                for field, (module, node, declaring) in sorted(fields.items()):
                    expression = self.expression(module, node, fields)
                    if not expression or expression[2] is None:
                        continue
                    constructor, attrs, aliases = expression
                    metadata, suffix, reason = self.schema(constructor, attrs)
                    reviewed = False
                    value, review_reason = self.reviewed_value(declaring, field, constructor, attrs, metadata)
                    if value is not None:
                        metadata, reason, reviewed = value, None, True
                        self.reviewed.add((declaring, field))
                    elif review_reason:
                        reason = review_reason
                    for alias in set(aliases):
                        wire = (alias or field) + suffix
                        provenance = {"interface": declaring, "field": field, "constructor": constructor, "source": self.module(module)["origin"], "line": node.lineno}
                        if reviewed:
                            provenance["reviewed"] = True
                        origins[resource]["fields"].setdefault(wire, []).append(provenance)
                        if wire in declarations and declarations[wire] != metadata:
                            conflicts.add(wire)
                            self.unresolved.append({"resource": resource, "field": wire, "reason": "conflicting serialized field declarations"})
                        declarations[wire] = metadata
                        if metadata.get("type"):
                            output[wire] = metadata
                        if reason:
                            self.unresolved.append({"resource": resource, "field": wire, "reason": reason, **provenance})
            for wire in conflicts:
                output.pop(wire, None)
            resources[resource] = dict(sorted(output.items()))
        return resources, origins


def main():
    metadata_directory = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )
    parser.add_argument(
        "launchpad",
        type=Path,
        nargs="?",
        default=metadata_directory.parents[3] / "launchpad",
        help="Launchpad checkout",
    )
    parser.add_argument(
        "--output", type=Path, default=metadata_directory, help="Generated catalog directory"
    )
    args = parser.parse_args()
    source = Source(args.launchpad.resolve())
    catalog, origins = source.export()
    redacted_attribute = source.class_attribute("lazr.restful._resource.FieldUnmarshallerMixin", "REDACTED_VALUE")
    if redacted_attribute is None:
        raise ValueError("Authoritative entry-field redaction constant is missing")
    redacted_value = literal(redacted_attribute[1])
    if not isinstance(redacted_value, str):
        raise ValueError("Authoritative entry-field redaction constant is not a string")
    stats = Counter(field["type"] for fields in catalog.values() for field in fields.values())
    source_digest = sha256(json.dumps(source.hashes, sort_keys=True).encode()).hexdigest()
    provenance = {
        "method": "conservative Python AST/import/interface and ZCML adapter extraction, plus digest-pinned reviews of serialized values interfaces leave undeclared or constrain only for input",
        "nullable_semantics": "declared required=False with None missing value accepts None for inputs and responses",
        "response_nullable_semantics": "reference marshaller or digest-pinned model/serializer review permits None in responses, independent of input validation",
        "redaction": {
            "value": redacted_value,
            "source": source.module(redacted_attribute[0])["origin"],
            "line": redacted_attribute[1].lineno,
            "semantics": "FieldUnmarshallerMixin._unmarshallField substitutes this exact string when field access or unmarshalling raises Unauthorized",
        },
        "dependency_versions": source.dependencies,
        "reviewed_values": [
            {"interface": interface, "field": field, **REVIEWED_VALUES[(interface, field)]}
            for interface, field in sorted(source.reviewed)
        ],
        "registered_modules": sorted(source.registered_modules),
        "vocabulary_utilities": {name: sorted(components) for name, components in sorted(source.vocabulary_utilities.items())},
        "source_sha256": dict(sorted(source.hashes.items())),
        "source_digest": source_digest,
        "resources": origins,
        "unresolved": sorted(source.unresolved, key=lambda value: json.dumps(value, sort_keys=True)),
        "statistics": {"resources": len(catalog), "fields": sum(map(len, catalog.values())), "types": dict(sorted(stats.items())), "unresolved": len(source.unresolved)},
    }
    args.output.mkdir(parents=True, exist_ok=True)
    header = "/*\n * Copyright 2026 Canonical Ltd.  This software is licensed under the\n * GNU Lesser General Public License version 3 (see the file LICENSE).\n */\n\n// Generated by export.py; source hashes and unresolved fields: provenance.json.\nimport type { SerializedFieldMetadata } from \"../types.js\";\n\nexport const REDACTED_FIELD_VALUE = " + json.dumps(redacted_value) + ";\n\n// prettier-ignore\nexport const RESOURCE_FIELD_METADATA: Readonly<\n  Record<string, Readonly<Record<string, SerializedFieldMetadata>>>\n> = "
    (args.output / "constants.ts").write_text(header + json.dumps(catalog, indent=2, sort_keys=True) + ";\n")
    (args.output / "provenance.json").write_text(json.dumps(provenance, indent=2, sort_keys=True) + "\n")
    print(json.dumps(provenance["statistics"], sort_keys=True))


if __name__ == "__main__":
    main()
