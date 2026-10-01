/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import type { ReviewedFields, RouteCorrection } from "./types.js";

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

/**
 * Canonical URL shapes from Launchpad's lp:url registrations and their
 * ICanonicalUrlData adapters. Examples annotate parameters; they are not
 * assertions that a particular instance exists on every Launchpad server.
 * Snapshot of the audited Launchpad source: 7597e2de89b60c90be1b11df5fe76a8f17c3ca2c.
 */
const DISTRO_SERIES_TEMPLATES = [
  "{distribution=ubuntu}/{series=resolute}",
  "{distribution=ubuntu}/+series/{series=resolute}",
] as const;
const EXTERNAL_PACKAGE_TYPES = [
  "unknown",
  "generic",
  "snap",
  "charm",
  "rock",
  "python",
  "conda",
  "cargo",
  "maven",
] as const;
// services/channels.py:23-68 requires a risk whenever a channel is present.
const EXTERNAL_PACKAGE_CHANNELS = [
  "",
  "/+risk/{risk=stable}",
  "/+track/{track=latest}/+risk/{risk=stable}",
  "/+risk/{risk=stable}/+branch/{branch=main}",
  "/+track/{track=latest}/+risk/{risk=stable}/+branch/{branch=main}",
] as const;

// registry/browser/externalpackage.py:123-150 and
// externalpackageseries.py:90-114; ExternalPackageType in
// registry/interfaces/externalpackage.py:81-150.
function externalPackageTemplates(parents: readonly string[]): string[] {
  return parents.flatMap((parent) =>
    EXTERNAL_PACKAGE_TYPES.flatMap((type) =>
      EXTERNAL_PACKAGE_CHANNELS.map(
        (channel) => `${parent}/+${type}/{package=firefox}${channel}`,
      ),
    ),
  );
}
// blueprints/browser/specificationbranch.py:27-43 embeds the branch
// unique_name without its leading '~'; code/model/branchnamespace.py:
// 311-314,359-362,425-428 and registry/model/sourcepackage.py:291-300.
const SPECIFICATION_TARGET_TEMPLATES = [
  "{project=launchpad}",
  "{distribution=ubuntu}",
  "{project=launchpad}/{series=trunk}",
  ...DISTRO_SERIES_TEMPLATES,
] as const;
const SPECIFICATION_BRANCH_NAMES = [
  "{branch_owner=launchpad}/+junk/{branch=example}",
  "{branch_owner=launchpad}/{branch_project=launchpad}/{branch=example}",
  "{branch_owner=launchpad}/{branch_distribution=ubuntu}/{branch_series=resolute}/{branch_source=bash}/{branch=example}",
] as const;
const ARCHIVE_TEMPLATES = [
  "{distribution=ubuntu}/+archive/{archive=primary}",
  "{owner=~launchpad}/+archive/{distribution=ubuntu}/{archive=ppa}",
] as const;

