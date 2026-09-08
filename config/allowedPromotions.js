/**
 * Only events from these promotions are kept; everything else is skipped.
 * Keys are the exact "Promotion:" text Tapology renders on the event page.
 * Tapology treats each of these as its own independent promotion (e.g. Dana
 * White's Contender Series isn't linked to the UFC in Tapology's data), so
 * they're listed separately here too rather than merged.
 */
module.exports = {
  "Ultimate Fighting Championship": "UFC",
  "UFC BJJ": "UFCBJJ",
  "Dana White's Contender Series": "DWCS",
  "Professional Fighters League": "PFL",
  "RIZIN Fighting Federation": "RIZIN",
  "ONE Championship": "ONE",
  "Zuffa Boxing": "ZUFFA",
  "Matchroom Boxing": "MATCHROOM",
  "Top Rank": "TOP RANK",
  "Most Valuable Promotions": "MVP",
  "Real American Freestyle": "RAF",
  "Bare Knuckle Fighting Championship": "BKFC",
  "Karate Combat": "KARATE COMBAT",
};
