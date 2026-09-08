const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const {
  parseTapologyDate,
  parsePromotionEventLinks,
} = require("../../scrapers/promotionPages");

const REF = new Date(2026, 8, 8); // Sep 8, 2026 (matches the real date used throughout this project's tests)

describe("parseTapologyDate", () => {
  test("parses the near-term format (has time, no year) using the reference year", () => {
    const d = parseTapologyDate("Friday, October 23, 4:00 PM ET", REF);
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 9); // October
    assert.equal(d.getDate(), 23);
  });

  test("parses the far-out format (has explicit year, no time)", () => {
    const d = parseTapologyDate("Saturday, June 13, 2026", REF);
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 5); // June
    assert.equal(d.getDate(), 13);
  });

  test("rolls a year-less date over to next year if it would otherwise be >6 months in the past", () => {
    // Reference is September 2026; "January 5" with no year must mean 2027.
    const d = parseTapologyDate("Monday, January 5, 6:00 PM ET", REF);
    assert.equal(d.getFullYear(), 2027);
    assert.equal(d.getMonth(), 0);
    assert.equal(d.getDate(), 5);
  });

  test("keeps a year-less date in the reference year when it's recently past (within 6 months)", () => {
    // Reference is September 2026; "July 11" with no year is recent-past 2026, not 2027.
    const d = parseTapologyDate("Saturday, July 11, 12:00 PM ET", REF);
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 6); // July
  });

  test("returns null for unparseable text", () => {
    assert.equal(parseTapologyDate("", REF), null);
    assert.equal(parseTapologyDate("no date here", REF), null);
  });
});

const eventRow = ({ title, href, dateText }) => `
  <div class="promotion flex flex-wrap items-center leading-6 whitespace-nowrap overflow-hidden">
    <span class="hidden md:inline text-tap_3 font-bold uppercase text-[13px] ">
      <a class="border-b border-tap_3 border-dotted hover:border-solid" href="${href}">${title}</a>
    </span>
    <span class="inline md:hidden text-tap_3 font-bold uppercase text-[13px] ">
      <a class="border-b border-tap_3 border-dotted hover:border-solid" href="${href}">${title}</a>
    </span>
    <span class="mx-1 md:mx-1.5 text-tap_9">•</span>
    <span>${dateText}</span>
  </div>
`;

const trendingWidgetRow = ({ title, href }) => `
  <a class="text-tap_3 border-b border-dotted border-tap_9 hover:text-tap_red hover:border-solid" href="${href}">${title}</a>
`;

describe("parsePromotionEventLinks", () => {
  test("extracts title/link/date and dedupes the mobile+desktop duplicate anchors", () => {
    const html = `<html><body>
      ${eventRow({ title: "RAF 14: Tsarukyan vs. Danis", href: "/fightcenter/events/143894-raf-14", dateText: "Friday, October 23, 4:00 PM ET" })}
    </body></html>`;

    const events = parsePromotionEventLinks(html, REF);

    assert.equal(events.length, 1);
    assert.equal(events[0].title, "RAF 14: Tsarukyan vs. Danis");
    assert.equal(events[0].link, "https://www.tapology.com/fightcenter/events/143894-raf-14");
    assert.equal(events[0].date.getMonth(), 9);
    assert.equal(events[0].date.getDate(), 23);
  });

  test("excludes the unrelated sitewide trending-events widget", () => {
    const html = `<html><body>
      ${eventRow({ title: "RAF 14: Tsarukyan vs. Danis", href: "/fightcenter/events/143894-raf-14", dateText: "Friday, October 23, 4:00 PM ET" })}
      ${trendingWidgetRow({ title: "UFC Fight Night", href: "/fightcenter/events/145702-ufc-fight-night" })}
    </body></html>`;

    const events = parsePromotionEventLinks(html, REF);

    assert.equal(events.length, 1);
    assert.equal(events[0].title, "RAF 14: Tsarukyan vs. Danis");
  });

  test("preserves date-descending order from the source page", () => {
    const html = `<html><body>
      ${eventRow({ title: "RAF 14", href: "/fightcenter/events/1-raf-14", dateText: "Friday, October 23, 4:00 PM ET" })}
      ${eventRow({ title: "RAF 13", href: "/fightcenter/events/2-raf-13", dateText: "Friday, September 18, 8:00 PM ET" })}
      ${eventRow({ title: "RAF Moscow", href: "/fightcenter/events/3-raf-moscow", dateText: "Saturday, September 5, 12:00 PM ET" })}
    </body></html>`;

    const events = parsePromotionEventLinks(html, REF);

    assert.deepEqual(events.map((e) => e.title), ["RAF 14", "RAF 13", "RAF Moscow"]);
    assert.ok(events[0].date > events[1].date);
    assert.ok(events[1].date > events[2].date);
  });
});
