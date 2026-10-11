/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

/** Shared WADL and static-page test inputs. */

/** Minimal spec exercising HTML escaping without changing source semantics. */
export const siteOpenApi = {
  openapi: "3.0.3",
  info: {
    title: "Launchpad test API",
    version: "devel",
    description: '</script><script>alert("injected")</script> $&',
  },
  servers: [{ url: "https://api.launchpad.test/devel/" }],
  paths: {},
};

/** Search inputs exercise local references, inherited parameters and recursive composition. */
export const siteSearchOpenApi = {
  openapi: "3.0.3",
  info: {
    title: "Search test",
    version: "devel",
    description: "Reference introduction",
  },
  tags: [{ name: "archive" }, { name: "private", "x-internal": true }],
  paths: {
    "/{distribution}/+archive/{archive}?ws.op=getPublishedSources": {
      parameters: [
        {
          name: "inheritedToken",
          in: "query",
          description: "Find inherited credentials",
        },
      ],
      get: {
        tags: ["archive"],
        operationId: "archive-getPublishedSources-distribution",
        summary: "Get published sources",
        description: "Find source publications",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": { example: { value: "exampleNeedle" } },
            },
          },
        },
      },
    },
    "/{owner}/+archive/{distribution}/{archive}?ws.op=getPublishedSources": {
      get: {
        tags: ["archive"],
        operationId: "archive-getPublishedSources-ppa",
        summary: "Get published sources",
        responses: {},
      },
    },
    "/submit": {
      parameters: [
        { name: "overrideToken", in: "query", description: "obsoleteNeedle" },
      ],
      post: {
        tags: ["archive"],
        operationId: "submit-source",
        parameters: [
          {
            name: "overrideToken",
            in: "query",
            description: "replacementNeedle",
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Envelope" },
            },
          },
        },
        responses: {},
      },
    },
    "/hidden": { get: { tags: ["private"], summary: "hiddenOperationNeedle" } },
  },
  components: {
    schemas: {
      Envelope: {
        allOf: [
          {
            $ref: "#/components/schemas/Envelope",
            description: "Recursive composition",
          },
          {
            type: "object",
            properties: {
              metadata_flag: {
                type: "string",
                description: "bodyDescriptionNeedle",
              },
              alias: { $ref: "#/components/schemas/a~1b~0c" },
            },
          },
        ],
      },
      "a/b~c": {
        type: "object",
        properties: { nestedFlag: { type: "string" } },
      },
      Hidden: { "x-scalar-ignore": true, description: "hiddenModelNeedle" },
    },
  },
};

/** Hidden-only schemas must not create an otherwise absent Models section link. */
export const siteHiddenSearchOpenApi = {
  ...siteSearchOpenApi,
  paths: {},
  components: {
    schemas: { Hidden: siteSearchOpenApi.components.schemas.Hidden },
  },
};

