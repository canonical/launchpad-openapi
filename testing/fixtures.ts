/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

/**
 * Shared static fixtures for parser, generator, and conversion-flow tests.
 *
 * The WADL is intentionally compact but covers every supported representation,
 * operation, path, and special-resource branch used by the conversion pipeline.
 */

/** A branch-complete Launchpad-style WADL document. */
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

/** A valid WADL document with no resource types. */
export const emptyWadl = `<?xml version="1.0"?>
<wadl:application xmlns:wadl="http://research.sun.com/wadl/2006/10">
  <wadl:resources base="https://api.launchpad.test/devel/"/>
</wadl:application>`;

/** A document without the required WADL application root. */
export const notWadl = `<not-application/>`;

/** Runtime links whose path segments differ from WADL field names. */
export const serviceRootLinks: Record<string, string> = {
  people_collection_link: "https://api.launchpad.test/1.0/people/",
  me_link: "https://api.launchpad.test/1.0/people/+me/",
};
