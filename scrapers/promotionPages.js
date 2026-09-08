const cheerio = require("cheerio");
const NON_MAJOR_PROMOTIONS = require("../config/nonMajorPromotions");
const { baseUrl, delay, fetchHtml, isBlockedResponse } = require("./browserFetch");

// Safety backstop; in practice these promotions stop after 1-2 pages (the
// real stop condition is "crossed into past-dated events").
const MAX_PROMOTION_PAGES = 10;

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const startOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

/**
 * Parses Tapology's promotion-page date text into a Date, or null if it
 * can't be parsed. Handles both formats Tapology uses depending on how far
 * out the event is:
 *   "Friday, October 23, 4:00 PM ET"  (near-term: has a time, no year)
 *   "Saturday, June 13, 2026"          (far-out: has a year, no time)
 * When no year is given, infers the current year unless that would put the
 * date more than ~6 months in the past, in which case it must mean next
 * year (handles events that roll over a year boundary).
 */
const parseTapologyDate = (text, referenceDate = new Date()) => {
  if (!text) return null;

  // Unanchored and scanned for the first match with a real month name -
  // event titles routinely contain "word + number" patterns of their own
  // (e.g. "RAF 14", "UFC 331") that would otherwise false-match first.
  for (const match of text.matchAll(/([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?/g)) {
    const monthIndex = MONTHS.indexOf(match[1].toLowerCase());
    if (monthIndex === -1) continue;

    const day = parseInt(match[2], 10);
    const explicitYear = match[3] ? parseInt(match[3], 10) : null;
    const year = explicitYear ?? referenceDate.getFullYear();

    let date = new Date(year, monthIndex, day);

    if (explicitYear === null) {
      const sixMonthsAgo = new Date(referenceDate);
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      if (date < sixMonthsAgo) {
        date = new Date(year + 1, monthIndex, day);
      }
    }

    return date;
  }

  return null;
};

/**
 * Extracts events from a promotion's own event-list page (not the main
 * fightcenter listing). Scoped to the real event-list rows specifically
 * (class "border-tap_3") - promotion pages also render an unrelated
 * sitewide "trending events" widget (class "border-tap_9") that this
 * excludes.
 */
const parsePromotionEventLinks = (html, referenceDate = new Date()) => {
  const $ = cheerio.load(html);
  const eventMap = new Map();

  $("a.border-b.border-tap_3.border-dotted[href^='/fightcenter/events/']").each((_, el) => {
    const $a = $(el);
    const href = $a.attr("href");
    if (!href) return;

    const link = baseUrl + href;
    if (eventMap.has(link)) return;

    const title = $a.text().trim();
    if (!title) return;

    const container = $a.closest("div.promotion");
    const date = parseTapologyDate(
      container.length ? container.text() : "",
      referenceDate,
    );

    eventMap.set(link, { title, link, date });
  });

  return Array.from(eventMap.values());
};

/**
 * Walks a promotion's own event-list pages (newest/most-future first,
 * confirmed by direct inspection) until an event dated before today is
 * found - everything after that point is guaranteed to be further in the
 * past too, so pagination stops there rather than walking years of history.
 */
const fetchPromotionUpcomingEvents = async (promotionUrl, referenceDate = new Date()) => {
  const today = startOfDay(referenceDate);
  const upcoming = [];

  for (let pageNum = 1; pageNum <= MAX_PROMOTION_PAGES; pageNum++) {
    const url = pageNum > 1 ? `${promotionUrl}?page=${pageNum}` : promotionUrl;

    const html = await fetchHtml(url, {
      waitForSelector: "a.border-b.border-tap_3.border-dotted",
    });

    if (isBlockedResponse(html)) {
      console.warn(`Blocked while fetching promotion page ${pageNum}: ${promotionUrl}`);
      break;
    }

    const events = parsePromotionEventLinks(html, referenceDate);
    if (!events.length) break; // nothing here at all

    let reachedPast = false;
    for (const event of events) {
      if (event.date === null) continue; // unparseable date, skip just this one
      if (event.date < today) {
        reachedPast = true;
        break;
      }
      upcoming.push({ title: event.title, link: event.link });
    }

    if (reachedPast) break;

    await delay(2500 + Math.random() * 2000);
  }

  return upcoming;
};

/**
 * Discovers upcoming events for every whitelisted promotion Tapology
 * doesn't tag "major" (see config/nonMajorPromotions.js) - the main
 * fightcenter listing can never surface these, so each is checked directly.
 */
const fetchNonMajorPromotionEvents = async (referenceDate = new Date()) => {
  const allEvents = [];

  for (const [orgCode, url] of Object.entries(NON_MAJOR_PROMOTIONS)) {
    try {
      const events = await fetchPromotionUpcomingEvents(url, referenceDate);
      console.log(`Non-major promotion ${orgCode}: ${events.length} upcoming event(s)`);
      allEvents.push(...events);
    } catch (err) {
      console.error(`Failed to check non-major promotion ${orgCode}:`, err.message);
    }
  }

  return allEvents;
};

module.exports = {
  parseTapologyDate,
  parsePromotionEventLinks,
  fetchPromotionUpcomingEvents,
  fetchNonMajorPromotionEvents,
};
