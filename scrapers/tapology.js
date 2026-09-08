const cheerio = require("cheerio");
const ALLOWED_PROMOTIONS = require("../config/allowedPromotions");
const { baseUrl, delay, fetchHtml, isBlockedResponse } = require("./browserFetch");

// Pure safety backstop against a runaway loop
const MAX_LISTING_PAGES = 50;

/* -------------------------
   UPCOMING EVENTS
-------------------------- */

const buildFightcenterUrl = (orgMode, page = 1) => {
  const base =
    orgMode === "all"
      ? `${baseUrl}/fightcenter?schedule=upcoming`
      : `${baseUrl}/fightcenter?group=major&schedule=upcoming`;

  return page > 1 ? `${base}&page=${page}` : base;
};

const parseEventLinks = (html) => {
  const $ = cheerio.load(html);
  const eventMap = new Map();

  $("a[href^='/fightcenter/events/']").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    const link = baseUrl + href;
    if (eventMap.has(link)) return;

    const title = $(el).text().trim();
    if (!title) return;

    eventMap.set(link, { title, link });
  });

  return Array.from(eventMap.values());
};

const fetchUpcomingEvents = async (orgMode = "major") => {
  const eventMap = new Map();

  for (let pageNum = 1; pageNum <= MAX_LISTING_PAGES; pageNum++) {
    const url = buildFightcenterUrl(orgMode, pageNum);

    const html = await fetchHtml(url, {
      waitForSelector: "a[href^='/fightcenter/events/']",
    });

    if (isBlockedResponse(html)) {
      if (pageNum === 1) {
        throw new Error("Blocked while fetching upcoming events");
      }
      console.warn(`Blocked while fetching listing page ${pageNum}, stopping pagination early`);
      break;
    }

    const sizeBefore = eventMap.size;
    for (const event of parseEventLinks(html)) {
      if (!eventMap.has(event.link)) eventMap.set(event.link, event);
    }

    console.log(
      `Listing page ${pageNum}: ${eventMap.size} unique events so far`,
    );

    if (eventMap.size === sizeBefore) break; // reached the end of results

    await delay(2500 + Math.random() * 2000);
  }

  return Array.from(eventMap.values());
};

/* -------------------------
   EVENT DETAILS
-------------------------- */

const getMetaValue = ($, label) => {
  let value = null;

  $("li").each((_, el) => {
    const key = $(el).find("span.font-bold").text().trim();
    if (key.startsWith(label)) {
      value = $(el).find("span.text-neutral-700").first().text().trim();
    }
  });

  return value || null;
};

const parseFighter = (container) => {
  return {
    name: container.find(".link-primary-red").text().trim(),
    record:
      container
        .find("span.text-\\[15px\\], span.md\\:text-xs")
        .first()
        .text()
        .trim() || null,
    link: container.find(".link-primary-red").attr("href")
      ? baseUrl + container.find(".link-primary-red").attr("href")
      : null,
  };
};

const parseFights = ($) => {
  const fights = [];

  $("ul[data-event-view-toggle-target='list'] li").each((_, el) => {
    const fighterContainers = $(el).find(
      ".div.flex.flex-row.gap-0\\.5.md\\:gap-0.w-full",
    );

    if (fighterContainers.length < 2) return;

    const weightClass = (() => {
      const badge = $(el)
        .find("span.rounded")
        .filter((_, s) => {
          const text = $(s).text().trim();
          return /^\d{2,3}$/.test(text);
        })
        .first()
        .text()
        .trim();

      return badge ? `${badge} lbs` : null;
    })();

    const fighterA = parseFighter(fighterContainers.eq(0));
    const fighterB = parseFighter(fighterContainers.eq(1));

    if (!fighterA.name || !fighterB.name) return;

    fights.push({ fighterA, fighterB, weightClass });
  });

  return fights;
};

/**
 * Parses one event detail page's HTML into structured data. Pure (no
 * network) so it's unit-testable against fixture HTML without a real
 * browser. Returns one of:
 *   { status: "blocked" }
 *   { status: "skipped-whitelist", fullOrganization }
 *   { status: "ok", event: {...} }
 */
const parseEventDetailPage = (html, event) => {
  if (isBlockedResponse(html)) {
    return { status: "blocked" };
  }

  const $ = cheerio.load(html);

  const date = getMetaValue($, "Date/Time:");
  const venue = getMetaValue($, "Venue:");
  const location = getMetaValue($, "Location:");

  const promoMatch = $("body")
    .text()
    .match(/Promotion:\s*([^\n•]+)/i);

  const fullOrganization = promoMatch ? promoMatch[1].trim() : null;
  const organization = ALLOWED_PROMOTIONS[fullOrganization];

  if (!organization) {
    return { status: "skipped-whitelist", fullOrganization };
  }

  return {
    status: "ok",
    event: {
      ...event,
      organization,
      fullOrganization,
      date,
      venue,
      location,
      fights: parseFights($),
    },
  };
};

const EVENT_CONCURRENCY = 4;

/**
 * Runs `count` independent workers pulling from a shared index
 * 4 concurent workers
 */
const runPool = async (items, count, handler) => {
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      await handler(items[i], i);
    }
  };

  await Promise.all(Array.from({ length: count }, worker));
};

const fetchEventDetails = async (events) => {
  const results = [];
  let skippedNonWhitelisted = 0;

  await runPool(events, EVENT_CONCURRENCY, async (event, i) => {
    try {
      console.log(`Fetching [${i + 1}/${events.length}]: ${event.title}`);
      const html = await fetchHtml(event.link, { waitForText: "Promotion:" });
      const parsed = parseEventDetailPage(html, event);

      if (parsed.status === "blocked") {
        console.warn(`Blocked or degraded page: ${event.link}`);
        await delay(15000);
        return;
      }

      if (parsed.status === "skipped-whitelist") {
        console.log(
          `Skipping non-whitelisted promotion "${parsed.fullOrganization || "unknown"}": ${event.title}`,
        );
        skippedNonWhitelisted++;
        return;
      }

      results.push(parsed.event);

      console.log(
        `Kept [${parsed.event.organization}] (${parsed.event.fights.length} fights): ${event.title}`,
      );

      await delay(2500 + Math.random() * 2000);
    } catch (err) {
      console.error(`Failed event ${event.link}:`, err.message);
      await delay(8000);
    }
  });

  return { events: results, skippedNonWhitelisted };
};

module.exports = {
  fetchUpcomingEvents,
  fetchEventDetails,
  buildFightcenterUrl,
  parseEventLinks,
  parseEventDetailPage,
};
