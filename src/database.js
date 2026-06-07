const { open } = require("sqlite");
const { Database } = require("sqlite3");
const path = require("path");
const { DATA_DIR } = require("./common");
const { mkdir } = require("fs/promises");

let userDB, dictDB, richDictDB;

async function initDB() {
  await mkdir(DATA_DIR, { recursive: true });
  userDB = await open({
    filename: path.join(DATA_DIR, "user.db"),
    driver: Database,
  });
  await userDB.migrate({
    table: "migrations",
    migrationsPath: path.join(__dirname, "../migrations"),
  });

  dictDB = await open({
    filename: path.join(__dirname, "../assets/data/dict.db"),
    driver: Database,
  });

  // Rich dictionary (optional - gracefully degrades if file missing)
  const { access } = require("fs/promises");
  const richDictPath = path.join(__dirname, "../assets/data/rich_dict.db");
  try {
    await access(richDictPath);
    richDictDB = await open({
      filename: richDictPath,
      driver: Database,
    });
    // Enable WAL mode for better read performance
    await richDictDB.run("PRAGMA journal_mode=WAL");
  } catch {
    richDictDB = null;
  }
}

function getUserDB() {
  return userDB;
}

function getDictDB() {
  return dictDB;
}

function getRichDictDB() {
  return richDictDB;
}

module.exports = {
  initDB,
  getUserDB,
  getDictDB,
  getRichDictDB,
};
