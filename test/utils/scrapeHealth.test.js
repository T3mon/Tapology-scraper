const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { evaluateScrape } = require("../../utils/scrapeHealth");

describe("evaluateScrape", () => {
  test("accepts a healthy scrape with no previous cache", () => {
    const health = evaluateScrape({
      totalFetched: 25,
      skippedNonWhitelisted: 7,
      keptCount: 18,
      previousCacheSize: 0,
    });

    assert.equal(health.accept, true);
    assert.equal(health.reason, "ok");
    assert.equal(health.attempted, 18);
    assert.equal(health.successRate, 1);
  });

  test("excludes whitelist-filtered events from the success-rate denominator (regression: this used to wrongly count them as failures)", () => {
    // Real numbers from a run that was incorrectly marked "degraded" before
    // the fix: 25 fetched, 7 filtered by whitelist, 16 kept. Old logic used
    // 25 as the denominator (16/25 = 64%, below threshold, rejected).
    // Correct logic uses 18 attempted (16/18 = 88.9%, accepted).
    const health = evaluateScrape({
      totalFetched: 25,
      skippedNonWhitelisted: 7,
      keptCount: 16,
      previousCacheSize: 0,
    });

    assert.equal(health.attempted, 18);
    assert.ok(
      Math.abs(health.successRate - 16 / 18) < 1e-9,
      `expected successRate ~${16 / 18}, got ${health.successRate}`,
    );
    assert.equal(health.accept, true);
  });

  test("rejects as degraded when nothing was kept", () => {
    const health = evaluateScrape({
      totalFetched: 10,
      skippedNonWhitelisted: 0,
      keptCount: 0,
      previousCacheSize: 5,
    });

    assert.equal(health.accept, false);
    assert.equal(health.reason, "degraded");
  });

  test("rejects as degraded when success rate is genuinely below threshold", () => {
    const health = evaluateScrape({
      totalFetched: 10,
      skippedNonWhitelisted: 0,
      keptCount: 5,
      previousCacheSize: 0,
    });

    assert.equal(health.successRate, 0.5);
    assert.equal(health.accept, false);
    assert.equal(health.reason, "degraded");
  });

  test("accepts right at the success-rate threshold (70% is not below 70%)", () => {
    const health = evaluateScrape({
      totalFetched: 10,
      skippedNonWhitelisted: 0,
      keptCount: 7,
      previousCacheSize: 0,
    });

    assert.equal(health.successRate, 0.7);
    assert.equal(health.accept, true);
  });

  test("rejects as shrink when kept count is well below the previous cache size", () => {
    const health = evaluateScrape({
      totalFetched: 10,
      skippedNonWhitelisted: 0,
      keptCount: 10,
      previousCacheSize: 20,
    });

    assert.equal(health.successRate, 1);
    assert.equal(health.accept, false);
    assert.equal(health.reason, "shrink");
  });

  test("accepts right at the retention-rate threshold (exactly 60% is not below 60%)", () => {
    const health = evaluateScrape({
      totalFetched: 6,
      skippedNonWhitelisted: 0,
      keptCount: 6,
      previousCacheSize: 10,
    });

    assert.equal(health.accept, true);
  });

  test("does not apply the shrink guard when there is no previous cache", () => {
    const health = evaluateScrape({
      totalFetched: 3,
      skippedNonWhitelisted: 0,
      keptCount: 3,
      previousCacheSize: 0,
    });

    assert.equal(health.accept, true);
  });

  test("does not divide by zero when every fetched event was whitelist-filtered", () => {
    const health = evaluateScrape({
      totalFetched: 5,
      skippedNonWhitelisted: 5,
      keptCount: 0,
      previousCacheSize: 0,
    });

    assert.equal(health.attempted, 0);
    assert.equal(health.accept, false);
    assert.equal(health.reason, "degraded");
  });
});