/** Shared Launchpad-style WADL for parser and common generator behavior. */
export const sampleWadl = `<?xml version="1.0"?>
<!DOCTYPE application [
  <!ENTITY nbsp "\\&#160;">
]>
<wadl:application xmlns:wadl="http://research.sun.com/wadl/2006/10" xmlns="http://research.sun.com/wadl/2006/10">
  <wadl:doc xmlns="http://www.w3.org/1999/xhtml" title="About this service">The service.&nbsp;Read <strong>the guide</strong>.</wadl:doc>
  <wadl:doc xmlns="http://www.w3.org/1999/xhtml" title="About version 1.0">Version notes.</wadl:doc>
  <wadl:doc>Untitled application notes.</wadl:doc>
  <wadl:doc></wadl:doc>

  <wadl:resources base="https://api.launchpad.test/1.0/">
    <wadl:resource path="" type="#service-root"/>
  </wadl:resources>

  <wadl:resource_type id="service-root">
    <wadl:doc>The root of the web service.</wadl:doc>
    <wadl:method name="GET" id="service-root-get">
      <wadl:response><wadl:representation href="#service-root-json"/></wadl:response>
    </wadl:method>
  </wadl:resource_type>

  <wadl:representation mediaType="application/json" id="service-root-json">
    <wadl:param name="people_collection_link" path="$['people_collection_link']">
      <wadl:link resource_type="https://api.launchpad.test/1.0/#people"/>
    </wadl:param>
    <wadl:param name="me_link" path="$['me_link']">
      <wadl:link resource_type="https://api.launchpad.test/1.0/#person"/>
    </wadl:param>
  </wadl:representation>

  <wadl:resource_type id="people">
    <wadl:doc>Collection of people.</wadl:doc>
    <wadl:method name="GET" id="people-get">
      <wadl:response><wadl:representation href="#person-page"/></wadl:response>
    </wadl:method>
    <wadl:method name="GET" id="people-getByName">
      <wadl:doc>Find a person by name. :return: a string URL</wadl:doc>
      <wadl:request>
        <wadl:param name="ws.op" required="true" fixed="getByName"/>
        <wadl:param name="name" required="true"><wadl:doc>The person name.</wadl:doc></wadl:param>
      </wadl:request>
      <wadl:response><wadl:representation href="#person-full"/></wadl:response>
    </wadl:method>
    <wadl:method name="POST" id="people-newTeam">
      <wadl:doc>Create a new team.</wadl:doc>
      <wadl:request>
        <wadl:representation mediaType="application/x-www-form-urlencoded">
          <wadl:param name="ws.op" required="true" fixed="newTeam"/>
          <wadl:param name="display_name" required="true"><wadl:doc>Display name.</wadl:doc></wadl:param>
          <wadl:param name="subscription_policy">
            <wadl:doc>Membership policy.</wadl:doc>
            <wadl:option value="Open"/>
            <wadl:option/>
            <wadl:option value="Moderated"/>
          </wadl:param>
        </wadl:representation>
      </wadl:request>
    </wadl:method>
  </wadl:resource_type>

  <wadl:resource_type id="person">
    <wadl:doc>A person.</wadl:doc>
    <wadl:method name="GET" id="person-get">
      <wadl:response><wadl:representation href="#person-full"/></wadl:response>
    </wadl:method>
    <wadl:method name="PUT" id="person-put">
      <wadl:request><wadl:representation href="#person-full"/></wadl:request>
      <wadl:response><wadl:representation href="#person-full"/></wadl:response>
    </wadl:method>
    <wadl:method name="PATCH" id="person-patch">
      <wadl:request><wadl:representation href="#person-diff"/></wadl:request>
      <wadl:response><wadl:representation href="#person-full"/></wadl:response>
    </wadl:method>
    <wadl:method name="DELETE" id="person-delete"/>
    <wadl:method name="GET">
      <wadl:doc>Get members. :return: collection of URLs</wadl:doc>
      <wadl:request><wadl:param name="ws.op" fixed="getMembers"/></wadl:request>
    </wadl:method>
    <wadl:method name="FOO" id="person-unsupported"/>
  </wadl:resource_type>

  <wadl:representation mediaType="application/json" id="person-full">
    <wadl:param name="self_link" path="$['self_link']">
      <wadl:doc>The canonical URL.</wadl:doc>
      <wadl:link resource_type="https://api.launchpad.test/1.0/#person"/>
    </wadl:param>
    <wadl:param name="name" path="$['name']" required="true"><wadl:doc>The name.</wadl:doc></wadl:param>
    <wadl:param name="subscription_policy" path="$['subscription_policy']" required="true">
      <wadl:option value="Open"/><wadl:option value="Moderated"/>
    </wadl:param>
  </wadl:representation>

  <wadl:representation mediaType="application/json" id="person-diff">
    <wadl:param name="name" path="$['name']"/>
  </wadl:representation>

  <wadl:representation mediaType="application/json" id="person-page">
    <wadl:param name="total_size" path="$['total_size']" required="true"/>
    <wadl:param name="start" path="$['start']" required="true"/>
    <wadl:param name="entries" path="$['entries']" required="true"/>
    <wadl:param name="entry_links" path="$['entries'][*]['self_link']">
      <wadl:link resource_type="https://api.launchpad.test/1.0/#person"/>
    </wadl:param>
  </wadl:representation>

  <wadl:representation mediaType="application/xhtml+xml" id="person-xhtml"/>
  <wadl:representation mediaType="application/vnd.sun.wadl+xml" id="person-wadl"/>

  <wadl:resource_type id="person-page-resource">
    <wadl:method name="GET" id="person-page-resource-get">
      <wadl:response><wadl:representation href="#person-page"/></wadl:response>
    </wadl:method>
  </wadl:resource_type>
  <wadl:resource_type id="HostedFile"><wadl:method name="GET"/></wadl:resource_type>
  <wadl:resource_type id="ScalarValue"><wadl:method name="GET"/></wadl:resource_type>
  <wadl:resource_type><wadl:method name="GET"/></wadl:resource_type>
</wadl:application>`;

/** Runtime links whose path segments differ from WADL field names. */
export const serviceRootLinks: Record<string, string> = {
  people_collection_link: "https://api.launchpad.test/1.0/people/",
  me_link: "https://api.launchpad.test/1.0/people/+me/",
};

/** A valid WADL document with no resource types. */
export const emptyWadl = `<?xml version="1.0"?>
<wadl:application xmlns:wadl="http://research.sun.com/wadl/2006/10">
  <wadl:resources base="https://api.launchpad.test/devel/"/>
</wadl:application>`;

/** A document without the required WADL application root. */
export const notWadl = `<not-application/>`;

/** A compact WADL document covering generator-only edge cases. */
export const generatorEdgeWadl = `<?xml version="1.0"?>
<wadl:application xmlns:wadl="http://research.sun.com/wadl/2006/10">
  <wadl:resources base="https://api.launchpad.test/devel/"/>
  <wadl:resource_type id="service-root"><wadl:method name="GET"/></wadl:resource_type>
  <wadl:resource_type id="bug">
    <wadl:method name="GET" id="bug-get">
      <wadl:response>
        <wadl:representation href="#missing"/>
        <wadl:representation href="#edge-full"/>
      </wadl:response>
    </wadl:method>
    <wadl:method name="PUT" id="bug-put">
      <wadl:request><wadl:representation href="#missing"/></wadl:request>
    </wadl:method>
    <wadl:method name="POST" id="bug-post"/>
    <wadl:method name="GET">
      <wadl:doc>Check a bug. :return: True if active :rtype: boolean</wadl:doc>
      <wadl:request>
        <wadl:param name="ws.op" fixed="isActive"/>
        <wadl:param name="policy" required="true">
          <wadl:option value="Open"/><wadl:option value="Closed"/>
        </wadl:param>
        <wadl:param name="start" required="true"/>
        <wadl:param name="entries" required="true"/>
        <wadl:param name="target" required="true">
          <wadl:link resource_type="#bug"/>
        </wadl:param>
        <wadl:param name="note"/>
      </wadl:request>
    </wadl:method>
    <wadl:method name="GET">
      <wadl:doc>Read text. :return: a string value</wadl:doc>
      <wadl:request><wadl:param name="ws.op" fixed="getText"/></wadl:request>
    </wadl:method>
    <wadl:method name="GET">
      <wadl:doc>Unknown result. :return: an opaque value</wadl:doc>
      <wadl:request><wadl:param name="ws.op" fixed="getUnknown"/></wadl:request>
    </wadl:method>
    <wadl:method name="GET">
      <wadl:request><wadl:param name="ws.op" fixed="undocumented"/></wadl:request>
    </wadl:method>
    <wadl:method name="POST">
      <wadl:request>
        <wadl:representation mediaType="application/x-www-form-urlencoded">
          <wadl:param name="ws.op" fixed="emptyForm"/>
        </wadl:representation>
      </wadl:request>
    </wadl:method>
    <wadl:method name="POST">
      <wadl:request>
        <wadl:representation mediaType="application/x-www-form-urlencoded">
          <wadl:param name="ws.op" fixed="optionalForm"/>
          <wadl:param name="comment"/>
        </wadl:representation>
      </wadl:request>
    </wadl:method>
  </wadl:resource_type>
  <wadl:resource_type id="unknown">
    <wadl:method name="GET"/>
  </wadl:resource_type>
  <wadl:resource_type id="empty-resource">
    <wadl:method name="POST"/>
  </wadl:resource_type>
  <wadl:representation mediaType="application/json" id="edge-full"/>
  <wadl:representation mediaType="application/json" id="empty-json"/>
  <wadl:representation mediaType="application/json" id="orphan-page">
    <wadl:param name="entries" required="true"/>
    <wadl:param name="entry_links" path="$['entries'][*]['self_link']">
      <wadl:link resource_type="#missing"/>
    </wadl:param>
  </wadl:representation>
</wadl:application>`;

