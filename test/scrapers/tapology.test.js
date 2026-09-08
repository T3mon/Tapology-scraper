const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildFightcenterUrl,
  parseEventLinks,
  parseEventDetailPage,
  isBlockedResponse,
} = require("../../scrapers/tapology");

describe("buildFightcenterUrl", () => {
  test("defaults to the major-orgs listing", () => {
    assert.equal(
      buildFightcenterUrl("major"),
      "https://www.tapology.com/fightcenter?group=major&schedule=upcoming",
    );
  });

  test("switches to the full listing for orgMode 'all'", () => {
    assert.equal(
      buildFightcenterUrl("all"),
      "https://www.tapology.com/fightcenter?schedule=upcoming",
    );
  });

  test("omits the page param for page 1", () => {
    assert.equal(
      buildFightcenterUrl("major", 1),
      "https://www.tapology.com/fightcenter?group=major&schedule=upcoming",
    );
  });

  test("appends &page=N for later pages", () => {
    assert.equal(
      buildFightcenterUrl("major", 3),
      "https://www.tapology.com/fightcenter?group=major&schedule=upcoming&page=3",
    );
  });
});

describe("parseEventLinks", () => {
  test("extracts title/link pairs and dedupes the mobile+desktop duplicate anchors", () => {
    const html = `
      <html><body>
        <a href="/fightcenter/events/1-ufc-317">UFC 317: Topuria vs. Oliveira</a>
        <a href="/fightcenter/events/1-ufc-317">UFC 317: Topuria vs. Oliveira</a>
        <a href="/fightcenter/events/2-aca-207">ACA 207: Goncharov vs. Almeida</a>
      </body></html>
    `;

    const events = parseEventLinks(html);

    assert.equal(events.length, 2);
    assert.deepEqual(events[0], {
      title: "UFC 317: Topuria vs. Oliveira",
      link: "https://www.tapology.com/fightcenter/events/1-ufc-317",
    });
    assert.equal(
      events[1].link,
      "https://www.tapology.com/fightcenter/events/2-aca-207",
    );
  });

  test("skips anchors with no text", () => {
    const html = `
      <html><body>
        <a href="/fightcenter/events/1-empty"></a>
        <a href="/fightcenter/events/2-real">Real Event</a>
      </body></html>
    `;

    const events = parseEventLinks(html);

    assert.equal(events.length, 1);
    assert.equal(events[0].title, "Real Event");
  });

  test("ignores links that don't point at an event", () => {
    const html = `
      <html><body>
        <a href="/fightcenter/promotions/1-ufc">Ultimate Fighting Championship</a>
        <a href="/fightcenter/events/1-real">Real Event</a>
      </body></html>
    `;

    const events = parseEventLinks(html);

    assert.equal(events.length, 1);
    assert.equal(events[0].title, "Real Event");
  });
});

describe("isBlockedResponse", () => {
  test("detects a Cloudflare interstitial by title", () => {
    const html = "<html><head><title>Just a moment...</title></head><body></body></html>";
    assert.equal(isBlockedResponse(html), true);
  });

  test("detects an 'Attention Required' Cloudflare page", () => {
    const html =
      "<html><head><title>Attention Required! | Cloudflare</title></head><body></body></html>";
    assert.equal(isBlockedResponse(html), true);
  });

  test("does not flag a normal page", () => {
    const html =
      "<html><head><title>UFC 317: Topuria vs. Oliveira | Tapology</title></head><body>Some normal content</body></html>";
    assert.equal(isBlockedResponse(html), false);
  });

  test("regression: a stray 'recaptcha' ad iframe does not false-positive as blocked", () => {
    // This is the exact bug fixed earlier: naive substring matching on
    // "captcha" flagged perfectly good pages just because an unrelated ad
    // iframe referenced Google's reCAPTCHA verification endpoint.
    const html = `
      <html><head><title>ONE Samurai 3 | Tapology</title></head>
      <body>
        Real event content here.
        <iframe src="https://www.google.com/recaptcha/api2/aframe"></iframe>
      </body></html>
    `;
    assert.equal(isBlockedResponse(html), false);
  });
});

const fighterHtml = ({ name, href, record, flag, picture }) => `
  <div class="div flex flex-row gap-0.5 md:gap-0 w-full">
    <a class="link-primary-red" href="${href}">${name}</a>
    <span class="text-[15px]">${record}</span>
    <img src="${flag}" />
    <img src="${picture}" />
  </div>
`;

