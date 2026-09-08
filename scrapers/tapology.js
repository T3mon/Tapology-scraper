const axios = require("axios");
const cheerio = require("cheerio");

const baseUrl = "https://www.tapology.com";
const majorOrgs = ["UFC", "PFL", "BELLATOR", "ONE", "RIZIN"];
const MAX_EVENTS = 10;

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

const axiosClient = axios.create({
  timeout: 15000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    Referer: "https://www.tapology.com/",
    Connection: "keep-alive",
  },
});

/** Tapology is behind Cloudflare; plain HTTP clients often get 403 without a real browser. */
const tapologyBlockedError = () => {
  const err = new Error(
    "Tapology returned HTTP 403 (Cloudflare). Automated requests from this environment cannot pass the browser check.",
  );
  err.code = "TAPOLOGY_BLOCKED";
  return err;
};

const { chromium } = require("playwright");

let browser;

const fetchHtml = async (url) => {
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

    // Give the page time to finish any normal browser-side loading.
    await page.waitForTimeout(5000);

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

const fetchUpcomingEvents = async (orgMode = "major") => {
  const url =
    orgMode === "all"
      ? `${baseUrl}/fightcenter?schedule=upcoming`
      : `${baseUrl}/fightcenter?group=major&schedule=upcoming`;

  const html = await fetchHtml(url);

  if (isBlockedResponse(html)) {
    throw new Error("Blocked while fetching upcoming events");
  }

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

  return Array.from(eventMap.values()).slice(0, MAX_EVENTS);
};

/* -------------------------
   EVENT DETAILS
-------------------------- */

const fetchEventDetails = async (events) => {
  const results = [];

  for (const event of events) {
    try {
      const html = await fetchHtml(event.link);

      if (isBlockedResponse(html)) {
        console.warn(`Blocked or degraded page: ${event.link}`);
        await delay(15000);
        continue;
      }

      const $ = cheerio.load(html);

      /* ---------- EVENT META ---------- */

      const getMetaValue = (label) => {
        let value = null;

        $("li").each((_, el) => {
          const key = $(el).find("span.font-bold").text().trim();
          if (key.startsWith(label)) {
            value = $(el).find("span.text-neutral-700").first().text().trim();
          }
        });

        return value || null;
      };

      const date = getMetaValue("Date/Time:");
      const venue = getMetaValue("Venue:");
      const location = getMetaValue("Location:");

      /* ---------- ORGANIZATION ---------- */

      let fullOrganization = "Other";
      const promoMatch = $("body")
        .text()
        .match(/Promotion:\s*([^\n•]+)/i);

      if (promoMatch) fullOrganization = promoMatch[1].trim();

      const orgMap = {
        "Ultimate Fighting Championship": "UFC",
        "Professional Fighters League": "PFL",
        "Bellator MMA": "BELLATOR",
        "ONE Championship": "ONE",
        "Rizin Fighting Federation": "RIZIN",
        "Absolute Championship Akhmat": "ACA",
        "Konfrontacja Sztuk Walki": "KSW",
        "Cage Warriors": "CW",
        "Invicta FC": "INVICTA",
        "Oktagon MMA": "OKTAGON",
        "Legacy Fighting Alliance": "LFA",
      };

      const organization =
        orgMap[fullOrganization] ||
        majorOrgs.find((o) => event.title.toUpperCase().includes(o)) ||
        "Other";

      const promotionLinks = {};

      $("li")
        .filter((_, el) =>
          $(el).find("span.font-bold").text().includes("Promotion Links"),
        )
        .find("a[href]")
        .each((_, a) => {
          const href = $(a).attr("href");
          if (!href) return;

          if (href.includes("facebook.com")) promotionLinks.facebook = href;
          else if (href.includes("instagram.com"))
            promotionLinks.instagram = href;
          else if (href.includes("x.com") || href.includes("twitter.com"))
            promotionLinks.twitter = href;
          else if (href.includes("youtube.com")) promotionLinks.youtube = href;
          else if (href.includes("tiktok.com")) promotionLinks.tiktok = href;
          else if (href.includes("wikipedia.org"))
            promotionLinks.wikipedia = href;
          else promotionLinks.website = href;
        });

      /* ---------- FIGHTS ---------- */

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

        const parseFighter = (container) => {
          const flagImg = container.find("img[src^='/assets/flags']").first();

          const pictureImg = container
            .find("img[src^='https://images.tapology.com']")
            .first();

          return {
            name: container.find(".link-primary-red").text().trim(),
            record:
              container
                .find("span.text-\\[15px\\], span.md\\:text-xs")
                .first()
                .text()
                .trim() || null,
            country: flagImg.length ? baseUrl + flagImg.attr("src") : null,
            picture: pictureImg.attr("src") || null,
            link: container.find(".link-primary-red").attr("href")
              ? baseUrl + container.find(".link-primary-red").attr("href")
              : null,
          };
        };

        const fighterA = parseFighter(fighterContainers.eq(0));
        const fighterB = parseFighter(fighterContainers.eq(1));

        if (!fighterA.name || !fighterB.name) return;

        fights.push({
          fighterA,
          fighterB,
          weightClass,
        });
      });

      if (!fights.length) continue;

      results.push({
        ...event,
        organization,
        fullOrganization,
        date,
        venue,
        location,
        fights,
        promotionLinks,
      });

      await delay(2500 + Math.random() * 2000);
    } catch (err) {
      console.error(`Failed event ${event.link}:`, err.message);
      await delay(8000);
    }
  }

  return results;
};

module.exports = {
  fetchUpcomingEvents,
  fetchEventDetails,
};
