(function () {
  const TOPIC_LABELS = {
    ranking: "Why are my listings ranked lower than other listings similar to me?",
    recommendations:
      "Why am I being recommended more expensive listings when there are similar ones at a lower price?",
    pricing: "Why are the pricing suggestions always lower than what I expected?",
  };

  function isPresetFaqTopic(topicKey) {
    return topicKey === "ranking" || topicKey === "recommendations" || topicKey === "pricing";
  }

  /** @param {{ ticketTitle?: string }} ticket */
  function getTopicTitle(ticket) {
    if (!ticket) return "";
    return ticket.ticketTitle || "";
  }

  window.RentISTickets = {
    TOPIC_LABELS,
    isPresetFaqTopic,
    getTopicTitle,
  };
})();
