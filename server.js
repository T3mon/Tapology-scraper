const express = require("express");
const cors = require("cors");
const {
  fetchUpcomingEvents,
  fetchEventDetails,
} = require("./scrapers/tapology");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

const { isCacheFresh, readCache, writeCache } = require("./utils/cache");
const { evaluateScrape } = require("./utils/scrapeHealth");
const { archiveEvents } = require("./utils/archive");

app.get("/api/events", async (req, res) => {
  const forceRefresh = req.query.refresh === "true";
  const cachedData = readCache();

  try {
    if (!forceRefresh && isCacheFresh() && cachedData) {
      console.log("Serving fresh cache");
      return res.json(cachedData);
    }

    console.log("Starting new scrape...");

    const events = await fetchUpcomingEvents();
    const { events: detailedEvents, skippedNonWhitelisted } =
      await fetchEventDetails(events);

    const health = evaluateScrape({
      totalFetched: events.length,
      skippedNonWhitelisted,
      keptCount: detailedEvents.length,
      previousCacheSize: cachedData ? cachedData.length : 0,
    });

    console.log(
      `Scrape result: ${detailedEvents.length} / ${health.attempted} events` +
        (skippedNonWhitelisted
          ? ` (${skippedNonWhitelisted} filtered by promotion whitelist)`
          : ""),
    );

    if (!health.accept) {
      console.warn(
        health.reason === "degraded"
          ? "Scrape appears degraded. Keeping existing cache."
          : "New scrape significantly smaller than previous. Keeping old cache.",
      );

      if (cachedData) {
        return res.json(cachedData);
      }

      return res.status(503).json({
        message: "Scrape degraded and no cache available",
      });
    }

    writeCache(detailedEvents);
    archiveEvents(detailedEvents);
    console.log("Cache updated successfully");

    res.json(detailedEvents);
  } catch (error) {
    console.error("Scrape failed:", error.message);

    if (cachedData) {
      console.warn("Serving stale cache due to scrape failure");
      return res.json(cachedData);
    }

    const status = error.code === "TAPOLOGY_BLOCKED" ? 503 : 500;
    res.status(status).json({
      message: "Failed to fetch events",
      error: error.message,
      ...(error.code && { code: error.code }),
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