const eventDetailHtml = ({ promotion, weightClass = "155", fighters = true }) => `
  <html><head><title>Test Event | Tapology</title></head>
  <body>
    <ul>
      <li><span class="font-bold">Date/Time:</span><span class="text-neutral-700">Saturday, June 28, 6:00 PM ET</span></li>
      <li><span class="font-bold">Venue:</span><span class="text-neutral-700">T-Mobile Arena</span></li>
      <li><span class="font-bold">Location:</span><span class="text-neutral-700">Las Vegas, NV</span></li>
      <li><span class="font-bold">Promotion:</span><span class="text-neutral-700">${promotion}</span></li>
    </ul>
    <ul data-event-view-toggle-target="list">
      ${
        fighters
          ? `<li>
        <span class="rounded">${weightClass}</span>
        ${fighterHtml({
          name: "Ilia Topuria",
          href: "/fightcenter/fighters/129278-ilia-topuria",
          record: "16-0",
          flag: "/assets/flags/GE-abc.gif",
          picture: "https://images.tapology.com/headshot_images/129278/preview/Topuria.jpg",
        })}
        ${fighterHtml({
          name: "Charles Oliveira",
          href: "/fightcenter/fighters/1613-charles-oliveira",
          record: "35-10",
          flag: "/assets/flags/BR-def.gif",
          picture: "https://images.tapology.com/headshot_images/1613/preview/Oliveira.jpg",
        })}
      </li>`
          : ""
      }
    </ul>
  </body></html>
`;

describe("parseEventDetailPage", () => {
  test("parses a whitelisted event with a full fight card", () => {
    const html = eventDetailHtml({ promotion: "Ultimate Fighting Championship" });
    const result = parseEventDetailPage(html, {
      title: "UFC 317: Topuria vs. Oliveira",
      link: "https://www.tapology.com/fightcenter/events/1-ufc-317",
    });

    assert.equal(result.status, "ok");
    assert.equal(result.event.organization, "UFC");
    assert.equal(result.event.fullOrganization, "Ultimate Fighting Championship");
    assert.equal(result.event.venue, "T-Mobile Arena");
    assert.equal(result.event.location, "Las Vegas, NV");
    assert.equal(result.event.fights.length, 1);

    const fight = result.event.fights[0];
    assert.equal(fight.weightClass, "155 lbs");
    assert.equal(fight.fighterA.name, "Ilia Topuria");
    assert.equal(fight.fighterA.record, "16-0");
    assert.equal(
      fight.fighterA.link,
      "https://www.tapology.com/fightcenter/fighters/129278-ilia-topuria",
    );
    assert.equal("country" in fight.fighterA, false);
    assert.equal("picture" in fight.fighterA, false);
    assert.equal(fight.fighterB.name, "Charles Oliveira");
  });

  test("skips an event whose promotion is not on the whitelist", () => {
    const html = eventDetailHtml({ promotion: "Absolute Championship Akhmat" });
    const result = parseEventDetailPage(html, {
      title: "ACA 207: Goncharov vs. Almeida",
      link: "https://www.tapology.com/fightcenter/events/2-aca-207",
    });

    assert.equal(result.status, "skipped-whitelist");
    assert.equal(result.fullOrganization, "Absolute Championship Akhmat");
  });

  test("keeps a whitelisted event with no fight card announced yet, with an empty fights array", () => {
    const html = eventDetailHtml({
      promotion: "ONE Championship",
      fighters: false,
    });
    const result = parseEventDetailPage(html, {
      title: "ONE Friday Fights 171",
      link: "https://www.tapology.com/fightcenter/events/3-one-friday-fights-171",
    });

    assert.equal(result.status, "ok");
    assert.equal(result.event.organization, "ONE");
    assert.deepEqual(result.event.fights, []);
  });

  test("reports blocked pages without attempting to parse them", () => {
    const html =
      "<html><head><title>Just a moment...</title></head><body></body></html>";
    const result = parseEventDetailPage(html, {
      title: "Some Event",
      link: "https://www.tapology.com/fightcenter/events/4-some-event",
    });

    assert.equal(result.status, "blocked");
  });
});
