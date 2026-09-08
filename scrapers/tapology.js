const cheerio = require("cheerio");
const { chromium } = require("playwright");
const ALLOWED_PROMOTIONS = require("../config/allowedPromotions");

const baseUrl = "https://www.tapology.com";
const MAX_EVENTS = 25;

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

let browser;

const fetchHtml = async (url, { waitForText, waitForSelector } = {}) => {
  if (!browser) {
    browser = await chromium.launch({
      headless: false,
    });
  }

  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    locale: "en-US",
  });

  const page = await context.newPage();

  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // The content we actually need typically hydrates in ~1-2s; bail out as
    // soon as it shows up instead of always eating a blind 5s.
    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout: 10000 }).catch(() => {});
    } else if (waitForText) {
      await page
        .waitForFunction(
          (text) => document.body.innerText.includes(text),
          waitForText,
          { timeout: 10000 },
        )
        .catch(() => {});
    } else {
      // Give the page time to finish any normal browser-side loading.
      await page.waitForTimeout(5000);
    }

    return await page.content();
  } finally {
    await context.close();
  }
};

/**
 * Detects an actual Cloudflare/anti-bot interstitial, not just any page that
 * happens to load unrelated third-party scripts (e.g. ad iframes referencing
 * "recaptcha" show up on plenty of normal pages and used to cause false
 * positives here).
 */
const isBlockedResponse = (html) => {
  const title = (html.match(/<title>([^<]*)<\/title>/i)?.[1] || "").toLowerCase();
  const blockedTitles = [
    "just a moment",
    "attention required",
    "access denied",
    "are you a human",
  ];
  if (blockedTitles.some((t) => title.includes(t))) return true;

  const lower = html.toLowerCase();
  return (
    lower.includes("cf-browser-verification") ||
    lower.includes("cf_chl_opt") ||
    lower.includes("checking your browser before accessing") ||
    lower.includes("please enable javascript and cookies to continue")
  );
};

/* -------------------------
   UPCOMING EVENTS
-------------------------- */

const buildFightcenterUrl = (orgMode) =>
  orgMode === "all"
    ? `${baseUrl}/fightcenter?schedule=upcoming`
    : `${baseUrl}/fightcenter?group=major&schedule=upcoming`;

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
  const url = buildFightcenterUrl(orgMode);

  const html = await fetchHtml(url, {
    waitForSelector: "a[href^='/fightcenter/events/']",
  });

  if (isBlockedResponse(html)) {
    throw new Error("Blocked while fetching upcoming events");
  }

  return parseEventLinks(html).slice(0, MAX_EVENTS);
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

const fetchEventDetails = async (events) => {
  const results = [];
  let skippedNonWhitelisted = 0;

  for (const [i, event] of events.entries()) {
    try {
      console.log(`Fetching [${i + 1}/${events.length}]: ${event.title}`);
      const html = await fetchHtml(event.link, { waitForText: "Promotion:" });
      const parsed = parseEventDetailPage(html, event);

      if (parsed.status === "blocked") {
        console.warn(`Blocked or degraded page: ${event.link}`);
        await delay(15000);
        continue;
      }

      if (parsed.status === "skipped-whitelist") {
        console.log(
          `Skipping non-whitelisted promotion "${parsed.fullOrganization || "unknown"}": ${event.title}`,
        );
        skippedNonWhitelisted++;
        continue;
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
  }

  return { events: results, skippedNonWhitelisted };
};

module.exports = {
  fetchUpcomingEvents,
  fetchEventDetails,
  buildFightcenterUrl,
  parseEventLinks,
  parseEventDetailPage,
  isBlockedResponse,
};
