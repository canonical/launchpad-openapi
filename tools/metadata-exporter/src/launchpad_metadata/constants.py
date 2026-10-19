# Copyright 2026 Canonical Ltd.  This software is licensed under the
# GNU Lesser General Public License version 3 (see the file LICENSE).
"""Source-qualified contracts of understood declarations and marshallers."""

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
