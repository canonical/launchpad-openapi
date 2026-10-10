/*
 * Copyright 2026 Canonical Ltd. This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

/* oxlint-disable unicorn/require-post-message-target-origin -- Worker messaging has no Window targetOrigin. */

/**
 * Wire the accessible search dialog to its worker and Scalar's hash navigation.
 * @note Impure — owns worker, DOM listeners, timers and dialog lifecycle.
 */
export default function createSearch() {
  const opener = document.getElementById("lp-open-search");
  const trigger = document.getElementById("lp-search-trigger");
  const mobileHost = document.getElementById("lp-mobile-search");
  const desktopLayout = matchMedia("(min-width: 1024px)");
  const isApple = /Mac|iPhone|iPad|iPod/i.test(
    navigator.userAgentData?.platform ?? navigator.platform,
  );
  document.getElementById("lp-search-modifier").textContent = isApple
    ? "⌘"
    : "Ctrl";
  opener.setAttribute("aria-keyshortcuts", isApple ? "Meta+K" : "Control+K");
  const dialog = document.getElementById("lp-search");
  const input = document.getElementById("lp-search-query");
  const list = document.getElementById("lp-search-results");
  const status = document.getElementById("lp-search-status");
  const closeButton = document.getElementById("lp-close-search");
  const ready = new Set();
  const sent = new Set();
  const startupTimers = new Map();
  const listeners = new AbortController();
  let worker;
  let workerUrl;
  let environment;
  let sequence = 0;
  let selected = -1;
  let results = [];
  let timer;
  let queryTimeout;
  let failure;
  let restoreFocus;

  /** @note Impure — restores the search control to Scalar's sidebar header after rendering/source changes. */
  function mountTrigger() {
    if (!environment) return;
    if (desktopLayout.matches) {
      const sidebar = document.querySelector("#app aside");
      if (!sidebar) return;
      // Scalar 1.73.1 places its search/AI row immediately after the source picker.
      const headerRow = sidebar.querySelector(
        ":scope > .document-selector + div:not(#lp-search-trigger)",
      );
      if (headerRow) {
        if (trigger.parentElement !== headerRow) headerRow.prepend(trigger);
        trigger.classList.add("lp-search-trigger--inline");
      } else {
        const picker = sidebar.querySelector(".document-selector");
        if (trigger.parentElement !== sidebar)
          sidebar.insertBefore(
            trigger,
            picker?.nextSibling ?? sidebar.firstChild,
          );
        trigger.classList.remove("lp-search-trigger--inline");
      }
      mobileHost.hidden = true;
    } else {
      if (trigger.parentElement !== mobileHost) mobileHost.append(trigger);
      trigger.classList.remove("lp-search-trigger--inline");
      mobileHost.hidden = false;
    }
    trigger.hidden = false;
  }

  desktopLayout.addEventListener("change", mountTrigger, {
    signal: listeners.signal,
  });

  /** @note Impure — releases the script only after startup or worker termination. */
  function releaseWorkerUrl() {
    if (workerUrl) URL.revokeObjectURL(workerUrl);
    workerUrl = undefined;
  }

  /** @note Impure — announces search status without rendering untrusted HTML. */
  function setStatus(message) {
    status.textContent = message;
  }

  /** @note Impure — invalidates outstanding results before the query or source changes. */
  function clearResults() {
    sequence++;
    clearTimeout(timer);
    clearTimeout(queryTimeout);
    results = [];
    selected = -1;
    input.removeAttribute("aria-activedescendant");
    list.replaceChildren();
  }

  /** @note Impure — leaves the reference usable when the worker is unavailable. */
  function failSearch(message) {
    failure = message;
    clearResults();
    worker?.terminate();
    worker = undefined;
    releaseWorkerUrl();
    for (const timeout of startupTimers.values()) clearTimeout(timeout);
    startupTimers.clear();
    list.removeAttribute("aria-busy");
    setStatus(`Search unavailable: ${message}. Reload the page to retry.`);
  }

  /** @note Impure — highlights one bounded result and keeps keyboard focus on the input. */
  function selectResult(index) {
    selected = index;
    for (const [position, option] of [...list.children].entries()) {
      option.setAttribute("aria-selected", String(position === selected));
    }
    const option = list.children[selected];
    if (option) {
      input.setAttribute("aria-activedescendant", option.id);
      option.scrollIntoView({ block: "nearest" });
    } else input.removeAttribute("aria-activedescendant");
  }

  /** @note Impure — uses Scalar's existing popstate/deep-link handler, including same-section clicks. */
  function navigateTo(index) {
    const result = results[index];
    if (!result || !dialog.open) return;
    const target = new URL(location.href);
    target.hash = result.id;
    dialog.close();
    if (target.hash === location.hash)
      window.dispatchEvent(new PopStateEvent("popstate"));
    else location.hash = target.hash;
  }

  /** @note Impure — renders only the small result summaries returned by the worker. */
  function renderResults(items) {
    results = items;
    selected = -1;
    input.removeAttribute("aria-activedescendant");
    const fragment = document.createDocumentFragment();
    for (const [index, result] of results.entries()) {
      const option = document.createElement("a");
      const target = new URL(location.href);
      target.hash = result.id;
      option.href = target.href;
      option.id = `search-result-${result.id}`;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      option.tabIndex = -1;
      const title = document.createElement("strong");
      title.textContent = result.title;
      const detail = document.createElement("span");
      detail.textContent = result.path
        ? `${result.method} ${result.path}`
        : result.type;
      option.append(title, detail);
      option.addEventListener("click", (event) => {
        if (
          event.button ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        navigateTo(index);
      });
      fragment.append(option);
    }
    list.replaceChildren(fragment);
    list.removeAttribute("aria-busy");
    setStatus(
      results.length ? `${results.length} results` : "No results found",
    );
  }

  /** @note Impure — sends only query text and IDs, never reparsing or copying a spec per keystroke. */
  function sendQuery() {
    if (!dialog.open || !environment || failure) return;
    if (!ready.has(environment)) {
      setStatus("Building search index…");
      return;
    }
    const requestId = sequence;
    clearTimeout(queryTimeout);
    worker.postMessage({
      type: "search",
      environment,
      requestId,
      query: input.value,
    });
    queryTimeout = setTimeout(
      () => failSearch("The search worker did not respond"),
      15000,
    );
  }

  /** @note Impure — prevents stale query/environment replies from restoring selectable results. */
  function receiveMessage({ data }) {
    releaseWorkerUrl();
    if (data.type === "ready") {
      clearTimeout(startupTimers.get(data.environment));
      startupTimers.delete(data.environment);
      ready.add(data.environment);
      if (data.environment === environment && dialog.open) sendQuery();
    } else if (data.type === "error") {
      if (
        data.environment === environment &&
        (data.requestId === undefined || data.requestId === sequence)
      )
        failSearch(data.message);
    } else if (
      data.type === "results" &&
      dialog.open &&
      data.environment === environment &&
      data.requestId === sequence
    ) {
      clearTimeout(queryTimeout);
      renderResults(data.results);
    }
  }

  /** @note Impure — creates the single embedded worker, surfacing blocked Blob workers explicitly. */
  function startWorker() {
    if (worker || failure) return;
    try {
      const source = document.getElementById("lp-search-worker").textContent;
      workerUrl = URL.createObjectURL(
        new Blob([source], { type: "text/javascript" }),
      );
      // Firefox can fetch a Blob script asynchronously after construction.
      // Retain its URL until the first reply confirms that startup completed.
      worker = new Worker(workerUrl, { name: "launchpad-search" });
      worker.addEventListener("message", receiveMessage);
      worker.addEventListener("error", (event) => {
        event.preventDefault();
        failSearch(event.message || "The search worker failed");
      });
      worker.addEventListener("messageerror", () =>
        failSearch("The search worker sent an unreadable response"),
      );
    } catch (error) {
      failSearch(error.message);
    }
  }

  /** @note Impure — opens instantly; indexing and queries remain asynchronous. */
  function openSearch() {
    if (!environment || dialog.open) return;
    restoreFocus = document.activeElement;
    clearResults();
    input.value = "";
    dialog.showModal();
    input.focus();
    if (failure)
      setStatus(`Search unavailable: ${failure}. Reload the page to retry.`);
    else {
      list.setAttribute("aria-busy", "true");
      setStatus("Searching…");
      sendQuery();
    }
  }

  opener.addEventListener("click", openSearch, { signal: listeners.signal });
  closeButton.addEventListener("click", () => dialog.close(), {
    signal: listeners.signal,
  });
  dialog.addEventListener(
    "close",
    () => {
      clearResults();
      restoreFocus?.focus();
    },
    { signal: listeners.signal },
  );
  dialog.addEventListener(
    "click",
    (event) => {
      if (event.target === dialog) {
        const bounds = dialog.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          dialog.close();
      }
    },
    { signal: listeners.signal },
  );
  dialog.addEventListener(
    "keydown",
    (event) => {
      // Search inputs consume Escape to clear themselves in some browsers.
      // Close the modal explicitly on the first press instead.
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dialog.close();
      }
    },
    { signal: listeners.signal },
  );
  input.addEventListener(
    "input",
    () => {
      clearResults();
      if (failure) return;
      list.setAttribute("aria-busy", "true");
      setStatus("Searching…");
      timer = setTimeout(sendQuery, 60);
    },
    { signal: listeners.signal },
  );
  input.addEventListener(
    "keydown",
    (event) => {
      if (event.isComposing) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (!results.length) return;
        selectResult(
          event.key === "ArrowDown"
            ? (selected + 1) % results.length
            : selected < 0
              ? results.length - 1
              : (selected - 1 + results.length) % results.length,
        );
      } else if (event.key === "Enter") {
        event.preventDefault();
        navigateTo(selected);
      }
    },
    { signal: listeners.signal },
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (!opener.disabled) openSearch();
      }
    },
    { signal: listeners.signal },
  );

  return {
    /** @note Impure — initializes each source once and reuses its worker index on return. */
    setEnvironment(slug) {
      if (!document.getElementById(`spec-${slug}`)) return;
      clearResults();
      if (dialog.open) dialog.close();
      environment = slug;
      startWorker();
      if (worker && !sent.has(slug)) {
        sent.add(slug);
        startupTimers.set(
          slug,
          setTimeout(
            () => failSearch("The search index did not become ready"),
            30000,
          ),
        );
        try {
          worker.postMessage({
            type: "init",
            environment: slug,
            json: document.getElementById(`spec-${slug}`).textContent,
          });
        } catch (error) {
          failSearch(error.message);
        }
      }
      requestAnimationFrame(() => {
        if (environment === slug) {
          mountTrigger();
          opener.disabled = false;
        }
      });
    },
    /** @note Impure — disables stale-source interaction during Scalar's document switch. */
    pause() {
      opener.disabled = true;
      environment = undefined;
      clearResults();
      if (dialog.open) dialog.close();
    },
    /** @note Impure — releases worker, DOM listeners, queued queries and timers on page exit. */
    destroy() {
      listeners.abort();
      clearResults();
      for (const timeout of startupTimers.values()) clearTimeout(timeout);
      startupTimers.clear();
      worker?.terminate();
      worker = undefined;
      releaseWorkerUrl();
    },
  };
}
