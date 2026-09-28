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
export const BRANCH_FULL_SCHEMA_ID = "branch-full";
export const NULLABLE_BRANCH_SCHEMA_ID = "branch-full-nullable";
export const COLLECTION_LINK_SUFFIXES = ["_collection_link", "_link"] as const;
export const HTTP_METHODS = ["get", "put", "post", "patch", "delete"] as const;
export type SupportedHttpMethod = (typeof HTTP_METHODS)[number];

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

/** Curated paths whose `{name=example}` segments define required path parameters with examples. */
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
  source_package:
    "{distribution=ubuntu}/{series=resolute}/+source/{source=bash}",
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

/**
 * Observed response-field contracts absent from Launchpad's WADL.
 *
 * Keys are representation IDs, not resource types: diff/write representations
 * have independent contracts. Null-only observations establish nullability,
 * but not a non-null type; buildSchemas retains a type only when WADL supplies it.
 */
export const REVIEWED_RESOURCE_FIELDS: Record<
  string,
  {
    integer?: readonly string[];
    boolean?: readonly string[];
    stringArray?: readonly string[];
    object?: readonly string[];
    nullable?: readonly string[];
  }
> = {
  "bug-full": {
    integer: [
      "id",
      "heat",
      "number_of_duplicates",
      "message_count",
      "users_affected_count",
      "users_unaffected_count",
      "users_affected_count_with_dupes",
      "other_users_affected_count_with_dupes",
    ],
    boolean: ["private", "security_related"],
    stringArray: ["tags"],
    nullable: [
      "duplicate_of_link",
      "who_made_private_link",
      "date_made_private",
      "latest_patch_uploaded",
      "lock_reason",
    ],
  },
  "project-full": {
    boolean: [
      "active",
      "commercial_subscription_is_due",
      "official_answers",
      "official_blueprints",
      "official_bugs",
      "official_codehosting",
      "private",
      "qualifies_for_free_hosting",
    ],
    stringArray: ["licenses", "official_bug_tags"],
    object: ["content_templates"],
    nullable: [
      "bug_tracker_link",
      "download_url",
      "driver_link",
      "freshmeat_project",
      "homepage_url",
      "remote_product",
      "screenshots_url",
      "sourceforge_project",
      "translation_focus_link",
      "translationgroup_link",
    ],
  },
  "distribution-full": {
    boolean: [
      "active",
      "commercial_subscription_is_due",
      "official_answers",
      "official_blueprints",
      "official_bugs",
      "official_codehosting",
      "official_packages",
      "private",
      "redirect_default_traversal",
      "redirect_release_uploads",
      "supports_mirrors",
      "supports_ppas",
    ],
    stringArray: ["official_bug_tags"],
    nullable: [
      "commercial_subscription_link",
      "content_templates",
      "homepage_content",
      "oci_project_admin_link",
    ],
  },
  "team-full": {
    integer: ["default_membership_period", "karma"],
    boolean: [
      "hide_email_addresses",
      "is_probationary",
      "is_team",
      "is_ubuntu_coc_signer",
      "is_valid",
      "private",
    ],
    nullable: [
      "default_renewal_period",
      "homepage_content",
      "preferred_email_address_link",
    ],
  },
  "archive-full": {
    integer: ["relative_build_score"],
    boolean: [
      "build_debug_symbols",
      "permit_obsolete_series_uploads",
      "private",
      "publish",
      "publish_debug_symbols",
      "require_virtualized",
      "suppress_subscription_notifications",
    ],
    stringArray: ["official_bug_tags"],
    nullable: [
      "authorized_size",
      "bug_reported_acknowledgement",
      "bug_reporting_guidelines",
      "content_templates",
      "external_dependencies",
      "metadata_overrides",
      "signing_key_fingerprint",
    ],
  },
  "git_repository-full": {
    integer: ["id", "loose_object_count", "pack_count"],
    boolean: ["owner_default", "private", "target_default"],
    nullable: ["builder_constraints", "code_import_link", "description"],
  },
  "bug_task-full": {
    boolean: ["is_complete"],
    nullable: [
      "assignee_link",
      "bug_watch_link",
      "date_assigned",
      "date_closed",
      "date_deferred",
      "date_fix_released",
      "date_incomplete",
      "date_left_new",
      "importance_explanation",
      "milestone_link",
      "status_explanation",
    ],
  },
};

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
