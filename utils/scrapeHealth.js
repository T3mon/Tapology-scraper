const MIN_SUCCESS_RATE = 0.7; // at least 70% of attempted events must scrape successfully
const MIN_RETENTION_RATE = 0.6; // new scrape must keep at least 60% of the previous cache's size

/**
 * Decides whether a fresh scrape is healthy enough to overwrite the cache.
 * Events filtered out by the promotion whitelist aren't scrape failures, so
 * they're excluded from the attempted/success-rate denominator - only
 * genuine failures (blocks, parse errors) should count against health.
 */
const evaluateScrape = ({
  totalFetched,
  skippedNonWhitelisted,
  keptCount,
  previousCacheSize,
}) => {
  const attempted = totalFetched - skippedNonWhitelisted;
  const successRate = attempted ? keptCount / attempted : 1;

  if (!keptCount || successRate < MIN_SUCCESS_RATE) {
    return { accept: false, reason: "degraded", attempted, successRate };
  }

  if (previousCacheSize && keptCount < previousCacheSize * MIN_RETENTION_RATE) {
    return { accept: false, reason: "shrink", attempted, successRate };
  }

  return { accept: true, reason: "ok", attempted, successRate };
};

module.exports = { evaluateScrape, MIN_SUCCESS_RATE, MIN_RETENTION_RATE };