/** Declared WADL statuses with grouped JSON, non-JSON, and empty responses. */
export const responseStatusWadl = `<?xml version="1.0"?>
<wadl:application xmlns:wadl="http://research.sun.com/wadl/2006/10">
  <wadl:resources base="https://api.launchpad.test/devel/"/>
  <wadl:resource_type id="bug">
    <wadl:method name="POST" id="widget-create">
      <wadl:request><wadl:representation mediaType="application/x-www-form-urlencoded">
        <wadl:param name="ws.op" fixed="create"/>
      </wadl:representation></wadl:request>
      <wadl:response status="201"><wadl:representation href="#widget-full" mediaType="application/json"/></wadl:response>
      <wadl:response status="400"><wadl:representation href="#widget-error" mediaType="application/json"/></wadl:response>
      <wadl:response status="415"><wadl:representation mediaType="text/plain"/></wadl:response>
    </wadl:method>
    <wadl:method name="GET" id="widget-get">
      <wadl:response status="200 206">
        <wadl:representation href="#widget-full" mediaType="application/json"/>
        <wadl:representation mediaType="text/csv"/>
      </wadl:response>
      <wadl:response status="404"><wadl:representation href="#unknown-widget" mediaType="application/json"/></wadl:response>
    </wadl:method>
    <wadl:method name="GET" id="widget-statuslessMedia">
      <wadl:request><wadl:param name="ws.op" fixed="statuslessMedia"/></wadl:request>
      <wadl:response>
        <wadl:representation href="#widget-full" mediaType="application/json"/>
        <wadl:representation href="#widget-html" mediaType="application/xhtml+xml"/>
      </wadl:response>
    </wadl:method>
    <wadl:method name="DELETE" id="widget-delete">
      <wadl:response status="204"/>
    </wadl:method>
  </wadl:resource_type>
  <wadl:representation id="widget-full" mediaType="application/json">
    <wadl:param name="name" path="$['name']"/>
  </wadl:representation>
  <wadl:representation id="widget-error" mediaType="application/json">
    <wadl:param name="message" path="$['message']"/>
  </wadl:representation>
  <wadl:representation id="widget-html" mediaType="application/xhtml+xml"/>
</wadl:application>`;
/** Curated multi-segment resources with literal routing markers. */
export const curatedPathsWadl = `<?xml version="1.0"?>
<wadl:application xmlns:wadl="http://research.sun.com/wadl/2006/10">
  <wadl:resources base="https://api.launchpad.test/devel/"/>
  <wadl:resource_type id="archive">
    <wadl:method name="GET" id="archive-get"/>
    <wadl:method name="GET" id="archive-getPublishedSources">
      <wadl:request><wadl:param name="ws.op" fixed="getPublishedSources"/></wadl:request>
    </wadl:method>
  </wadl:resource_type>
  <wadl:resource_type id="git_repository">
    <wadl:method name="GET" id="git_repository-get"/>
  </wadl:resource_type>
</wadl:application>`;

