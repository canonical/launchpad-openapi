/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

/** WADL test inputs, with runtime links kept beside the sample they describe. */

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

/** Synthetic resource representations for observed full-field types and independent diff fields. */
export const resourceFieldContractsWadl = `<?xml version="1.0"?>
<wadl:application xmlns:wadl="http://research.sun.com/wadl/2006/10"
                  xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <wadl:resources base="https://api.launchpad.test/devel/"/>
  <wadl:representation mediaType="application/json" id="bug-full">
    <wadl:param name="id" required="true"/>
    <wadl:param name="heat" required="true"/>
    <wadl:param name="private" required="true"/>
    <wadl:param name="security_related"/>
    <wadl:param name="tags" required="true"/>
    <wadl:param name="duplicate_of_link" required="true">
      <wadl:link resource_type="#bug"/>
    </wadl:param>
    <wadl:param name="opaque_payload"/>
  </wadl:representation>
  <wadl:representation mediaType="application/json" id="bug-diff">
    <wadl:param name="private" type="xsd:string"/>
  </wadl:representation>
  <wadl:representation mediaType="application/json" id="project-full">
    <wadl:param name="active" required="true"/>
    <wadl:param name="licenses" required="true"/>
    <wadl:param name="content_templates" required="true"/>
  </wadl:representation>
  <wadl:representation mediaType="application/json" id="project-diff">
    <wadl:param name="content_templates" type="xsd:string"/>
  </wadl:representation>
  <wadl:representation mediaType="application/json" id="distribution-full">
    <wadl:param name="content_templates" required="true"/>
  </wadl:representation>
  <wadl:representation mediaType="application/json" id="archive-full">
    <wadl:param name="relative_build_score" required="true"/>
    <wadl:param name="authorized_size" required="true"/>
  </wadl:representation>
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
