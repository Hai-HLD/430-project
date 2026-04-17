(function () {
  const listEl = document.getElementById("staff-ticket-list");
  const emptyEl = document.getElementById("staff-empty");
  const panelEl = document.getElementById("staff-panel");
  const threadEl = document.getElementById("staff-thread");
  const topicEl = document.getElementById("staff-topic");
  const statusBadgeEl = document.getElementById("staff-status-badge");
  const closeTicketBtn = document.getElementById("staff-close-ticket");
  const loadErrEl = document.getElementById("staff-load-error");
  const replyForm = document.getElementById("staff-reply-form");
  const replyText = document.getElementById("staff-reply-text");
  const replyError = document.getElementById("staff-reply-error");

  if (!listEl || !emptyEl || !panelEl || !threadEl || !topicEl) return;

  let tickets = [];
  let selectedId = null;
  let lastReplyTicketId = null;
  const detailCache = new Map();
  let pollTimer = null;
  let pollInFlight = false;
  const POLL_MS = 2500;

  function listSnapshotKey(arr) {
    return JSON.stringify(
      (arr || []).map(function (t) {
        return [t.ticketId, t.lastUpdated || "", t.ticketTitle || "", t.ticketStatus || ""];
      })
    );
  }

  function detailFingerprint(d) {
    if (!d || !d.ticket) return "";
    var msgs = d.messages || [];
    var tail = msgs.length ? msgs[msgs.length - 1].messageId : 0;
    return [
      d.ticket.ticketTitle || "",
      d.ticket.lastUpdated || "",
      d.ticket.ticketStatus || "",
      msgs.length,
      tail,
    ].join("|");
  }

  function showLoadError(msg) {
    if (!loadErrEl) return;
    loadErrEl.textContent = msg || "";
    loadErrEl.hidden = !msg;
  }

  function showReplyError(msg) {
    if (!replyError) return;
    replyError.textContent = msg || "";
    replyError.hidden = !msg;
  }

  function isClosedStatus(status) {
    return /^closed$/i.test(String(status || "").trim());
  }

  function updateStaffHeader(detail) {
    var isCl = detail && isClosedStatus(detail.ticket.ticketStatus);
    if (statusBadgeEl) {
      statusBadgeEl.hidden = false;
      statusBadgeEl.textContent = isCl ? "Closed" : "Open";
      statusBadgeEl.className =
        "staff-status-badge " +
        (isCl ? "staff-status-badge--closed" : "staff-status-badge--open");
    }
    if (closeTicketBtn) {
      closeTicketBtn.hidden = false;
      closeTicketBtn.disabled = !!isCl;
    }
  }

  function renderMessageBubble(m) {
    const wrap = document.createElement("div");
    const isCustomer = m.from === "user";
    wrap.className = "staff-msg staff-msg--" + (isCustomer ? "customer" : "support");
    const label = document.createElement("div");
    label.className = "staff-msg-label";
    label.textContent = isCustomer ? "Customer" : "RentIS Support";
    const body = document.createElement("div");
    body.className = "staff-msg-body";
    if (isCustomer || !m.isHtml) {
      body.textContent = m.content;
    } else {
      body.innerHTML = m.content;
      body.querySelectorAll("a").forEach(function (a) {
        a.classList.add("staff-inline-link");
      });
    }
    wrap.appendChild(label);
    wrap.appendChild(body);
    return wrap;
  }

  function renderThreadFromDetail(detail, opts) {
    threadEl.innerHTML = "";
    topicEl.textContent = detail.ticket.ticketTitle || "";
    updateStaffHeader(detail);
    (detail.messages || []).forEach(function (m) {
      threadEl.appendChild(renderMessageBubble(m));
    });

    if (opts && opts.scrollToEnd && threadEl.lastElementChild) {
      requestAnimationFrame(function () {
        threadEl.lastElementChild.scrollIntoView({ behavior: "smooth", block: "end" });
      });
    }
  }

  function updateSelectionFromHash() {
    const h = decodeURIComponent((location.hash || "").replace(/^#/, ""));
    if (h && tickets.some(function (t) { return String(t.ticketId) === h; })) {
      selectedId = h;
      return;
    }
    selectedId = tickets.length ? String(tickets[0].ticketId) : null;
  }

  async function ensureDetail(ticketId, forceRefresh) {
    if (!forceRefresh && detailCache.has(ticketId)) return detailCache.get(ticketId);
    try {
      const res = await fetch("/api/tickets/" + encodeURIComponent(String(ticketId)), {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return null;
      const detail = await res.json();
      detailCache.set(ticketId, detail);
      return detail;
    } catch {
      return null;
    }
  }

  async function loadDetailForSelection() {
    const current = tickets.find(function (t) { return String(t.ticketId) === String(selectedId); });
    if (!current) return;

    if (lastReplyTicketId !== current.ticketId) {
      lastReplyTicketId = current.ticketId;
      if (replyText) replyText.value = "";
      showReplyError("");
    }

    const detail = await ensureDetail(current.ticketId, false);
    if (detail) renderThreadFromDetail(detail, null);
  }

  async function pollForUpdates() {
    if (document.hidden || pollInFlight) return;
    pollInFlight = true;
    try {
      var listRes = await fetch("/api/tickets", { headers: { Accept: "application/json" } });
      if (!listRes.ok) return;
      var newTickets = await listRes.json();

      if (listSnapshotKey(tickets) !== listSnapshotKey(newTickets)) {
        tickets = newTickets;
        renderList();
        return;
      }

      var current = tickets.find(function (t) {
        return String(t.ticketId) === String(selectedId);
      });
      if (!current) return;

      var dRes = await fetch("/api/tickets/" + encodeURIComponent(String(current.ticketId)), {
        headers: { Accept: "application/json" },
      });
      if (!dRes.ok) return;
      var detail = await dRes.json();
      var prev = detailCache.get(current.ticketId);
      if (detailFingerprint(prev) === detailFingerprint(detail)) return;

      detailCache.set(current.ticketId, detail);
      renderThreadFromDetail(detail, { scrollToEnd: true });
    } catch {
      /* ignore transient errors while polling */
    } finally {
      pollInFlight = false;
    }
  }

  function startPolling() {
    if (pollTimer != null) return;
    pollTimer = setInterval(pollForUpdates, POLL_MS);
  }

  function stopPolling() {
    if (pollTimer != null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function renderList() {
    listEl.innerHTML = "";
    if (!tickets.length) {
      emptyEl.hidden = false;
      panelEl.hidden = true;
      topicEl.textContent = "";
      if (statusBadgeEl) statusBadgeEl.hidden = true;
      if (closeTicketBtn) closeTicketBtn.hidden = true;
      selectedId = null;
      return;
    }

    emptyEl.hidden = true;
    panelEl.hidden = false;
    updateSelectionFromHash();

    tickets.forEach(function (ticket) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "staff-ticket-btn";
      btn.textContent =
        "Ticket #" +
        ticket.ticketId +
        (isClosedStatus(ticket.ticketStatus) ? " · Closed" : "");
      btn.setAttribute("aria-pressed", String(ticket.ticketId) === selectedId ? "true" : "false");
      if (String(ticket.ticketId) === selectedId) btn.classList.add("is-active");

      btn.addEventListener("click", function () {
        location.hash = String(ticket.ticketId);
        selectedId = String(ticket.ticketId);
        renderList();
        loadDetailForSelection();
      });

      listEl.appendChild(btn);
    });

    loadDetailForSelection();
  }

  async function init() {
    showLoadError("");
    try {
      const res = await fetch("/api/tickets", { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("bad status");
      tickets = await res.json();
    } catch {
      tickets = [];
      showLoadError(
        "Could not load tickets. Start the API server and open this page from the same host (for example http://localhost:5050/pages/staff.html)."
      );
    }
    renderList();
    startPolling();
  }

  if (closeTicketBtn) {
    closeTicketBtn.addEventListener("click", async function () {
      var current = tickets.find(function (t) {
        return String(t.ticketId) === String(selectedId);
      });
      if (!current || closeTicketBtn.disabled) return;

      closeTicketBtn.disabled = true;
      try {
        var res = await fetch(
          "/api/staff/tickets/" + encodeURIComponent(String(current.ticketId)) + "/close",
          { method: "POST" }
        );
        if (res.ok) {
          detailCache.delete(current.ticketId);
          var lr = await fetch("/api/tickets", { headers: { Accept: "application/json" } });
          if (lr.ok) tickets = await lr.json();
          renderList();
        } else {
          var cached = detailCache.get(current.ticketId);
          closeTicketBtn.disabled = cached
            ? isClosedStatus(cached.ticket.ticketStatus)
            : false;
        }
      } catch {
        var d = detailCache.get(current.ticketId);
        closeTicketBtn.disabled = d ? isClosedStatus(d.ticket.ticketStatus) : false;
      }
    });
  }

  if (replyForm && replyText) {
    replyForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      showReplyError("");

      const current = tickets.find(function (t) { return String(t.ticketId) === String(selectedId); });
      if (!current) return;

      const text = replyText.value.trim();
      if (!text) {
        replyText.focus();
        return;
      }

      const submitBtn = replyForm.querySelector(".staff-btn-send");
      if (submitBtn) submitBtn.disabled = true;

      try {
        const res = await fetch(
          "/api/staff/tickets/" + encodeURIComponent(String(current.ticketId)) + "/messages",
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ content: text }),
          }
        );

        if (res.ok) {
          detailCache.delete(current.ticketId);
          replyText.value = "";
          const detail = await ensureDetail(current.ticketId, true);
          if (detail) renderThreadFromDetail(detail, { scrollToEnd: true });
          replyText.focus();
          return;
        }

        let data = null;
        try {
          data = await res.json();
        } catch {
          data = null;
        }
        showReplyError((data && data.error) || "Could not send reply. Please try again.");
      } catch {
        showReplyError("Network error. Check that the API server is running.");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  init();

  window.addEventListener("hashchange", function () {
    renderList();
  });

  window.addEventListener("beforeunload", stopPolling);
})();
