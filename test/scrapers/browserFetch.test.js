const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { isBlockedResponse } = require("../../scrapers/browserFetch");

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
