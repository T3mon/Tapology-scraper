const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { archiveEvents, formatDateForFilename } = require("../../utils/archive");

describe("formatDateForFilename", () => {
  test("zero-pads single-digit months and days", () => {
    assert.equal(formatDateForFilename(new Date(2026, 0, 5)), "2026-01-05");
  });

  test("formats a normal date correctly", () => {
    assert.equal(formatDateForFilename(new Date(2026, 8, 8)), "2026-09-08");
  });
});

describe("archiveEvents", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tapology-archive-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("writes a dated JSON file into the given directory", () => {
    const data = [{ title: "UFC 317" }];
    const filePath = archiveEvents(data, { date: new Date(2026, 8, 8), dir: tmpDir });

    assert.equal(filePath, path.join(tmpDir, "Tapology_Events-2026-09-08.json"));
    assert.equal(fs.existsSync(filePath), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(filePath, "utf-8")), data);
  });

  test("creates the directory if it doesn't exist yet", () => {
    const nestedDir = path.join(tmpDir, "does", "not", "exist", "yet");
    const filePath = archiveEvents([{ title: "PFL" }], {
      date: new Date(2026, 8, 8),
      dir: nestedDir,
    });

    assert.equal(fs.existsSync(filePath), true);
  });

  test("overwrites the same day's file on a second scrape that same day", () => {
    const date = new Date(2026, 8, 8);
    archiveEvents([{ title: "first scrape" }], { date, dir: tmpDir });
    const filePath = archiveEvents([{ title: "second scrape" }], { date, dir: tmpDir });

    const written = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    assert.deepEqual(written, [{ title: "second scrape" }]);
  });

  test("keeps separate files for different days", () => {
    archiveEvents([{ title: "day one" }], { date: new Date(2026, 8, 8), dir: tmpDir });
    archiveEvents([{ title: "day two" }], { date: new Date(2026, 8, 9), dir: tmpDir });

    const files = fs.readdirSync(tmpDir).sort();
    assert.deepEqual(files, [
      "Tapology_Events-2026-09-08.json",
      "Tapology_Events-2026-09-09.json",
    ]);
  });
});
