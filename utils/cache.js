const fs = require("fs");
const path = require("path");

const CACHE_PATH = path.join(__dirname, "..", "data", "events.json");
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

const isCacheFresh = () => {
  try {
    const stats = fs.statSync(CACHE_PATH);
    const now = Date.now();
    const modifiedTime = new Date(stats.mtime).getTime();
    return now - modifiedTime < CACHE_DURATION;
  } catch (err) {
    return false;
  }
};

const readCache = () => {
  try {
    const data = fs.readFileSync(CACHE_PATH, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    return null;
  }
};

const writeCache = (data) => {
  try {
    // Ensure the directory exists
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });

    fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error writing to cache:", err.message);
  }
};

module.exports = {
  isCacheFresh,
  readCache,
  writeCache,
};
