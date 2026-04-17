(function () {
  const tablist = document.querySelector(".faq-tablist");
  if (!tablist) return;

  const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
  const panels = Array.from(document.querySelectorAll('[role="tabpanel"]'));

  function selectTab(tab) {
    const panelId = tab.getAttribute("aria-controls");
    const panel = panelId ? document.getElementById(panelId) : null;

    tabs.forEach((t) => {
      const selected = t === tab;
      t.setAttribute("aria-selected", selected ? "true" : "false");
      t.tabIndex = selected ? 0 : -1;
    });

    panels.forEach((p) => {
      const active = p === panel;
      p.classList.toggle("is-active", active);
      p.hidden = !active;
    });
  }

  tablist.addEventListener("click", (e) => {
    const tab = e.target.closest('[role="tab"]');
    if (!tab || !tablist.contains(tab)) return;
    e.preventDefault();
    selectTab(tab);
    tab.focus();
  });

  tablist.addEventListener("keydown", (e) => {
    const tab = e.target.closest('[role="tab"]');
    if (!tab || !tablist.contains(tab)) return;

    const idx = tabs.indexOf(tab);
    let next = null;

    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      next = tabs[(idx + 1) % tabs.length];
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      next = tabs[(idx - 1 + tabs.length) % tabs.length];
    } else if (e.key === "Home") {
      e.preventDefault();
      next = tabs[0];
    } else if (e.key === "End") {
      e.preventDefault();
      next = tabs[tabs.length - 1];
    }

    if (next) {
      selectTab(next);
      next.focus();
    }
  });

  const hashToTabId = {
    ranking: "tab-ranking",
    recommendations: "tab-recommendations",
    pricing: "tab-pricing",
  };
  const hashKey = (location.hash || "").replace(/^#/, "");
  const tabFromHash = hashKey ? document.getElementById(hashToTabId[hashKey] || "") : null;

  if (tabFromHash && tabs.includes(tabFromHash)) {
    selectTab(tabFromHash);
  } else {
    const initial =
      tabs.find((t) => t.getAttribute("aria-selected") === "true") || tabs[0];
    if (initial) selectTab(initial);
  }
})();
