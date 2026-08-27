/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

/** Fixed protocol values and curated examples shared by OpenAPI builders. */

export const OPENAPI_VERSION = "3.0.3";
export const API_TITLE = "Launchpad Web Service API";
export const JSON_MEDIA_TYPE = "application/json";
export const FORM_MEDIA_TYPE = "application/x-www-form-urlencoded";
export const SERVICE_ROOT_TYPE = "service-root";
export const SERVICE_ROOT_REPRESENTATION = "service-root-json";
export const PAGE_RESOURCE_SUFFIX = "-page-resource";
export const ABOUT_SERVICE_DOC = "About this service";
export const ENTRY_SELF_LINK_PATH = "$['entries'][*]['self_link']";
export const COLLECTION_LINK_SUFFIXES = ["_collection_link", "_link"] as const;
export const HTTP_METHODS = ["get", "put", "post", "patch", "delete"] as const;

export const EXAMPLE_BY_PARAM: Record<string, string> = {
  name: "ubuntu",
  text: "ubuntu",
  email: "mark@canonical.com",
  unique_name: "~launchpad/launchpad/master",
  url: "https://git.launchpad.net/launchpad",
  distribution: "ubuntu",
  distro_series: "noble",
  distroseries: "noble",
  distro_arch_series: "amd64",
  source_name: "bash",
  sourcepackagename: "bash",
  base_url: "https://bugzilla.debian.com/",
  owner: "~launchpad",
  person: "~launchpad",
  project: "launchpad",
  target: "launchpad",
  id: "1",
  question_id: "1",
  bug_id: "1",
  name_or_version: "resolute",
};

/** Curated paths whose `{name=default}` segments become editable variables. */
export const EXAMPLE_BY_RESOURCE: Record<string, string> = {
  distribution: "{distribution=ubuntu}",
  project: "{project=launchpad}",
  project_group: "{project_group=launchpad-project}",
  project_series: "{project=launchpad}/{series=trunk}",
  team: "{team=~launchpad}",
  distro_series: "{distribution=ubuntu}/{series=resolute}",
  distro_arch_series: "{distribution=ubuntu}/{series=resolute}/{arch=amd64}",
  archive: "{distribution=ubuntu}/+archive/{archive=primary}",
  distribution_source_package: "{distribution=ubuntu}/+source/{source=bash}",
  source_package: "{distribution=ubuntu}/{series=resolute}/+source/{source=bash}",
  packageset:
    "package-sets/{distribution=ubuntu}/{series=resolute}/{packageset=core}",
  processor: "+processors/{processor=amd64}",
  bug: "bugs/{id=1}",
  cve: "bugs/cve/{cve=2014-0160}",
  git_repository:
    "{owner=~launchpad}/{project=launchpad}/+git/{repository=launchpad}",
  git_ref:
    "{owner=~launchpad}/{project=launchpad}/+git/{repository=launchpad}/+ref/{ref=master}",
  source_package_publishing_history:
    "{distribution=ubuntu}/+archive/{archive=primary}/+sourcepub/{id=18325396}",
};

/** lazr.restful resource types that do not become ordinary API paths. */
export const SPECIAL_RESOURCE_TYPES: ReadonlySet<string> = new Set([
  "service-root",
  "HostedFile",
  "ScalarValue",
]);

export const INTEGER_PARAM_NAMES: ReadonlySet<string> = new Set([
  "total_size",
  "start",
]);

export const HYPERMEDIA_NOTE =
  "Generated from the Launchpad WADL description. Launchpad exposes a " +
  "hypermedia web service: resource URLs are discovered at runtime from the " +
  "service root and from links in other resources. Top-level collections use " +
  "their real service-root URLs; other resource types are shown at a real " +
  "example instance URL (e.g. `/ubuntu/+archive/primary`) so requests resolve " +
  "as sent. Named operations are invoked with a `ws.op` argument on the " +
  "resource URL, and each is exposed here as its own endpoint keyed by that " +
  "value (e.g. `/people?ws.op=find`) so it carries its own parameters and " +
  "response schema. Parameter examples are placeholders.";