export const ROUTE_CORRECTIONS: Readonly<Record<string, RouteCorrection>> = {
  // app/browser/launchpad.py:886-930 stepto_utilities; the service-root
  // links are additive, but WADL collection IDs are not URL segments.
  archives: { templates: ["archives"] },
  // bugs/browser/configure.zcml:218-221,773-777,879-882.
  bugs: { templates: ["bugs"] },
  bug_trackers: { templates: ["bugs/bugtrackers"] },
  binarypackagenames: { templates: ["binarypackagenames"] },
  branches: { templates: ["branches"] },
  builders: { templates: ["builders"] },
  charm_bases: { templates: ["+charm-bases"] },
  charm_recipes: { templates: ["+charm-recipes"] },
  countries: { templates: ["+countries"] },
  craft_recipes: { templates: ["+craft-recipes"] },
  cves: { templates: ["bugs/cve"] },
  distros: { templates: ["distros"] },
  distributions: { templates: ["distros"] },
  git_repositories: { templates: ["+git"] },
  languages: { templates: ["+languages"] },
  livefses: { templates: ["livefses"] },
  package_sets: { templates: ["package-sets"] },
  packagesets: { templates: ["package-sets"] },
  people: { templates: ["people"] },
  pillars: { templates: ["pillars"] },
  polls: { templates: ["+polls"] },
  processors: { templates: ["+processors"] },
  projects: { templates: ["projects"] },
  projectgroups: { templates: ["projectgroups"] },
  project_groups: { templates: ["projectgroups"] },
  questions: { templates: ["questions"] },
  rock_bases: { templates: ["+rock-bases"] },
  rock_recipes: { templates: ["+rock-recipes"] },
  snap_bases: { templates: ["+snap-bases"] },
  snaps: { templates: ["+snaps"] },
  snappy_serieses: { templates: ["+snappy-series"] },
  sourcepackagenames: { templates: ["sourcepackagenames"] },
  specifications: { templates: ["specs"] },
  service_factory: { templates: ["+services"] },
  translation_import_queue_entries: { templates: ["+imports"] },
  translation_groups: { templates: ["+groups"] },
  temporary_blobs: { templates: ["temporary-blobs"] },
  vulnerabilities: { templates: ["vulnerabilities"] },

  // registry/browser/configure.zcml:549-552,1125-1129,1802-1805,
  // 2088-2091,2498-2549; distroseries.py:124-146 and
  // distributionsourcepackage.py:93-115 select by traversal policy.
  distribution: { templates: ["{distribution=ubuntu}"] },
  project: { templates: ["{project=launchpad}"] },
  project_group: { templates: ["{project_group=launchpad-project}"] },
  person: { templates: ["{person=~launchpad}"] },
  team: { templates: ["{team=~launchpad}"] },
  project_series: { parents: ["project"], suffix: "{series=trunk}" },
  distro_series: { templates: DISTRO_SERIES_TEMPLATES },
  distro_arch_series: {
    parents: ["distro_series"],
    suffix: "{arch=amd64}",
  },
  distribution_source_package: {
    templates: [
      "{distribution=ubuntu}/+source/{source=bash}",
      "{distribution=ubuntu}/{source=bash}",
    ],
  },
  source_package: {
    parents: ["distro_series"],
    suffix: "+source/{source=bash}",
  },
  oci_project: {
    // registry/browser/ociproject.py:69-96: product/distribution pillars;
    // bare distro child only under OCI_PROJECT traversal policy.
    templates: [
      "{distribution=ubuntu}/+oci/{oci_project=base}",
      "{project=launchpad}/+oci/{oci_project=base}",
      "{distribution=ubuntu}/{oci_project=base}",
    ],
  },
  oci_project_series: {
    // registry/browser/configure.zcml:759-762.
    parents: ["oci_project"],
    suffix: "+series/{series=resolute}",
  },
  external_package: {
    templates: externalPackageTemplates(["{distribution=ubuntu}"]),
  },
  external_package_series: {
    templates: externalPackageTemplates(DISTRO_SERIES_TEMPLATES),
  },
  archive_series: {
    // registry/browser/archiveseries.py:90-108.
    parents: ["archive"],
    suffix: "+series/{series=resolute}",
  },
  archive_source_package: {
    // registry/browser/archivesourcepackage.py:88-105.
    parents: ["archive"],
    suffix: "+source/{source=bash}",
  },
  archive_source_package_series: {
    // registry/browser/archivesourcepackageseries.py:95-113.
    parents: ["archive"],
    suffix: "+source/{source=bash}/{series=resolute}",
  },
  milestone: {
    // registry/browser/configure.zcml:1674-1678; milestone.target is a
    // pillar, not a series (registry/model/milestone.py:381-388).
    parents: ["project", "distribution", "project_group"],
    suffix: "+milestone/{milestone=1.0}",
  },
  project_group_milestone: {
    // registry/browser/configure.zcml:1680-1685.
    parents: ["project_group"],
    suffix: "+tags/{name=1.0}",
  },
  project_release: {
    // registry/browser/configure.zcml:2602-2606.
    parents: ["project_series"],
    suffix: "{version=1.0}",
  },
  project_release_file: {
    // registry/browser/configure.zcml:2607-2612.
    parents: ["project_release"],
    suffix: "+file/{filename=release.tar.gz}",
  },
  distro_series_difference: {
    // registry/browser/configure.zcml:263-268.
    parents: ["distro_series"],
    suffix:
      "+source/{source=bash}/+difference/{parent_distribution=ubuntu}/{parent_series=noble}",
  },
  distro_series_difference_comment: {
    // registry/browser/configure.zcml:284-289.
    parents: ["distro_series_difference"],
    suffix: "comments/{id=1}",
  },
  distribution_mirror: {
    // registry/browser/configure.zcml:2676-2680.
    parents: ["distribution"],
    suffix: "+mirror/{mirror=example}",
  },
  commercial_subscription: {
    // registry/browser/configure.zcml:795-799.
    parents: ["project", "distribution", "project_group"],
    suffix: "+commercialsubscription/{id=1}",
  },
  team_membership: {
    // registry/browser/configure.zcml:67-73.
    parents: ["team"],
    suffix: "+member/{member=launchpad}",
  },
  irc_id: {
    // registry/browser/configure.zcml:431-435.
    parents: ["person"],
    suffix: "+ircnick/{id=1}",
  },
  jabber_id: {
    // registry/browser/configure.zcml:800-804.
    parents: ["person"],
    suffix: "+jabberid/{jabberid=launchpad@jabber.org}",
  },
  social_account: {
    // registry/browser/configure.zcml:806-810, API-only.
    parents: ["person"],
    suffix: "+socialaccount/{id=1}",
  },
  poll: {
    // registry/browser/configure.zcml:916-920.
    parents: ["team"],
    suffix: "+poll/{poll=survey}",
  },
  ssh_key: {
    // registry/browser/configure.zcml:2812-2817, rootsite=api.
    parents: ["person"],
    suffix: "+ssh-keys/{id=1}",
  },
  gpg_key: {
    // registry/browser/configure.zcml:2818-2823, rootsite=api;
    // services/gpg/interfaces.py:43-53 requires 32 or 40 uppercase hex digits.
    parents: ["person"],
    suffix: "+gpg-keys/{fingerprint=0123456789ABCDEF0123456789ABCDEF01234567}",
  },
  wiki_name: {
    // registry/browser/configure.zcml:1778-1783, API-only.
    parents: ["person"],
    suffix: "+wikiname/{id=1}",
  },

  // bugs/browser/bug.py:1369-1382; browser/bugtask.py:299-314;
  // model/bugtask.py:195-317 enumerates exactly these 13 target types.
  bug: { templates: ["bugs/{id=1}"] },
  bug_task: {
    parents: [
      "project",
      "project_series",
      "distribution",
      "distro_series",
      "distribution_source_package",
      "source_package",
      "external_package",
      "external_package_series",
      "oci_project",
      "archive",
      "archive_series",
      "archive_source_package",
      "archive_source_package_series",
    ],
    suffix: "+bug/{id=1}",
  },
  cve: {
    // bugs/browser/configure.zcml:836-841,879-882.
    templates: ["bugs/cve/{cve=2014-0160}"],
  },
  vulnerability: {
    // bugs/browser/configure.zcml:883-886,915-919.
    parents: ["distribution"],
    suffix: "+vulnerability/{id=1}",
  },
  bug_activity: {
    // bugs/browser/configure.zcml:494-498.
    parents: ["bug"],
    suffix: "activity",
  },
  bug_attachment: {
    // bugs/browser/bugattachment.py:76-100: LaunchBag may select the
    // traversed task, otherwise the bug itself.
    parents: ["bug", "bug_task"],
    suffix: "+attachment/{attachment_id=1}",
  },
  bug_branch: {
    // bugs/browser/configure.zcml:808-812.
    parents: ["branch"],
    suffix: "+bug/{id=1}",
  },
  bug_nomination: {
    // bugs/browser/configure.zcml:1062-1066.
    parents: ["bug"],
    suffix: "nominations/{nomination_id=1}",
  },
  bug_subscription: {
    // bugs/browser/configure.zcml:940-944.
    parents: ["bug"],
    suffix: "+subscription/{subscriber=launchpad}",
  },
  structural_subscription: {
    // bugs/browser/configure.zcml:1138-1141; target implementations
    // are registry interfaces plus bugs/model/structuralsubscription.py.
    parents: [
      "project",
      "project_series",
      "project_group",
      "distribution",
      "distro_series",
      "distribution_source_package",
      "oci_project",
      "milestone",
    ],
    suffix: "+subscription/{subscriber=launchpad}",
  },
  bug_subscription_filter: {
    // bugs/browser/configure.zcml:1147-1151.
    parents: ["structural_subscription"],
    suffix: "+filter/{id=1}",
  },
  bug_watch: {
    // bugs/browser/configure.zcml:1067-1071.
    parents: ["bug"],
    suffix: "+watch/{watch_id=1}",
  },
  bug_tracker: {
    // bugs/browser/configure.zcml:723-727,773-777.
    templates: ["bugs/bugtrackers/{tracker=debian}"],
  },
  bug_tracker_component_group: {
    parents: ["bug_tracker"],
    suffix: "+components/{name=default}",
  },
  bug_tracker_component: {
    parents: ["bug_tracker_component_group"],
    suffix: "{component=default}",
  },

  // soyuz/browser/archive.py:192-233 registers distribution archives and
  // named PPAs separately; publishing.py:41-68 nests both publication kinds.
  archive: { templates: ARCHIVE_TEMPLATES },
  archive_permission: {
    // soyuz/browser/archivepermission.py:16-64 and archive.py:351-442.
    // The type/item selectors are required for traversal; series is
    // required for packagesets and optional for pocket permissions.
    templates: ARCHIVE_TEMPLATES.flatMap((archive) => [
      `${archive}/+upload/{user=launchpad}`,
      `${archive}/+queue-admin/{user=launchpad}`,
    ]),
    queryParameters: [
      {
        name: "type",
        in: "query",
        required: true,
        description: "Permission target type.",
        schema: {
          type: "string",
          enum: ["component", "packagename", "packageset", "pocket"],
          example: "component",
        },
      },
      {
        name: "item",
        in: "query",
        required: true,
        description: "Component, source package, package set, or pocket name.",
        schema: { type: "string", example: "main" },
      },
      {
        name: "series",
        in: "query",
        required: false,
        description:
          "Required for packagesets; optional for pocket permissions.",
        schema: { type: "string", example: "resolute" },
      },
    ],
  },
  source_package_publishing_history: {
    parents: ["archive"],
    suffix: "+sourcepub/{id=18325396}",
  },
  binary_package_publishing_history: {
    parents: ["archive"],
    suffix: "+binarypub/{id=1}",
  },
  build: {
    // soyuz/browser/build.py:79-110: primary builds use the source
    // package release; PPA/copy builds use their archive.
    templates: [
      "{distribution=ubuntu}/+source/{source=bash}/{version=1.0}/+build/{id=1}",
      "{distribution=ubuntu}/{source=bash}/{version=1.0}/+build/{id=1}",
    ],
    parents: ["archive"],
    suffix: "+build/{id=1}",
  },
  archive_dependency: {
    // soyuz/browser/configure.zcml:681-685; its parent is either an
    // archive or a snap base (soyuz/interfaces/archivedependency.py:39-63).
    parents: ["archive", "snap_base"],
    suffix: "+dependency/{id=1}",
  },
  archive_subscriber: {
    // soyuz/browser/configure.zcml:366-369.
    parents: ["archive"],
    suffix: "+subscriptions/{subscriber=launchpad}",
  },
  binary_package_release_download_count: {
    // soyuz/browser/configure.zcml:686-692.
    parents: ["archive"],
    suffix:
      "+binaryhits/{binary=bash}/{version=1.0}/{arch=amd64}/{day=2026-01-01}/{country=US}",
  },
  packageset: {
    // soyuz/browser/configure.zcml:648-662.
    templates: [
      "package-sets/{distribution=ubuntu}/{series=resolute}/{packageset=core}",
    ],
  },
  processor: {
    // buildmaster/browser/configure.zcml:12-22.
    templates: ["+processors/{processor=amd64}"],
  },
  builder: {
    // buildmaster/browser/configure.zcml:37-40,69-72.
    templates: ["builders/{builder=lcy02-amd64-001}"],
  },
  distro_arch_series_filter: {
    // soyuz/browser/configure.zcml:161-164.
    parents: ["distro_arch_series"],
    suffix: "+source-filter",
  },
  package_upload: {
    // soyuz/browser/configure.zcml:663-667.
    parents: ["distro_series"],
    suffix: "+upload/{id=1}",
  },
  package_upload_log: {
    // soyuz/browser/configure.zcml:672-675.
    parents: ["package_upload"],
    suffix: "+log/{log_id=1}",
  },
  livefs: {
    // soyuz/browser/configure.zcml:700-704.
    templates: [
      "{owner=~launchpad}/+livefs/{distribution=ubuntu}/{series=resolute}/{name=example}",
    ],
  },
  livefs_build: {
    // soyuz/browser/configure.zcml:760-764.
    parents: ["livefs"],
    suffix: "+build/{id=1}",
  },

  // code/browser/branch.py:119-134, model/branchnamespace.py:311-314,
  // 359-362,425-428; model/gitrepository.py:438-459 has four targets.
  branch: {
    templates: [
      "{owner=~launchpad}/+junk/{branch=example}",
      "{owner=~launchpad}/{project=launchpad}/{branch=example}",
      "{owner=~launchpad}/{distribution=ubuntu}/{series=resolute}/{source=bash}/{branch=example}",
    ],
  },
  git_repository: {
    templates: [
      "{owner=~launchpad}/+git/{repository=example}",
      "{owner=~launchpad}/{project=launchpad}/+git/{repository=launchpad}",
      "{owner=~launchpad}/{distribution=ubuntu}/+source/{source=bash}/+git/{repository=example}",
      "{owner=~launchpad}/{pillar=ubuntu}/+oci/{oci_project=base}/+git/{repository=example}",
    ],
  },
  // code/browser/configure.zcml:99-103,310-314,341-345,555-559,
  // 655-659,973-996,1063-1067,1162-1166,1289-1298,1429-1432.
  git_ref: { parents: ["git_repository"], suffix: "+ref/{ref=master}" },
  branch_merge_proposal: {
    parents: ["branch", "git_repository"],
    suffix: "+merge/{id=1}",
  },
  branch_subscription: {
    parents: ["branch"],
    suffix: "+subscription/{subscriber=launchpad}",
  },
  git_subscription: {
    parents: ["git_repository"],
    suffix: "+subscription/{subscriber=launchpad}",
  },
  code_import: {
    parents: ["branch", "git_repository"],
    suffix: "+code-import",
  },
  code_review_comment: {
    parents: ["branch_merge_proposal"],
    suffix: "comments/{comment_id=1}",
  },
  code_review_vote_reference: {
    parents: ["branch_merge_proposal"],
    suffix: "+review/{vote_id=1}",
  },
  preview_diff: {
    parents: ["branch_merge_proposal"],
    suffix: "+preview-diff/{diff_id=1}",
  },
  revision_status_report: {
    parents: ["git_repository"],
    suffix: "+status/{id=1}",
  },
  ci_build: {
    parents: ["git_repository"],
    suffix: "+build/{id=1}",
  },
  source_package_recipe: {
    parents: ["person"],
    suffix: "+recipe/{recipe=example}",
  },
  source_package_recipe_build: {
    parents: ["archive"],
    suffix: "+recipebuild/{id=1}",
  },

  // snappy/browser/snap.py:104-123; snappy/browser/configure.zcml:130-198.
  snap: {
    templates: [
      "{owner=~launchpad}/+snap/{snap=example}",
      "{owner=~launchpad}/{project=launchpad}/+snap/{snap=example}",
    ],
  },
  snap_build_request: { parents: ["snap"], suffix: "+build-request/{id=1}" },
  snap_build: { parents: ["snap"], suffix: "+build/{id=1}" },
  snap_base: { templates: ["+snap-bases/{base=core22}"] },
  snappy_series: { templates: ["+snappy-series/{series=16}"] },
  // oci/browser/configure.zcml:12-15,94-101,141-144; owner prefix from
  // registry/browser/configure.zcml:2788-2792.
  oci_recipe: {
    templates: [
      "{owner=~launchpad}/{pillar=ubuntu}/+oci/{oci_project=base}/+recipe/{recipe=example}",
    ],
  },
  oci_recipe_build_request: {
    parents: ["oci_recipe"],
    suffix: "+build-request/{id=1}",
  },
  oci_recipe_build: { parents: ["oci_recipe"], suffix: "+build/{id=1}" },
  oci_push_rule: { parents: ["oci_recipe"], suffix: "+push-rule/{id=1}" },
  // charms/browser/charmrecipe.py:76-93 and browser/configure.zcml:81-141.
  charm_recipe: {
    templates: [
      "{owner=~launchpad}/{project=launchpad}/+charm/{recipe=example}",
    ],
  },
  charm_recipe_build_request: {
    parents: ["charm_recipe"],
    suffix: "+build-request/{id=1}",
  },
  charm_recipe_build: {
    parents: ["charm_recipe"],
    suffix: "+build/{id=1}",
  },
  charm_base: { templates: ["+charm-bases/{id=1}"] },
  // crafts/browser/craftrecipe.py:21-38, browser/configure.zcml:12-29.
  craft_recipe: {
    templates: [
      "{owner=~launchpad}/{project=launchpad}/+craft/{recipe=example}",
    ],
  },
  craft_recipe_build_request: {
    parents: ["craft_recipe"],
    suffix: "+build-request/{id=1}",
  },
  craft_recipe_build: { parents: ["craft_recipe"], suffix: "+build/{id=1}" },
  // rocks/browser/configure.zcml:12-40,82-89; rockrecipe.py:21-38.
  rock_recipe: {
    templates: [
      "{owner=~launchpad}/{project=launchpad}/+rock/{recipe=example}",
    ],
  },
  rock_recipe_build_request: {
    parents: ["rock_recipe"],
    suffix: "+build-request/{id=1}",
  },
  rock_recipe_build: { parents: ["rock_recipe"], suffix: "+build/{id=1}" },
  rock_base: { templates: ["+rock-bases/{id=1}"] },

  // answers/browser/configure.zcml:134-146,262-265,346-350;
  // answers/configure.zcml:160-183 registers series/source-package adapters.
  question: {
    parents: [
      "project",
      "distribution",
      "distribution_source_package",
      "project_series",
      "distro_series",
      "source_package",
    ],
    suffix: "+question/{id=1}",
  },
  faq: {
    parents: [
      "project",
      "distribution",
      "distribution_source_package",
      "source_package",
    ],
    suffix: "+faq/{id=1}",
  },
  question_message: {
    parents: ["question"],
    suffix: "messages/{message=1}",
  },
  question_subscription: {
    parents: ["question"],
    suffix: "subscriptions/{subscriber=launchpad}",
  },
  // blueprints/browser/configure.zcml:203-205,226-228,250-254;
  // registry/tests/test_implements.py:51-70 lists target implementations.
  specification: {
    parents: ["project", "distribution", "project_series", "distro_series"],
    suffix: "+spec/{specification=example}",
  },
  specification_subscription: {
    parents: ["specification"],
    suffix: "+subscription/{subscriber=launchpad}",
  },
  specification_branch: {
    // blueprints/browser/specificationbranch.py:27-43: each specification
    // target can link to any of the three branch namespaces.
    templates: SPECIFICATION_TARGET_TEMPLATES.flatMap((target) =>
      SPECIFICATION_BRANCH_NAMES.map(
        (branch) => `${target}/+spec/{specification=example}/+branch/${branch}`,
      ),
    ),
  },

  // translations/browser/potemplate.py:877-925; configure.zcml:131-163,
  // 102-121,255-290,388-434.
  translation_template: {
    parents: ["source_package", "project_series"],
    suffix: "+pots/{template=launchpad}",
  },
  translation_file: {
    parents: ["translation_template"],
    suffix: "{language=en}",
  },
  translation_group: { templates: ["+groups/{group=launchpad-translators}"] },
  translation_import_queue_entry: { templates: ["+imports/{id=1}"] },
  distro_series_language: {
    parents: ["distro_series"],
    suffix: "+lang/{language=en}",
  },
  language: { templates: ["+languages/{language=en}"] },
  country: {
    // services/worlddata/browser/configure.zcml:12-22.
    templates: ["+countries/{country=US}"],
  },
  message_revision: {
    // services/messages/browser/configure.zcml:6-9; the in-scope
    // message_implementation is the question message.
    parents: ["question_message"],
    suffix: "revisions/{revision=1}",
  },

  // services/auth/configure.zcml:31-34; its target implementations are
  // registry/interfaces/product.py:613 and code/interfaces/gitrepository.py:135.
  access_token: {
    parents: ["project", "git_repository"],
    suffix: "+access-token/{id=1}",
  },
  registered_authenticator: {
    // services/webauthn/configure.zcml:32-36, API-only.
    parents: ["person"],
    suffix: "+authenticator/{id=1}",
  },
  email_address: {
    // services/identity/configure.zcml:41-45, API-only.
    parents: ["person"],
    suffix: "+email/{email=mark@canonical.com}",
  },
  temporary_blob: {
    // services/temporaryblobstorage/browser.py:74-87.
    templates: ["temporary-blobs/{uuid=00000000-0000-4000-8000-000000000001}"],
  },
  webhook: {
    // services/webhooks/configure.zcml:72-84; IWebhookTarget is
    // implemented by these interfaces across code, registry, Soyuz,
    // snappy, charms, OCI, and livefs.
    parents: [
      "branch",
      "git_repository",
      "project",
      "distribution",
      "distribution_source_package",
      "archive",
      "snap",
      "charm_recipe",
      "oci_recipe",
      "livefs",
    ],
    suffix: "+webhook/{id=1}",
  },
  webhook_delivery: {
    parents: ["webhook"],
    suffix: "+delivery/{job_id=1}",
  },
  sharing_service: {
    // registry/services/sharingservice.py:89-100 and
    // registry/browser/configure.zcml:36-44.
    templates: ["+services/sharing"],
  },
};