/** Nested canonical URLs from Launchpad's bug-task, archive, and person adapters. */
export const routeCorrectionsWadl = `<?xml version="1.0"?>
<wadl:application xmlns:wadl="http://research.sun.com/wadl/2006/10">
  <wadl:resources base="https://api.launchpad.test/devel/"/>
  <wadl:representation mediaType="application/json" id="service-root-json">
    <wadl:param name="specifications_collection_link">
      <wadl:link resource_type="#specifications"/>
    </wadl:param>
    <wadl:param name="me_link"><wadl:link resource_type="#person"/></wadl:param>
  </wadl:representation>
  <wadl:resource_type id="distribution_source_package">
    <wadl:method name="GET" id="distribution_source_package-get"/>
  </wadl:resource_type>
  <wadl:resource_type id="archive">
    <wadl:method name="GET" id="archive-get"/>
  </wadl:resource_type>
  <wadl:resource_type id="archive_permission">
    <wadl:method name="GET" id="archive_permission-get"/>
  </wadl:resource_type>
  <wadl:resource_type id="oci_project">
    <wadl:method name="GET" id="oci_project-get"/>
  </wadl:resource_type>
  <wadl:resource_type id="oci_project_series">
    <wadl:method name="GET" id="oci_project_series-get"/>
  </wadl:resource_type>
  <wadl:resource_type id="bug_task">
    <wadl:method name="GET" id="bug_task-get"/>
  </wadl:resource_type>
  <wadl:resource_type id="external_package">
    <wadl:method name="GET" id="external_package-get"/>
  </wadl:resource_type>
  <wadl:resource_type id="external_package_series">
    <wadl:method name="GET" id="external_package_series-get"/>
  </wadl:resource_type>
  <wadl:resource_type id="person">
    <wadl:method name="GET" id="person-get"/>
  </wadl:resource_type>
  <wadl:resource_type id="team">
    <wadl:method name="GET" id="team-get"/>
  </wadl:resource_type>
  <wadl:resource_type id="gpg_key">
    <wadl:method name="GET" id="gpg_key-get"/>
  </wadl:resource_type>
  <wadl:resource_type id="specifications">
    <wadl:method name="GET" id="specifications-get"/>
  </wadl:resource_type>
  <wadl:resource_type id="git_target">
    <wadl:method name="GET" id="git_target-get"/>
  </wadl:resource_type>
  <wadl:resource_type id="unknown">
    <wadl:method name="GET" id="unknown-get"/>
  </wadl:resource_type>
</wadl:application>`;

/** Small resources for isolated semantic route catalog permutations. */
export const semanticRoutesWadl = `<?xml version="1.0"?>
<wadl:application xmlns:wadl="http://research.sun.com/wadl/2006/10">
  <wadl:resources base="https://api.launchpad.test/devel/"/>
  <wadl:resource_type id="semantic_item">
    <wadl:method name="GET" id="semantic_item-get"/>
    <wadl:method name="GET" id="semantic-source-inspect">
      <wadl:request><wadl:param name="ws.op" fixed="inspect"/></wadl:request>
    </wadl:method>
  </wadl:resource_type>
  <wadl:resource_type id="semantic_child">
    <wadl:method name="GET" id="semantic_child-get"/>
  </wadl:resource_type>
  <wadl:resource_type id="anonymous_route">
    <wadl:method name="GET"/>
    <wadl:method name="GET">
      <wadl:request><wadl:param name="ws.op" fixed="inspect"/></wadl:request>
    </wadl:method>
  </wadl:resource_type>
</wadl:application>`;

/** Branch lookup WADL: one nullable lookup, one URL mapping, and independent controls. */
export const branchLookupWadl = `<?xml version="1.0"?>
<wadl:application xmlns:wadl="http://research.sun.com/wadl/2006/10"
                  xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <wadl:resources base="https://api.launchpad.test/devel/"/>
  <wadl:representation mediaType="application/json" id="service-root-json">
    <wadl:param name="branches_collection_link">
      <wadl:link resource_type="#branches"/>
    </wadl:param>
    <wadl:param name="projects_collection_link">
      <wadl:link resource_type="#projects"/>
    </wadl:param>
  </wadl:representation>
  <wadl:resource_type id="branches">
    <wadl:method name="GET" id="branches-getByPath">
      <wadl:doc>Look up a branch. :return: the branch, or None if missing</wadl:doc>
      <wadl:request>
        <wadl:param name="ws.op" fixed="getByPath"/>
        <wadl:param name="path" required="true" type="xsd:string"/>
      </wadl:request>
      <wadl:response><wadl:representation href="#branch-full"/></wadl:response>
    </wadl:method>
    <wadl:method name="GET" id="branches-getByUrls">
      <wadl:doc>Look up branches by URL. :return: a mapping from URLs to branches or None</wadl:doc>
      <wadl:request>
        <wadl:param name="ws.op" fixed="getByUrls"/>
        <wadl:param name="urls" type="xsd:string" required="true"/>
      </wadl:request>
    </wadl:method>
    <wadl:method name="GET" id="branches-getFeatured">
      <wadl:doc>Return a featured branch.</wadl:doc>
      <wadl:request><wadl:param name="ws.op" fixed="getFeatured"/></wadl:request>
      <wadl:response><wadl:representation href="#branch-full"/></wadl:response>
    </wadl:method>
    <wadl:method name="GET" id="branches-getOpaque">
      <wadl:doc>Return a value of unspecified shape. :return: an opaque value</wadl:doc>
      <wadl:request><wadl:param name="ws.op" fixed="getOpaque"/></wadl:request>
    </wadl:method>
  </wadl:resource_type>
  <wadl:resource_type id="projects">
    <wadl:method name="GET" id="projects-getByPath">
      <wadl:doc>Look up a project by path.</wadl:doc>
      <wadl:request>
        <wadl:param name="ws.op" fixed="getByPath"/>
        <wadl:param name="path" required="true" type="xsd:string"/>
      </wadl:request>
      <wadl:response><wadl:representation href="#project-full"/></wadl:response>
    </wadl:method>
  </wadl:resource_type>
  <wadl:representation mediaType="application/json" id="branch-full">
    <wadl:param name="self_link" required="true"><wadl:link resource_type="#branch"/></wadl:param>
    <wadl:param name="unique_name" required="true" type="xsd:string"/>
    <wadl:param name="display_name" required="true" type="xsd:string"/>
    <wadl:param name="name" required="true" type="xsd:string"/>
    <wadl:param name="revision_count" required="true" type="xsd:int"/>
    <wadl:param name="private" required="true" type="xsd:boolean"/>
  </wadl:representation>
  <wadl:representation mediaType="application/json" id="project-full">
    <wadl:param name="name" required="true" type="xsd:string"/>
  </wadl:representation>
</wadl:application>`;

