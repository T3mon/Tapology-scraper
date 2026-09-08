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

const MIN_SUCCESS_RATE = 0.7; // at least 70% of events must scrape successfully
const MIN_RETENTION_RATE = 0.6; // new scrape must keep at least 60% of the previous cache's size

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
      
    const attempted = events.length - skippedNonWhitelisted; //Events filtered out shouldn't count against scrape health

    console.log(
      `Scrape result: ${detailedEvents.length} / ${attempted} events` +
        (skippedNonWhitelisted
          ? ` (${skippedNonWhitelisted} filtered by promotion whitelist)`
          : ""),
    );

    // Validate scrape health before overwriting the cache
    const successRate = attempted ? detailedEvents.length / attempted : 1;

    if (!detailedEvents.length || successRate < MIN_SUCCESS_RATE) {
      console.warn("Scrape appears degraded. Keeping existing cache.");

      if (cachedData) {
        return res.json(cachedData);
      }

      return res.status(503).json({
        message: "Scrape degraded and no cache available",
      });
    }

    // Extra safety: don't accept a scrape that's drastically smaller than the current cache
    if (cachedData && detailedEvents.length < cachedData.length * MIN_RETENTION_RATE) {
      console.warn(
        "New scrape significantly smaller than previous. Keeping old cache.",
      );
      return res.json(cachedData);
    }

    writeCache(detailedEvents);
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
