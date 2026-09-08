const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

let cachedDocumentsDir = null;

/**
 * Resolves the real, OS-level Documents folder - not just "<home>/Documents".
 * With OneDrive's Known Folder Move, Windows can redirect Documents into
 * something like C:\Users\<user>\OneDrive\Documents (or a localized name
 * like "Dokumente"), which is a completely separate folder from the plain
 * profile path. Asking Windows directly (the same call Explorer uses)
 * avoids guessing at OneDrive folder names/locales.
 */
const resolveDocumentsDir = () => {
  if (cachedDocumentsDir) return cachedDocumentsDir;

  try {
    cachedDocumentsDir = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-Command", "[Environment]::GetFolderPath('MyDocuments')"],
      { encoding: "utf-8" },
    ).trim();
  } catch (err) {
    // Not on Windows, or PowerShell unavailable - fall back to the plain
    // profile-relative path.
    cachedDocumentsDir = path.join(os.homedir(), "Documents");
  }

  return cachedDocumentsDir;
};

const formatDateForFilename = (date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

/**
 * Saves a dated snapshot of the day's scrape to the user's real Documents
 * folder, separate from the operational cache in data/events.json. Each
 * calendar day gets its own file; re-scraping the same day overwrites that
 * day's file, but a new day never touches previous days' snapshots.
 */
const archiveEvents = (data, { date = new Date(), dir } = {}) => {
  const targetDir = dir || path.join(resolveDocumentsDir(), "Tapology Events");

  try {
    fs.mkdirSync(targetDir, { recursive: true });

    const filePath = path.join(
      targetDir,
      `Tapology_Events-${formatDateForFilename(date)}.json`,
    );
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

    console.log(`Archived today's scrape to ${filePath}`);
    return filePath;
  } catch (err) {
    console.error("Error archiving events:", err.message);
    return null;
  }
};

module.exports = { archiveEvents, formatDateForFilename, resolveDocumentsDir };