/** Selected actual fields from the public getByUrls response, including a missing lookup. */
export const observedBranchLookup = {
  "lp:openshot/website": {
    self_link:
      "https://api.launchpad.net/devel/~openshot.code/openshot/translations-website",
    unique_name: "~openshot.code/openshot/translations-website",
    display_name: "lp:openshot/website",
    name: "translations-website",
    revision_count: 85,
    private: false,
  },
  "lp:definitely-missing-client-design-probe": null,
};

/** Source-backed Launchpad fields with WADL-owned presence and explicit-type variants. */
/** lazr.restful's untyped entry header params; unpublished web_link is omitted. */
const lazrEntryFrameworkParams = `
    <wadl:param style="plain" name="web_link" path="$['web_link']">
      <wadl:doc>
        The canonical human-addressable web link to this resource.
      </wadl:doc>
      <wadl:link/>
    </wadl:param>
    <wadl:param style="plain" name="resource_type_link" path="$['resource_type_link']">
      <wadl:doc>
        The link to the WADL description of this resource.
      </wadl:doc>
      <wadl:link/>
    </wadl:param>
    <wadl:param style="plain" name="http_etag" path="$['http_etag']">
      <wadl:doc>
        The value of the HTTP ETag for this resource.
      </wadl:doc>
    </wadl:param>`;

export const metadataEnrichmentWadl = `<?xml version="1.0"?>
<wadl:application xmlns:wadl="http://research.sun.com/wadl/2006/10"
                  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                  xmlns:foreign="urn:not-the-xml-schema-namespace">
  <wadl:resources base="https://api.launchpad.test/beta/"/>
  <wadl:resource_type id="project">
    <wadl:method name="GET" id="project-get">
      <wadl:response><wadl:representation href="#project-full"/></wadl:response>
    </wadl:method>
    <wadl:method name="PATCH" id="project-patch">
      <wadl:request><wadl:representation href="#project-diff"/></wadl:request>
      <wadl:response><wadl:representation href="#project-full"/></wadl:response>
    </wadl:method>
    <wadl:method name="PUT" id="project-put">
      <wadl:request><wadl:representation href="#project-full"/></wadl:request>
      <wadl:response><wadl:representation href="#project-full"/></wadl:response>
    </wadl:method>
  </wadl:resource_type>
  <wadl:representation mediaType="application/json" id="project-full">
    <wadl:param style="plain" name="self_link" path="$['self_link']">
      <wadl:doc>The canonical link to this resource.</wadl:doc>
      <wadl:link resource_type="https://api.launchpad.test/beta/#project"/>
    </wadl:param>${lazrEntryFrameworkParams}
    <wadl:param name="display_name" required="true"/>
    <wadl:param name="owner_link" required="true"><wadl:link resource_type="#person"/></wadl:param>
    <wadl:param name="driver_link"><wadl:link resource_type="#person"/></wadl:param>
    <wadl:param name="active"/>
    <wadl:param name="license_approved"/>
    <wadl:param name="vcs" type="xsd:string">
      <wadl:option value="Bazaar"/><wadl:option value="Git"/>
    </wadl:param>
    <wadl:param name="licenses" required="true"/>
    <wadl:param name="content_templates" required="true"/>
    <wadl:param name="count" required="true"><wadl:doc>An integer count, or null.</wadl:doc></wadl:param>
    <wadl:param name="opaque_payload"/>
  </wadl:representation>
  <wadl:representation mediaType="application/json" id="project-diff">
    <wadl:param name="display_name"/>
    <wadl:param name="owner_link"><wadl:link resource_type="#person"/></wadl:param>
    <wadl:param name="driver_link"><wadl:link resource_type="#person"/></wadl:param>
    <wadl:param name="licenses" type="xsd:string"/>
  </wadl:representation>
  <wadl:representation mediaType="application/json" id="project-write">
    <wadl:param name="display_name" required="true"/>
    <wadl:param name="owner_link" required="true"><wadl:link resource_type="#person"/></wadl:param>
    <wadl:param name="driver_link"><wadl:link resource_type="#person"/></wadl:param>
  </wadl:representation>
  <wadl:representation mediaType="application/json" id="person-full">
    <wadl:param name="display_name"/>
    <wadl:param name="latitude" required="true"/>
    <wadl:param name="time_zone" required="true"/>
  </wadl:representation>
  <wadl:representation mediaType="application/json" id="build-full">
    <wadl:param name="duration" required="true"/>
  </wadl:representation>
  <wadl:representation mediaType="application/json" id="archive_permission-full">
    <wadl:param name="permission" required="true"/>
  </wadl:representation>
  <wadl:representation mediaType="application/json" id="archive_permission-diff">
    <wadl:param name="permission"/>
  </wadl:representation>
  <wadl:representation mediaType="application/json" id="bug_attachment-full">
    <wadl:param name="url" required="true"/>
  </wadl:representation>
  <wadl:representation mediaType="application/json" id="timeline_project_series-full">
    <wadl:param name="landmarks" required="true"/>
  </wadl:representation>
  <wadl:representation mediaType="application/json" id="archive-full">
    <wadl:param name="name"/>
    <wadl:param name="relative_build_score"/>
    <wadl:param name="signing_key_fingerprint" required="true" type="xsd:string"/>
  </wadl:representation>
  <wadl:representation mediaType="application/json" id="bug-full">
    <wadl:param name="id"/>
    <wadl:param name="private"/>
    <wadl:param name="tags" required="true"/>
    <wadl:param name="duplicate_of_link" required="true">
      <wadl:link resource_type="#bug"/>
    </wadl:param>
  </wadl:representation>
  <wadl:representation mediaType="application/json" id="git_repository-full">
    <wadl:param name="description"/>
    <wadl:param name="builder_constraints" required="true"/>
    <wadl:param name="owner_default"/>
  </wadl:representation>
  <wadl:representation mediaType="application/json" id="git_repository-diff">
    <wadl:param name="builder_constraints"/>
  </wadl:representation>
  <wadl:representation mediaType="application/json" id="imaginary_project-full">${lazrEntryFrameworkParams}
    <wadl:param name="display_name" required="true"/>
    <wadl:param name="active"/>
    <wadl:param name="tags"/>
    <wadl:param name="start" type="foreign:string"/>
    <wadl:param name="total_size" type="foreign:string"/>
    <wadl:param name="entries" type="foreign:string"/>
  </wadl:representation>
  <wadl:representation mediaType="application/json" id="imaginary_project-diff">
    <wadl:param name="start"/>
    <wadl:param name="total_size"/>
    <wadl:param name="entries"/>
  </wadl:representation>
  <wadl:representation mediaType="application/json" id="snap-full">
    <wadl:param name="private"/>
  </wadl:representation>
  <wadl:representation mediaType="application/json" id="builder-full">
    <wadl:param name="processors"/>
  </wadl:representation>
  <wadl:representation mediaType="application/json" id="builder-diff">
    <wadl:param name="processors"/>
  </wadl:representation>
  <wadl:representation mediaType="application/json" id="ci_build-full">
    <wadl:param name="git_refs"/>
  </wadl:representation>
  <wadl:representation mediaType="application/json" id="snap_build-full">
    <wadl:param name="target_architectures"/>
  </wadl:representation>
  <wadl:representation mediaType="application/json" id="person-page">
    <wadl:param style="plain" name="resource_type_link" path="$['resource_type_link']">
      <wadl:link/>
    </wadl:param>
    <wadl:param name="total_size" required="true" type="xsd:int"/>
    <wadl:param name="entries" required="true"/>
    <wadl:param name="entry_self_link" path="$['entries'][*]['self_link']">
      <wadl:link resource_type="#person"/>
    </wadl:param>
    <wadl:param name="display_name"/>
  </wadl:representation>
  <wadl:representation mediaType="application/json" id="service-root-json">
    <wadl:param style="plain" name="people_collection_link" path="$['people_collection_link']">
      <wadl:link resource_type="https://api.launchpad.test/beta/#people"/>
    </wadl:param>
    <wadl:param style="plain" name="resource_type_link" path="$['resource_type_link']">
      <wadl:doc>The link to the WADL description of this resource.</wadl:doc>
      <wadl:link/>
    </wadl:param>
  </wadl:representation>
</wadl:application>`;