/** Exported interface/value markers with no independent canonical URL. */
export const ROUTELESS_RESOURCE_TYPES: Readonly<Record<string, true>> = {
  // services/webservice/wadl-to-refhtml.xsl:164-181 labels these as
  // "depends on the underlying entry".
  access_token_target: true,
  bug_link_target: true,
  bug_target: true,
  faq_target: true,
  git_target: true,
  has_bugs: true,
  has_milestones: true,
  object_with_translation_imports: true,
  question_target: true,
  specification_target: true,
  structural_subscription_target: true,
  // The other polymorphic base interfaces similarly have no independent
  // lp:url; their concrete entries own the paths.
  build_farm_job: true,
  message: true,
  pillar: true,
  webhook_target: true,
  // cvereference.py defines an unexported value interface with no URL;
  // timeline_project_series is a projection of project_series, and its
  // own ZCML notes that traversal returns a project_series instead.
  cve_reference: true,
  timeline_project_series: true,
};

/** lazr.restful resource types that do not become ordinary API paths. */
export const SPECIAL_RESOURCE_TYPES: ReadonlySet<string> = new Set([
  "service-root",
  "HostedFile",
  "ScalarValue",
]);

/**
 * Observed branch operation contracts missing from WADL. Keep overrides
 * operation-scoped; other branch responses and parameters retain WADL behavior.
 */
