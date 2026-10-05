/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

import type { RouteCorrection, RouteTemplate } from "./types.js";

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
  {
    template: "{distribution=ubuntu}/{series=resolute}",
    operationSuffix: "series",
  },
  {
    template: "{distribution=ubuntu}/+series/{series=resolute}",
    operationSuffix: "explicit-series",
  },
] as const;
const EXTERNAL_PACKAGE_TYPES = [
  { template: "unknown", operationSuffix: "unknown" },
  { template: "generic", operationSuffix: "generic" },
  { template: "snap", operationSuffix: "snap" },
  { template: "charm", operationSuffix: "charm" },
  { template: "rock", operationSuffix: "rock" },
  { template: "python", operationSuffix: "python" },
  { template: "conda", operationSuffix: "conda" },
  { template: "cargo", operationSuffix: "cargo" },
  { template: "maven", operationSuffix: "maven" },
] as const;
// services/channels.py:23-68 requires a risk whenever a channel is present.
const EXTERNAL_PACKAGE_CHANNELS = [
  { template: "", operationSuffix: "unchanneled" },
  { template: "/+risk/{risk=stable}", operationSuffix: "risk" },
  {
    template: "/+track/{track=latest}/+risk/{risk=stable}",
    operationSuffix: "track-risk",
  },
  {
    template: "/+risk/{risk=stable}/+branch/{branch=main}",
    operationSuffix: "risk-branch",
  },
  {
    template:
      "/+track/{track=latest}/+risk/{risk=stable}/+branch/{branch=main}",
    operationSuffix: "track-risk-branch",
  },
] as const;

// registry/browser/externalpackage.py:123-150 and
// externalpackageseries.py:90-114; ExternalPackageType in
// registry/interfaces/externalpackage.py:81-150.
function externalPackageTemplates(
  parents: readonly { template: string; operationSuffix: string }[],
): RouteTemplate[] {
  return parents.flatMap((parent) =>
    EXTERNAL_PACKAGE_TYPES.flatMap((type) =>
      EXTERNAL_PACKAGE_CHANNELS.map((channel) => ({
        template: `${parent.template}/+${type.template}/{package=firefox}${channel.template}`,
        operationSuffix: `${parent.operationSuffix}-${type.operationSuffix}-${channel.operationSuffix}`,
      })),
    ),
  );
}
// blueprints/browser/specificationbranch.py:27-43 embeds the branch
// unique_name without its leading '~'; code/model/branchnamespace.py:
// 311-314,359-362,425-428 and registry/model/sourcepackage.py:291-300.
const SPECIFICATION_TARGET_TEMPLATES = [
  { template: "{project=launchpad}", operationSuffix: "project" },
  { template: "{distribution=ubuntu}", operationSuffix: "distribution" },
  {
    template: "{project=launchpad}/{series=trunk}",
    operationSuffix: "project-series",
  },
  ...DISTRO_SERIES_TEMPLATES.map((series) => ({
    template: series.template,
    operationSuffix: `distro-series-${series.operationSuffix}`,
  })),
] as const;
const SPECIFICATION_BRANCH_NAMES = [
  {
    template: "{branch_owner=launchpad}/+junk/{branch=example}",
    operationSuffix: "personal",
  },
  {
    template:
      "{branch_owner=launchpad}/{branch_project=launchpad}/{branch=example}",
    operationSuffix: "project",
  },
  {
    template:
      "{branch_owner=launchpad}/{branch_distribution=ubuntu}/{branch_series=resolute}/{branch_source=bash}/{branch=example}",
    operationSuffix: "source-package",
  },
] as const;
const ARCHIVE_TEMPLATES = [
  {
    template: "{distribution=ubuntu}/+archive/{archive=primary}",
    operationSuffix: "distribution",
  },
  {
    template: "{owner=~launchpad}/+archive/{distribution=ubuntu}/{archive=ppa}",
    operationSuffix: "ppa",
  },
] as const;

