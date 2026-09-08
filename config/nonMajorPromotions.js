/**
 * Whitelisted promotions Tapology does NOT tag "major" (verified by
 * exhaustively scraping the entire group=major upcoming listing and
 * confirming these never appear there, despite having real upcoming
 * events). The main fightcenter listing can never surface their events, so
 * we walk each one's own Tapology promotion page directly instead.
 */
module.exports = {
  UFCBJJ: "https://www.tapology.com/fightcenter/promotions/6208-ufc-bjj-ubjj",
  MATCHROOM: "https://www.tapology.com/fightcenter/promotions/2484-matchroom-boxing-mb",
  "TOP RANK": "https://www.tapology.com/fightcenter/promotions/2487-top-rank-tr",
  MVP: "https://www.tapology.com/fightcenter/promotions/4040-most-valuable-promotions-mvp",
  RAF: "https://www.tapology.com/fightcenter/promotions/6307-real-american-freestyle-raf",
  BKFC: "https://www.tapology.com/fightcenter/promotions/2682-bare-knuckle-fighting-championship-bnfc",
  "KARATE COMBAT": "https://www.tapology.com/fightcenter/promotions/3637-karate-combat-kc",
};