/** Publication dict returns are absent from representations; only return prose survives WADL. */
export const publicationFileResponsesWadl = `<?xml version="1.0"?>
<wadl:application xmlns:wadl="http://research.sun.com/wadl/2006/10"
                  xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <wadl:resources base="https://api.launchpad.test/devel/"/>
  <wadl:resource_type id="binary_package_publishing_history">
    <wadl:method name="GET" id="binary_package_publishing_history-binaryFileUrls">
      <wadl:doc>URLs for this binary publication's binary files.
        :param include_meta: Return a list of dicts with keys url, size, sha1, and sha256 for each URL instead of a simple list.
        :return: A collection of URLs for this binary.</wadl:doc>
      <wadl:request>
        <wadl:param name="ws.op" fixed="binaryFileUrls" required="true"/>
        <wadl:param name="include_meta" type="xsd:boolean" required="false"/>
      </wadl:request>
    </wadl:method>
  </wadl:resource_type>
  <wadl:resource_type id="source_package_publishing_history">
    <wadl:method name="GET" id="source_package_publishing_history-sourceFileUrls">
      <wadl:doc>URLs for this source publication's uploaded source files.
        :param include_meta: Return a list of dicts with keys url, size, and sha256 for each URL instead of a simple list.
        :return: A collection of URLs for this source.</wadl:doc>
      <wadl:request>
        <wadl:param name="ws.op" fixed="sourceFileUrls" required="true"/>
        <wadl:param name="include_meta" type="xsd:boolean" required="false"/>
      </wadl:request>
    </wadl:method>
    <wadl:method name="GET" id="source_package_publishing_history-binaryFileUrls">
      <wadl:doc>URLs for this source publication's binary files. :return: A collection of URLs for this source.</wadl:doc>
      <wadl:request><wadl:param name="ws.op" fixed="binaryFileUrls"/></wadl:request>
    </wadl:method>
  </wadl:resource_type>
  <wadl:resource_type id="package_upload">
    <wadl:method name="GET" id="package_upload-sourceFileUrls">
      <wadl:doc>:return: A collection of URLs for this upload.</wadl:doc>
      <wadl:request><wadl:param name="ws.op" fixed="sourceFileUrls"/></wadl:request>
    </wadl:method>
    <wadl:method name="GET" id="package_upload-binaryFileUrls">
      <wadl:doc>:return: A collection of URLs for this upload.</wadl:doc>
      <wadl:request><wadl:param name="ws.op" fixed="binaryFileUrls"/></wadl:request>
    </wadl:method>
    <wadl:method name="GET" id="package_upload-customFileUrls">
      <wadl:doc>:return: A collection of URLs for this upload.</wadl:doc>
      <wadl:request><wadl:param name="ws.op" fixed="customFileUrls"/></wadl:request>
    </wadl:method>
  </wadl:resource_type>
  <wadl:resource_type id="person">
    <wadl:method name="GET" id="person-binaryFileUrls">
      <wadl:doc>:return: A collection of URLs for this unrelated operation.</wadl:doc>
      <wadl:request>
        <wadl:param name="ws.op" fixed="binaryFileUrls"/>
        <wadl:param name="include_meta" type="xsd:boolean"/>
      </wadl:request>
    </wadl:method>
  </wadl:resource_type>
  <wadl:representation id="publication-explicit" mediaType="application/json">
    <wadl:param name="declared_value" type="xsd:string" required="true"/>
  </wadl:representation>
</wadl:application>`;