export const ROUTE_CORRECTIONS: Readonly<Record<string, RouteCorrection>> = {
  // app/browser/launchpad.py:886-930 stepto_utilities; the service-root
  // links are additive, but WADL collection IDs are not URL segments.
  archives: { templates: [{ template: "archives" }] },
  // bugs/browser/configure.zcml:218-221,773-777,879-882.
  bugs: { templates: [{ template: "bugs" }] },
  bug_trackers: { templates: [{ template: "bugs/bugtrackers" }] },
  binarypackagenames: { templates: [{ template: "binarypackagenames" }] },
  branches: { templates: [{ template: "branches" }] },
  builders: { templates: [{ template: "builders" }] },
  charm_bases: { templates: [{ template: "+charm-bases" }] },
  charm_recipes: { templates: [{ template: "+charm-recipes" }] },
  countries: { templates: [{ template: "+countries" }] },
  craft_recipes: { templates: [{ template: "+craft-recipes" }] },
  cves: { templates: [{ template: "bugs/cve" }] },
  distros: { templates: [{ template: "distros" }] },
  distributions: { templates: [{ template: "distros" }] },
  git_repositories: { templates: [{ template: "+git" }] },
  languages: { templates: [{ template: "+languages" }] },
  livefses: { templates: [{ template: "livefses" }] },
  package_sets: { templates: [{ template: "package-sets" }] },
  packagesets: { templates: [{ template: "package-sets" }] },
  people: { templates: [{ template: "people" }] },
  pillars: { templates: [{ template: "pillars" }] },
  polls: { templates: [{ template: "+polls" }] },
  processors: { templates: [{ template: "+processors" }] },
  projects: { templates: [{ template: "projects" }] },
  projectgroups: { templates: [{ template: "projectgroups" }] },
  project_groups: { templates: [{ template: "projectgroups" }] },
  questions: { templates: [{ template: "questions" }] },
  rock_bases: { templates: [{ template: "+rock-bases" }] },
  rock_recipes: { templates: [{ template: "+rock-recipes" }] },
  snap_bases: { templates: [{ template: "+snap-bases" }] },
  snaps: { templates: [{ template: "+snaps" }] },
  snappy_serieses: { templates: [{ template: "+snappy-series" }] },
  sourcepackagenames: { templates: [{ template: "sourcepackagenames" }] },
  specifications: { templates: [{ template: "specs" }] },
  service_factory: { templates: [{ template: "+services" }] },
  translation_import_queue_entries: { templates: [{ template: "+imports" }] },
  translation_groups: { templates: [{ template: "+groups" }] },
  temporary_blobs: { templates: [{ template: "temporary-blobs" }] },
  vulnerabilities: { templates: [{ template: "vulnerabilities" }] },

  // registry/browser/configure.zcml:549-552,1125-1129,1802-1805,
  // 2088-2091,2498-2549; distroseries.py:124-146 and
  // distributionsourcepackage.py:93-115 select by traversal policy.
  distribution: { templates: [{ template: "{distribution=ubuntu}" }] },
  project: { templates: [{ template: "{project=launchpad}" }] },
  project_group: {
    templates: [{ template: "{project_group=launchpad-project}" }],
  },
  person: { templates: [{ template: "{person=~launchpad}" }] },
  team: { templates: [{ template: "{team=~launchpad}" }] },
  project_series: {
    parents: [{ resourceType: "project" }],
    suffix: "{series=trunk}",
  },
  distro_series: { templates: DISTRO_SERIES_TEMPLATES },
  distro_arch_series: {
    parents: [{ resourceType: "distro_series" }],
    suffix: "{arch=amd64}",
  },
  distribution_source_package: {
    templates: [
      {
        template: "{distribution=ubuntu}/+source/{source=bash}",
        operationSuffix: "source",
      },
      {
        template: "{distribution=ubuntu}/{source=bash}",
        operationSuffix: "bare-source",
      },
    ],
  },
  source_package: {
    parents: [{ resourceType: "distro_series" }],
    suffix: "+source/{source=bash}",
  },
  oci_project: {
    // registry/browser/ociproject.py:69-96: product/distribution pillars;
    // bare distro child only under OCI_PROJECT traversal policy.
    templates: [
      {
        template: "{distribution=ubuntu}/+oci/{oci_project=base}",
        operationSuffix: "distribution",
      },
      {
        template: "{project=launchpad}/+oci/{oci_project=base}",
        operationSuffix: "project",
      },
      {
        template: "{distribution=ubuntu}/{oci_project=base}",
        operationSuffix: "bare-distribution",
      },
    ],
  },
  oci_project_series: {
    // registry/browser/configure.zcml:759-762.
    parents: [{ resourceType: "oci_project" }],
    suffix: "+series/{series=resolute}",
  },
  external_package: {
    templates: externalPackageTemplates([
      { template: "{distribution=ubuntu}", operationSuffix: "distribution" },
    ]),
  },
  external_package_series: {
    templates: externalPackageTemplates(DISTRO_SERIES_TEMPLATES),
  },
  archive_series: {
    // registry/browser/archiveseries.py:90-108.
    parents: [{ resourceType: "archive" }],
    suffix: "+series/{series=resolute}",
  },
  archive_source_package: {
    // registry/browser/archivesourcepackage.py:88-105.
    parents: [{ resourceType: "archive" }],
    suffix: "+source/{source=bash}",
  },
  archive_source_package_series: {
    // registry/browser/archivesourcepackageseries.py:95-113.
    parents: [{ resourceType: "archive" }],
    suffix: "+source/{source=bash}/{series=resolute}",
  },
  milestone: {
    // registry/browser/configure.zcml:1674-1678; milestone.target is a
    // pillar, not a series (registry/model/milestone.py:381-388).
    parents: [
      { resourceType: "project", operationSuffixPrefix: "project" },
      { resourceType: "distribution", operationSuffixPrefix: "distribution" },
      { resourceType: "project_group", operationSuffixPrefix: "project-group" },
    ],
    suffix: "+milestone/{milestone=1.0}",
  },
  project_group_milestone: {
    // registry/browser/configure.zcml:1680-1685.
    parents: [{ resourceType: "project_group" }],
    suffix: "+tags/{name=1.0}",
  },
  project_release: {
    // registry/browser/configure.zcml:2602-2606.
    parents: [{ resourceType: "project_series" }],
    suffix: "{version=1.0}",
  },
  project_release_file: {
    // registry/browser/configure.zcml:2607-2612.
    parents: [{ resourceType: "project_release" }],
    suffix: "+file/{filename=release.tar.gz}",
  },
  distro_series_difference: {
    // registry/browser/configure.zcml:263-268.
    parents: [{ resourceType: "distro_series" }],
    suffix:
      "+source/{source=bash}/+difference/{parent_distribution=ubuntu}/{parent_series=noble}",
  },
  distro_series_difference_comment: {
    // registry/browser/configure.zcml:284-289.
    parents: [{ resourceType: "distro_series_difference" }],
    suffix: "comments/{id=1}",
  },
  distribution_mirror: {
    // registry/browser/configure.zcml:2676-2680.
    parents: [{ resourceType: "distribution" }],
    suffix: "+mirror/{mirror=example}",
  },
  commercial_subscription: {
    // registry/browser/configure.zcml:795-799.
    parents: [
      { resourceType: "project", operationSuffixPrefix: "project" },
      { resourceType: "distribution", operationSuffixPrefix: "distribution" },
      { resourceType: "project_group", operationSuffixPrefix: "project-group" },
    ],
    suffix: "+commercialsubscription/{id=1}",
  },
  team_membership: {
    // registry/browser/configure.zcml:67-73.
    parents: [{ resourceType: "team" }],
    suffix: "+member/{member=launchpad}",
  },
  irc_id: {
    // registry/browser/configure.zcml:431-435.
    parents: [{ resourceType: "person" }],
    suffix: "+ircnick/{id=1}",
  },
  jabber_id: {
    // registry/browser/configure.zcml:800-804.
    parents: [{ resourceType: "person" }],
    suffix: "+jabberid/{jabberid=launchpad@jabber.org}",
  },
  social_account: {
    // registry/browser/configure.zcml:806-810, API-only.
    parents: [{ resourceType: "person" }],
    suffix: "+socialaccount/{id=1}",
  },
  poll: {
    // registry/browser/configure.zcml:916-920.
    parents: [{ resourceType: "team" }],
    suffix: "+poll/{poll=survey}",
  },
  ssh_key: {
    // registry/browser/configure.zcml:2812-2817, rootsite=api.
    parents: [{ resourceType: "person" }],
    suffix: "+ssh-keys/{id=1}",
  },
  gpg_key: {
    // registry/browser/configure.zcml:2818-2823, rootsite=api;
    // services/gpg/interfaces.py:43-53 requires 32 or 40 uppercase hex digits.
    parents: [{ resourceType: "person" }],
    suffix: "+gpg-keys/{fingerprint=0123456789ABCDEF0123456789ABCDEF01234567}",
  },
  wiki_name: {
    // registry/browser/configure.zcml:1778-1783, API-only.
    parents: [{ resourceType: "person" }],
    suffix: "+wikiname/{id=1}",
  },

  // bugs/browser/bug.py:1369-1382; browser/bugtask.py:299-314;
  // model/bugtask.py:195-317 enumerates exactly these 13 target types.
  bug: { templates: [{ template: "bugs/{id=1}" }] },
  bug_task: {
    parents: [
      { resourceType: "project", operationSuffixPrefix: "project" },
      {
        resourceType: "project_series",
        operationSuffixPrefix: "project-series",
      },
      { resourceType: "distribution", operationSuffixPrefix: "distribution" },
      { resourceType: "distro_series", operationSuffixPrefix: "distro-series" },
      {
        resourceType: "distribution_source_package",
        operationSuffixPrefix: "distribution-source-package",
      },
      {
        resourceType: "source_package",
        operationSuffixPrefix: "source-package",
      },
      {
        resourceType: "external_package",
        operationSuffixPrefix: "external-package",
      },
      {
        resourceType: "external_package_series",
        operationSuffixPrefix: "external-package-series",
      },
      { resourceType: "oci_project", operationSuffixPrefix: "oci-project" },
      { resourceType: "archive", operationSuffixPrefix: "archive" },
      {
        resourceType: "archive_series",
        operationSuffixPrefix: "archive-series",
      },
      {
        resourceType: "archive_source_package",
        operationSuffixPrefix: "archive-source-package",
      },
      {
        resourceType: "archive_source_package_series",
        operationSuffixPrefix: "archive-source-package-series",
      },
    ],
    suffix: "+bug/{id=1}",
  },
  cve: {
    // bugs/browser/configure.zcml:836-841,879-882.
    templates: [{ template: "bugs/cve/{cve=2014-0160}" }],
  },
  vulnerability: {
    // bugs/browser/configure.zcml:883-886,915-919.
    parents: [{ resourceType: "distribution" }],
    suffix: "+vulnerability/{id=1}",
  },
  bug_activity: {
    // bugs/browser/configure.zcml:494-498.
    parents: [{ resourceType: "bug" }],
    suffix: "activity",
  },
  bug_attachment: {
    // bugs/browser/bugattachment.py:76-100: LaunchBag may select the
    // traversed task, otherwise the bug itself.
    parents: [
      { resourceType: "bug", operationSuffixPrefix: "bug" },
      { resourceType: "bug_task", operationSuffixPrefix: "bug-task" },
    ],
    suffix: "+attachment/{attachment_id=1}",
  },
  bug_branch: {
    // bugs/browser/configure.zcml:808-812.
    parents: [{ resourceType: "branch" }],
    suffix: "+bug/{id=1}",
  },
  bug_nomination: {
    // bugs/browser/configure.zcml:1062-1066.
    parents: [{ resourceType: "bug" }],
    suffix: "nominations/{nomination_id=1}",
  },
  bug_subscription: {
    // bugs/browser/configure.zcml:940-944.
    parents: [{ resourceType: "bug" }],
    suffix: "+subscription/{subscriber=launchpad}",
  },
  structural_subscription: {
    // bugs/browser/configure.zcml:1138-1141; target implementations
    // are registry interfaces plus bugs/model/structuralsubscription.py.
    parents: [
      { resourceType: "project", operationSuffixPrefix: "project" },
      {
        resourceType: "project_series",
        operationSuffixPrefix: "project-series",
      },
      { resourceType: "project_group", operationSuffixPrefix: "project-group" },
      { resourceType: "distribution", operationSuffixPrefix: "distribution" },
      { resourceType: "distro_series", operationSuffixPrefix: "distro-series" },
      {
        resourceType: "distribution_source_package",
        operationSuffixPrefix: "distribution-source-package",
      },
      { resourceType: "oci_project", operationSuffixPrefix: "oci-project" },
      { resourceType: "milestone", operationSuffixPrefix: "milestone" },
    ],
    suffix: "+subscription/{subscriber=launchpad}",
  },
  bug_subscription_filter: {
    // bugs/browser/configure.zcml:1147-1151.
    parents: [{ resourceType: "structural_subscription" }],
    suffix: "+filter/{id=1}",
  },
  bug_watch: {
    // bugs/browser/configure.zcml:1067-1071.
    parents: [{ resourceType: "bug" }],
    suffix: "+watch/{watch_id=1}",
  },
  bug_tracker: {
    // bugs/browser/configure.zcml:723-727,773-777.
    templates: [{ template: "bugs/bugtrackers/{tracker=debian}" }],
  },
  bug_tracker_component_group: {
    parents: [{ resourceType: "bug_tracker" }],
    suffix: "+components/{name=default}",
  },
  bug_tracker_component: {
    parents: [{ resourceType: "bug_tracker_component_group" }],
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
      {
        template: `${archive.template}/+upload/{user=launchpad}`,
        operationSuffix: `${archive.operationSuffix}-upload`,
      },
      {
        template: `${archive.template}/+queue-admin/{user=launchpad}`,
        operationSuffix: `${archive.operationSuffix}-queue-admin`,
      },
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
    parents: [{ resourceType: "archive" }],
    suffix: "+sourcepub/{id=18325396}",
  },
  binary_package_publishing_history: {
    parents: [{ resourceType: "archive" }],
    suffix: "+binarypub/{id=1}",
  },
  build: {
    // soyuz/browser/build.py:79-110: primary builds use the source
    // package release; PPA/copy builds use their archive.
    templates: [
      {
        template:
          "{distribution=ubuntu}/+source/{source=bash}/{version=1.0}/+build/{id=1}",
        operationSuffix: "source",
      },
      {
        template:
          "{distribution=ubuntu}/{source=bash}/{version=1.0}/+build/{id=1}",
        operationSuffix: "bare-source",
      },
    ],
    parents: [{ resourceType: "archive" }],
    suffix: "+build/{id=1}",
  },
  archive_dependency: {
    // soyuz/browser/configure.zcml:681-685; its parent is either an
    // archive or a snap base (soyuz/interfaces/archivedependency.py:39-63).
    parents: [
      { resourceType: "archive", operationSuffixPrefix: "archive" },
      { resourceType: "snap_base", operationSuffixPrefix: "snap-base" },
    ],
    suffix: "+dependency/{id=1}",
  },
  archive_subscriber: {
    // soyuz/browser/configure.zcml:366-369.
    parents: [{ resourceType: "archive" }],
    suffix: "+subscriptions/{subscriber=launchpad}",
  },
  binary_package_release_download_count: {
    // soyuz/browser/configure.zcml:686-692.
    parents: [{ resourceType: "archive" }],
    suffix:
      "+binaryhits/{binary=bash}/{version=1.0}/{arch=amd64}/{day=2026-01-01}/{country=US}",
  },
  packageset: {
    // soyuz/browser/configure.zcml:648-662.
    templates: [
      {
        template:
          "package-sets/{distribution=ubuntu}/{series=resolute}/{packageset=core}",
      },
    ],
  },
  processor: {
    // buildmaster/browser/configure.zcml:12-22.
    templates: [{ template: "+processors/{processor=amd64}" }],
  },
  builder: {
    // buildmaster/browser/configure.zcml:37-40,69-72.
    templates: [{ template: "builders/{builder=lcy02-amd64-001}" }],
  },
  distro_arch_series_filter: {
    // soyuz/browser/configure.zcml:161-164.
    parents: [{ resourceType: "distro_arch_series" }],
    suffix: "+source-filter",
  },
  package_upload: {
    // soyuz/browser/configure.zcml:663-667.
    parents: [{ resourceType: "distro_series" }],
    suffix: "+upload/{id=1}",
  },
  package_upload_log: {
    // soyuz/browser/configure.zcml:672-675.
    parents: [{ resourceType: "package_upload" }],
    suffix: "+log/{log_id=1}",
  },
  livefs: {
    // soyuz/browser/configure.zcml:700-704.
    templates: [
      {
        template:
          "{owner=~launchpad}/+livefs/{distribution=ubuntu}/{series=resolute}/{name=example}",
      },
    ],
  },
  livefs_build: {
    // soyuz/browser/configure.zcml:760-764.
    parents: [{ resourceType: "livefs" }],
    suffix: "+build/{id=1}",
  },

  // code/browser/branch.py:119-134, model/branchnamespace.py:311-314,
  // 359-362,425-428; model/gitrepository.py:438-459 has four targets.
  branch: {
    templates: [
      {
        template: "{owner=~launchpad}/+junk/{branch=example}",
        operationSuffix: "personal",
      },
      {
        template: "{owner=~launchpad}/{project=launchpad}/{branch=example}",
        operationSuffix: "project",
      },
      {
        template:
          "{owner=~launchpad}/{distribution=ubuntu}/{series=resolute}/{source=bash}/{branch=example}",
        operationSuffix: "source-package",
      },
    ],
  },
  git_repository: {
    templates: [
      {
        template: "{owner=~launchpad}/+git/{repository=example}",
        operationSuffix: "personal",
      },
      {
        template:
          "{owner=~launchpad}/{project=launchpad}/+git/{repository=launchpad}",
        operationSuffix: "project",
      },
      {
        template:
          "{owner=~launchpad}/{distribution=ubuntu}/+source/{source=bash}/+git/{repository=example}",
        operationSuffix: "source-package",
      },
      {
        template:
          "{owner=~launchpad}/{pillar=ubuntu}/+oci/{oci_project=base}/+git/{repository=example}",
        operationSuffix: "oci-project",
      },
    ],
  },
  // code/browser/configure.zcml:99-103,310-314,341-345,555-559,
  // 655-659,973-996,1063-1067,1162-1166,1289-1298,1429-1432.
  git_ref: {
    parents: [{ resourceType: "git_repository" }],
    suffix: "+ref/{ref=master}",
  },
  branch_merge_proposal: {
    parents: [
      { resourceType: "branch", operationSuffixPrefix: "branch" },
      {
        resourceType: "git_repository",
        operationSuffixPrefix: "git-repository",
      },
    ],
    suffix: "+merge/{id=1}",
  },
  branch_subscription: {
    parents: [{ resourceType: "branch" }],
    suffix: "+subscription/{subscriber=launchpad}",
  },
  git_subscription: {
    parents: [{ resourceType: "git_repository" }],
    suffix: "+subscription/{subscriber=launchpad}",
  },
  code_import: {
    parents: [
      { resourceType: "branch", operationSuffixPrefix: "branch" },
      {
        resourceType: "git_repository",
        operationSuffixPrefix: "git-repository",
      },
    ],
    suffix: "+code-import",
  },
  code_review_comment: {
    parents: [{ resourceType: "branch_merge_proposal" }],
    suffix: "comments/{comment_id=1}",
  },
  code_review_vote_reference: {
    parents: [{ resourceType: "branch_merge_proposal" }],
    suffix: "+review/{vote_id=1}",
  },
  preview_diff: {
    parents: [{ resourceType: "branch_merge_proposal" }],
    suffix: "+preview-diff/{diff_id=1}",
  },
  revision_status_report: {
    parents: [{ resourceType: "git_repository" }],
    suffix: "+status/{id=1}",
  },
  ci_build: {
    parents: [{ resourceType: "git_repository" }],
    suffix: "+build/{id=1}",
  },
  source_package_recipe: {
    parents: [{ resourceType: "person" }],
    suffix: "+recipe/{recipe=example}",
  },
  source_package_recipe_build: {
    parents: [{ resourceType: "archive" }],
    suffix: "+recipebuild/{id=1}",
  },

  // snappy/browser/snap.py:104-123; snappy/browser/configure.zcml:130-198.
  snap: {
    templates: [
      {
        template: "{owner=~launchpad}/+snap/{snap=example}",
        operationSuffix: "personal",
      },
      {
        template: "{owner=~launchpad}/{project=launchpad}/+snap/{snap=example}",
        operationSuffix: "project",
      },
    ],
  },
  snap_build_request: {
    parents: [{ resourceType: "snap" }],
    suffix: "+build-request/{id=1}",
  },
  snap_build: { parents: [{ resourceType: "snap" }], suffix: "+build/{id=1}" },
  snap_base: { templates: [{ template: "+snap-bases/{base=core22}" }] },
  snappy_series: { templates: [{ template: "+snappy-series/{series=16}" }] },
  // oci/browser/configure.zcml:12-15,94-101,141-144; owner prefix from
  // registry/browser/configure.zcml:2788-2792.
  oci_recipe: {
    templates: [
      {
        template:
          "{owner=~launchpad}/{pillar=ubuntu}/+oci/{oci_project=base}/+recipe/{recipe=example}",
      },
    ],
  },
  oci_recipe_build_request: {
    parents: [{ resourceType: "oci_recipe" }],
    suffix: "+build-request/{id=1}",
  },
  oci_recipe_build: {
    parents: [{ resourceType: "oci_recipe" }],
    suffix: "+build/{id=1}",
  },
  oci_push_rule: {
    parents: [{ resourceType: "oci_recipe" }],
    suffix: "+push-rule/{id=1}",
  },
  // charms/browser/charmrecipe.py:76-93 and browser/configure.zcml:81-141.
  charm_recipe: {
    templates: [
      {
        template:
          "{owner=~launchpad}/{project=launchpad}/+charm/{recipe=example}",
      },
    ],
  },
  charm_recipe_build_request: {
    parents: [{ resourceType: "charm_recipe" }],
    suffix: "+build-request/{id=1}",
  },
  charm_recipe_build: {
    parents: [{ resourceType: "charm_recipe" }],
    suffix: "+build/{id=1}",
  },
  charm_base: { templates: [{ template: "+charm-bases/{id=1}" }] },
  // crafts/browser/craftrecipe.py:21-38, browser/configure.zcml:12-29.
  craft_recipe: {
    templates: [
      {
        template:
          "{owner=~launchpad}/{project=launchpad}/+craft/{recipe=example}",
      },
    ],
  },
  craft_recipe_build_request: {
    parents: [{ resourceType: "craft_recipe" }],
    suffix: "+build-request/{id=1}",
  },
  craft_recipe_build: {
    parents: [{ resourceType: "craft_recipe" }],
    suffix: "+build/{id=1}",
  },
  // rocks/browser/configure.zcml:12-40,82-89; rockrecipe.py:21-38.
  rock_recipe: {
    templates: [
      {
        template:
          "{owner=~launchpad}/{project=launchpad}/+rock/{recipe=example}",
      },
    ],
  },
  rock_recipe_build_request: {
    parents: [{ resourceType: "rock_recipe" }],
    suffix: "+build-request/{id=1}",
  },
  rock_recipe_build: {
    parents: [{ resourceType: "rock_recipe" }],
    suffix: "+build/{id=1}",
  },
  rock_base: { templates: [{ template: "+rock-bases/{id=1}" }] },

  // answers/browser/configure.zcml:134-146,262-265,346-350;
  // answers/configure.zcml:160-183 registers series/source-package adapters.
  question: {
    parents: [
      { resourceType: "project", operationSuffixPrefix: "project" },
      { resourceType: "distribution", operationSuffixPrefix: "distribution" },
      {
        resourceType: "distribution_source_package",
        operationSuffixPrefix: "distribution-source-package",
      },
      {
        resourceType: "project_series",
        operationSuffixPrefix: "project-series",
      },
      { resourceType: "distro_series", operationSuffixPrefix: "distro-series" },
      {
        resourceType: "source_package",
        operationSuffixPrefix: "source-package",
      },
    ],
    suffix: "+question/{id=1}",
  },
  faq: {
    parents: [
      { resourceType: "project", operationSuffixPrefix: "project" },
      { resourceType: "distribution", operationSuffixPrefix: "distribution" },
      {
        resourceType: "distribution_source_package",
        operationSuffixPrefix: "distribution-source-package",
      },
      {
        resourceType: "source_package",
        operationSuffixPrefix: "source-package",
      },
    ],
    suffix: "+faq/{id=1}",
  },
  question_message: {
    parents: [{ resourceType: "question" }],
    suffix: "messages/{message=1}",
  },
  question_subscription: {
    parents: [{ resourceType: "question" }],
    suffix: "subscriptions/{subscriber=launchpad}",
  },
  // blueprints/browser/configure.zcml:203-205,226-228,250-254;
  // registry/tests/test_implements.py:51-70 lists target implementations.
  specification: {
    parents: [
      { resourceType: "project", operationSuffixPrefix: "project" },
      { resourceType: "distribution", operationSuffixPrefix: "distribution" },
      {
        resourceType: "project_series",
        operationSuffixPrefix: "project-series",
      },
      { resourceType: "distro_series", operationSuffixPrefix: "distro-series" },
    ],
    suffix: "+spec/{specification=example}",
  },
  specification_subscription: {
    parents: [{ resourceType: "specification" }],
    suffix: "+subscription/{subscriber=launchpad}",
  },
  specification_branch: {
    // blueprints/browser/specificationbranch.py:27-43: each specification
    // target can link to any of the three branch namespaces.
    templates: SPECIFICATION_TARGET_TEMPLATES.flatMap((target) =>
      SPECIFICATION_BRANCH_NAMES.map((branch) => ({
        template: `${target.template}/+spec/{specification=example}/+branch/${branch.template}`,
        operationSuffix: `${target.operationSuffix}-${branch.operationSuffix}`,
      })),
    ),
  },

  // translations/browser/potemplate.py:877-925; configure.zcml:131-163,
  // 102-121,255-290,388-434.
  translation_template: {
    parents: [
      {
        resourceType: "source_package",
        operationSuffixPrefix: "source-package",
      },
      {
        resourceType: "project_series",
        operationSuffixPrefix: "project-series",
      },
    ],
    suffix: "+pots/{template=launchpad}",
  },
  translation_file: {
    parents: [{ resourceType: "translation_template" }],
    suffix: "{language=en}",
  },
  translation_group: {
    templates: [{ template: "+groups/{group=launchpad-translators}" }],
  },
  translation_import_queue_entry: {
    templates: [{ template: "+imports/{id=1}" }],
  },
  distro_series_language: {
    parents: [{ resourceType: "distro_series" }],
    suffix: "+lang/{language=en}",
  },
  language: { templates: [{ template: "+languages/{language=en}" }] },
  country: {
    // services/worlddata/browser/configure.zcml:12-22.
    templates: [{ template: "+countries/{country=US}" }],
  },
  message_revision: {
    // services/messages/browser/configure.zcml:6-9; the in-scope
    // message_implementation is the question message.
    parents: [{ resourceType: "question_message" }],
    suffix: "revisions/{revision=1}",
  },

  // services/auth/configure.zcml:31-34; its target implementations are
  // registry/interfaces/product.py:613 and code/interfaces/gitrepository.py:135.
  access_token: {
    parents: [
      { resourceType: "project", operationSuffixPrefix: "project" },
      {
        resourceType: "git_repository",
        operationSuffixPrefix: "git-repository",
      },
    ],
    suffix: "+access-token/{id=1}",
  },
  registered_authenticator: {
    // services/webauthn/configure.zcml:32-36, API-only.
    parents: [{ resourceType: "person" }],
    suffix: "+authenticator/{id=1}",
  },
  email_address: {
    // services/identity/configure.zcml:41-45, API-only.
    parents: [{ resourceType: "person" }],
    suffix: "+email/{email=mark@canonical.com}",
  },
  temporary_blob: {
    // services/temporaryblobstorage/browser.py:74-87.
    templates: [
      {
        template: "temporary-blobs/{uuid=00000000-0000-4000-8000-000000000001}",
      },
    ],
  },
  webhook: {
    // services/webhooks/configure.zcml:72-84; IWebhookTarget is
    // implemented by these interfaces across code, registry, Soyuz,
    // snappy, charms, OCI, and livefs.
    parents: [
      { resourceType: "branch", operationSuffixPrefix: "branch" },
      {
        resourceType: "git_repository",
        operationSuffixPrefix: "git-repository",
      },
      { resourceType: "project", operationSuffixPrefix: "project" },
      { resourceType: "distribution", operationSuffixPrefix: "distribution" },
      {
        resourceType: "distribution_source_package",
        operationSuffixPrefix: "distribution-source-package",
      },
      { resourceType: "archive", operationSuffixPrefix: "archive" },
      { resourceType: "snap", operationSuffixPrefix: "snap" },
      { resourceType: "charm_recipe", operationSuffixPrefix: "charm-recipe" },
      { resourceType: "oci_recipe", operationSuffixPrefix: "oci-recipe" },
      { resourceType: "livefs", operationSuffixPrefix: "livefs" },
    ],
    suffix: "+webhook/{id=1}",
  },
  webhook_delivery: {
    parents: [{ resourceType: "webhook" }],
    suffix: "+delivery/{job_id=1}",
  },
  sharing_service: {
    // registry/services/sharingservice.py:89-100 and
    // registry/browser/configure.zcml:36-44.
    templates: [{ template: "+services/sharing" }],
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

/** Exact branch enum wire values whose newlines are normalized by WADL XML. */
export const RESOURCE_ENUM_CORRECTIONS: Readonly<
  Record<string, Readonly<Record<string, readonly [string, string]>>>
> = {
  "branch-full": {
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
