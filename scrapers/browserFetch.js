const { chromium } = require("playwright");

const baseUrl = "https://www.tapology.com";

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

let browser;

const fetchHtml = async (url, { waitForText, waitForSelector } = {}) => {
  if (!browser) {
    browser = await chromium.launch({
      // headless mode gets an immediate Cloudflare "Just a moment..."
      // challenge page here - has to be a real (headed) browser. To avoid
      // it stealing focus/sitting on screen, push the window off-screen
      // instead of making it headless.
      headless: false,
      args: ["--window-position=-32000,-32000", "--start-minimized"],
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

module.exports = { baseUrl, delay, fetchHtml, isBlockedResponse };