/** Rechecked production binary metadata, from a read-only include_meta=true request. */
export const observedBinaryFileMetadata = {
  url: "https://launchpad.net/ubuntu/+archive/primary/+files/hello_2.10-3build1_amd64.deb",
  size: 26006,
  sha1: "5766f9c21afcace4669cdb6f110bb564a009974b",
  sha256: "e68cf4365b7aa9c4e2af4af6eee1710d6f967059b7b4af62786e8870d7366333",
};

/** Synthetic source metadata matching sourceFileUrls; no sha1 is returned by the server. */
export const sourceFileMetadata = {
  url: "https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/hello/2.10-3/hello_2.10-3.dsc",
  size: 1335,
  sha256: "synthetic-checksum",
};

/** Collection identity comes from resolved page refs, not method names or return prose. */
export const collectionControlsWadl = `<?xml version="1.0"?>
<wadl:application xmlns:wadl="http://research.sun.com/wadl/2006/10"
                  xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <wadl:resources base="https://api.launchpad.test/devel/"/>
  <wadl:resource_type id="archive">
    <wadl:method name="GET" id="archive-get">
      <wadl:response><wadl:representation href="#archive-full"/></wadl:response>
    </wadl:method>
    <wadl:method name="GET" id="archive-getPublishedSources">
      <wadl:request>
        <wadl:param name="ws.op" fixed="getPublishedSources" required="true"/>
        <wadl:param name="source_name" type="xsd:string"/>
        <wadl:param name="exact_match" type="xsd:boolean"/>
        <wadl:param name="version" type="xsd:string"/>
      </wadl:request>
      <wadl:response><wadl:representation href="#source_package_publishing_history-page"/></wadl:response>
    </wadl:method>
    <wadl:method name="GET" id="archive-declaredControls">
      <wadl:request>
        <wadl:param name="ws.op" fixed="declaredControls"/>
        <wadl:param name="ws.start" type="xsd:string" required="true"/>
        <wadl:param name="ws.size" type="xsd:boolean"/>
        <wadl:param name="memo" type="xsd:int" required="true"/>
        <wadl:param name="direction" type="xsd:string" required="true">
          <wadl:option value="backwards"/><wadl:option value="forwards"/>
        </wadl:param>
        <wadl:param name="ws.show" type="xsd:boolean" required="true"/>
        <wadl:param name="ws.accept" type="xsd:string"/>
      </wadl:request>
      <wadl:response><wadl:representation href="#processor-page"/></wadl:response>
    </wadl:method>
    <wadl:method name="GET" id="archive-partialControls">
      <wadl:request>
        <wadl:param name="ws.op" fixed="partialControls"/>
        <wadl:param name="ws.start" type="xsd:string" required="true"/>
        <wadl:param name="start" type="xsd:int"/>
        <wadl:param name="size" type="xsd:int"/>
      </wadl:request>
      <wadl:response><wadl:representation href="#processor-page"/></wadl:response>
    </wadl:method>
    <wadl:method name="GET" id="archive-mixedResponses">
      <wadl:request><wadl:param name="ws.op" fixed="mixedResponses"/></wadl:request>
      <wadl:response status="200 206">
        <wadl:representation href="#source_package_publishing_history-page" mediaType="application/json"/>
        <wadl:representation href="#processor-page" mediaType="application/json"/>
        <wadl:representation href="#archive-full" mediaType="application/json"/>
        <wadl:representation href="#processor-page" mediaType="application/vnd.launchpad+json; charset=UTF-8"/>
        <wadl:representation href="#processor-page" mediaType="text/csv"/>
      </wadl:response>
      <wadl:response status="201"><wadl:representation href="#archive-full" mediaType="application/json"/></wadl:response>
      <wadl:response status="400"><wadl:representation href="#processor-page" mediaType="application/json"/></wadl:response>
    </wadl:method>
    <wadl:method name="GET" id="archive-failureOnly">
      <wadl:request><wadl:param name="ws.op" fixed="failureOnly"/></wadl:request>
      <wadl:response status="400"><wadl:representation href="#processor-page" mediaType="application/json"/></wadl:response>
    </wadl:method>
    <wadl:method name="GET" id="archive-nonJsonOnly">
      <wadl:request><wadl:param name="ws.op" fixed="nonJsonOnly"/></wadl:request>
      <wadl:response status="200"><wadl:representation href="#processor-page" mediaType="text/csv"/></wadl:response>
    </wadl:method>
    <wadl:method name="GET" id="archive-statuslessNonJson">
      <wadl:request><wadl:param name="ws.op" fixed="statuslessNonJson"/></wadl:request>
      <wadl:response><wadl:representation href="#processor-page" mediaType="text/csv"/></wadl:response>
    </wadl:method>
    <wadl:method name="GET" id="archive-unresolved">
      <wadl:request><wadl:param name="ws.op" fixed="unresolved"/></wadl:request>
      <wadl:response><wadl:representation href="#missing-page"/></wadl:response>
    </wadl:method>
    <wadl:method name="GET" id="archive-explicitUnresolved">
      <wadl:request><wadl:param name="ws.op" fixed="explicitUnresolved"/></wadl:request>
      <wadl:response status="206"><wadl:representation href="#missing-page" mediaType="application/json"/></wadl:response>
    </wadl:method>
    <wadl:method name="GET" id="archive-rawArray">
      <wadl:doc>:return: A collection of URLs.</wadl:doc>
      <wadl:request><wadl:param name="ws.op" fixed="rawArray"/></wadl:request>
    </wadl:method>
    <wadl:method name="GET" id="archive-untyped">
      <wadl:doc>:return: A collection of entries.</wadl:doc>
      <wadl:request><wadl:param name="ws.op" fixed="untyped"/></wadl:request>
    </wadl:method>
    <wadl:method name="GET" id="archive-singleEntry">
      <wadl:doc>:return: A collection of URLs.</wadl:doc>
      <wadl:request><wadl:param name="ws.op" fixed="singleEntry"/></wadl:request>
      <wadl:response><wadl:representation href="#archive-full"/></wadl:response>
    </wadl:method>
    <wadl:method name="POST" id="archive-nonGet">
      <wadl:request><wadl:param name="ws.op" fixed="nonGet"/></wadl:request>
      <wadl:response status="200"><wadl:representation href="#processor-page" mediaType="application/json"/></wadl:response>
    </wadl:method>
  </wadl:resource_type>
  <wadl:resource_type id="processors">
    <wadl:method name="GET" id="processors-get">
      <wadl:response><wadl:representation href="#processor-page"/></wadl:response>
    </wadl:method>
  </wadl:resource_type>
  <wadl:resource_type id="people">
    <wadl:method name="GET" id="people-get">
      <wadl:request>
        <wadl:param name="ws.start" type="xsd:string" required="true"/>
        <wadl:param name="filter" type="xsd:boolean" required="true"/>
        <wadl:param name="ws.show" type="xsd:string"/>
      </wadl:request>
      <wadl:response status="206"><wadl:representation href="#processor-page" mediaType="application/json"/></wadl:response>
    </wadl:method>
  </wadl:resource_type>
  <wadl:resource_type id="project">
    <wadl:method name="GET" id="project-get">
      <wadl:response status="404"><wadl:representation href="#processor-page" mediaType="application/json"/></wadl:response>
    </wadl:method>
  </wadl:resource_type>
  <wadl:representation id="archive-full" mediaType="application/json">
    <wadl:param name="name" type="xsd:string" required="true"/>
  </wadl:representation>
  <wadl:representation id="source_package_publishing_history-full" mediaType="application/json">
    <wadl:param name="self_link" type="xsd:anyURI" required="true"/>
    <wadl:param name="source_package_name" type="xsd:string" required="true"/>
  </wadl:representation>
  <wadl:representation id="processor-full" mediaType="application/json">
    <wadl:param name="self_link" type="xsd:anyURI" required="true"/>
    <wadl:param name="name" type="xsd:string" required="true"/>
  </wadl:representation>
  <wadl:representation id="source_package_publishing_history-page" mediaType="application/json">
    <wadl:param name="start" required="true"/>
    <wadl:param name="entries" required="true"/>
    <wadl:param name="total_size"/>
    <wadl:param name="total_size_link" type="xsd:anyURI"/>
    <wadl:param name="next_collection_link" type="xsd:anyURI"/>
    <wadl:param name="prev_collection_link" type="xsd:anyURI"/>
    <wadl:param name="entry_links" path="$['entries'][*]['self_link']">
      <wadl:link resource_type="#source_package_publishing_history"/>
    </wadl:param>
  </wadl:representation>
  <wadl:representation id="processor-page" mediaType="application/json">
    <wadl:param name="start" required="true"/>
    <wadl:param name="entries" required="true"/>
    <wadl:param name="total_size"/>
    <wadl:param name="total_size_link" type="xsd:anyURI"/>
    <wadl:param name="next_collection_link" type="xsd:anyURI"/>
    <wadl:param name="prev_collection_link" type="xsd:anyURI"/>
    <wadl:param name="entry_links" path="$['entries'][*]['self_link']">
      <wadl:link resource_type="#processor"/>
    </wadl:param>
  </wadl:representation>
</wadl:application>`;

