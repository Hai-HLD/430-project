(function () {
  const form = document.getElementById("ticket-form");
  const topicSelect = document.getElementById("ticket-topic");
  const customWrap = document.getElementById("ticket-custom-wrap");
  const customInput = document.getElementById("ticket-custom-topic");
  const errEl = document.getElementById("ticket-form-error");

  if (!form || !topicSelect || !customWrap || !customInput) return;

  function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || "";
    errEl.hidden = !msg;
  }

  function syncCustomField() {
    const isCustom = topicSelect.value === "custom";
    customWrap.hidden = !isCustom;
    customInput.required = isCustom;
    if (!isCustom) customInput.value = "";
  }

  topicSelect.addEventListener("change", syncCustomField);
  syncCustomField();

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    showError("");

    const topicKey = topicSelect.value;
    const description = document.getElementById("ticket-description").value;
    if (!topicKey || !description.trim()) return;

    let customTitle = null;
    if (topicKey === "custom") {
      const t = customInput.value.trim();
      if (!t) {
        customInput.focus();
        return;
      }
      customTitle = t;
    }

    const submitBtn = form.querySelector(".ticket-submit");
    if (submitBtn) submitBtn.disabled = true;

    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          topicKey,
          customTitle,
          description: description.trim(),
        }),
      });

      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok) {
        const msg =
          (data && data.error) ||
          "Could not submit your ticket. Please try again or check that the site is running from the API server.";
        showError(msg);
        return;
      }

      if (data && data.ticketId != null) {
        window.location.href = "my-ticket.html#" + encodeURIComponent(String(data.ticketId));
        return;
      }

      showError("Unexpected response from server.");
    } catch {
      showError("Network error. Run the RentIS API (see README) and use the site from that address.");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
})();