export const REVIEWED_NAMED_OPERATIONS: Record<
  string,
  {
    repeatedQueryParams?: readonly string[];
    nullableResponse?: string;
    nullableMapValues?: string;
  }
> = {
  "branches-getByPath": { nullableResponse: "branch-full" },
  "branches-getByUrls": {
    repeatedQueryParams: ["urls"],
    nullableMapValues: "branch-full",
  },
};

/**
 * Observed response-field contracts missing or misrepresented in Launchpad's WADL.
 * Keys are representation IDs, not resource types: diff/write representations
 * have independent contracts. Null-only observations establish nullability,
 * but not a non-null type; buildSchemas retains a type only when WADL supplies it.
 */
export const REVIEWED_RESOURCE_FIELDS: Record<string, ReviewedFields> = {
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
  "branch-full": {
    nullable: ["code_import_link", "sourcepackage_link"],
    enumCorrections: {
      branch_format: [
        "Bazaar Branch Format 7 (needs bzr 1.6) ",
        "Bazaar Branch Format 7 (needs bzr 1.6)\n",
      ],
      control_format: [
        "Bazaar-NG meta directory, format 1 ",
        "Bazaar-NG meta directory, format 1\n",
      ],
      repository_format: [
        "Bazaar repository format 2a (needs bzr 1.16 or later) ",
        "Bazaar repository format 2a (needs bzr 1.16 or later)\n",
      ],
    },
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
  "their source-backed root paths; instance URLs are represented by " +
  "source-backed templates (for example, `/ubuntu/+archive/{archive}`), " +
  "which may vary by resource and server-side traversal policy. Named " +
  "operations are invoked with a `ws.op` argument on the " +
  "resource URL, and each is exposed here as its own endpoint keyed by that " +
  "value (e.g. `/people?ws.op=find`) so it carries its own parameters and " +
  "response schema. Parameter examples are placeholders.";