/** Selected fields from read-only production pages, plus a source-backed empty page. */
export const collectionPageBodies = {
  normal: {
    start: 0,
    total_size_link:
      "https://api.launchpad.net/devel/ubuntu/+archive/primary?ws.op=getPublishedSources&ws.show=total_size",
    next_collection_link:
      "https://api.launchpad.net/devel/ubuntu/+archive/primary?ws.op=getPublishedSources&ws.size=1&memo=1&ws.start=1",
    entries: [
      {
        self_link:
          "https://api.launchpad.net/devel/ubuntu/+archive/primary/+sourcepub/15997651",
        source_package_name: "hello",
      },
    ],
  },
  last: {
    start: 2,
    total_size: 3,
    prev_collection_link:
      "https://api.launchpad.net/devel/ubuntu/+archive/primary?ws.op=getPublishedSources&ws.size=1&direction=backwards&memo=2&ws.start=1",
    entries: [
      {
        self_link:
          "https://api.launchpad.net/devel/ubuntu/+archive/primary/+sourcepub/15920299",
        source_package_name: "hello",
      },
    ],
  },
  empty: { start: 0, total_size: 0, entries: [] },
  standard: {
    start: 1,
    total_size: 14,
    next_collection_link:
      "https://api.launchpad.net/devel/+processors?ws.size=1&memo=2&ws.start=2",
    prev_collection_link:
      "https://api.launchpad.net/devel/+processors?ws.size=1&direction=backwards&memo=1",
    entries: [
      {
        self_link: "https://api.launchpad.net/devel/+processors/sparc",
        name: "sparc",
      },
    ],
  },
};
