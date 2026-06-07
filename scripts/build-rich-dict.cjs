// Direct kajweb/dict JSON → rich_dict.db converter
// Bypasses PostgreSQL entirely — reads 81 book zips, outputs SQLite

const { readFileSync, writeFileSync, mkdirSync, readdirSync } = require("fs");
const { join, basename } = require("path");
const { execSync } = require("child_process");
const initSqlJs = require("sql.js");

const BOOK_DIR = "D:/claude/kajweb-dict/dict-master/book";
const OUTPUT = "D:/claude/DWords/assets/data/rich_dict.db";
const TEMP = "D:/claude/kajweb-dict/temp";

// Map book slug → human-readable Chinese name
function bookSlugToName(slug) {
  // PEP小学 (人教版小学)
  const pepXiaoXue = slug.match(/^PEPXiaoXue(\d)_(\d)$/);
  if (pepXiaoXue) {
    const grades = {3:"三",4:"四",5:"五",6:"六"};
    const sem = pepXiaoXue[2] === "1" ? "上册" : "下册";
    return `人教版小学${grades[pepXiaoXue[1]] || pepXiaoXue[1]}年级${sem}`;
  }
  // PEP初中 (人教版初中)
  const pepChuZhong = slug.match(/^PEPChuZhong(\d)_(\d)$/);
  if (pepChuZhong) {
    const grades = {7:"七",8:"八",9:"九"};
    const sem = pepChuZhong[2] === "2" ? "下册" : "上册";
    if (pepChuZhong[1] === "9") return "人教版初中九年级全一册";
    return `人教版初中${grades[pepChuZhong[1]] || pepChuZhong[1]}年级${sem}`;
  }
  // PEP高中 (人教版高中): 1-5=必修, 6-11=选修
  const pepGaoZhong = slug.match(/^PEPGaoZhong_(\d+)$/);
  if (pepGaoZhong) {
    const n = parseInt(pepGaoZhong[1]);
    const nums = "一二三四五六七八九十";
    const label = nums[n-1] || n;
    return `人教版高中${n <= 5 ? "必修" : "选修"}${label}`;
  }
  // 北师大版高中
  const bsgz = slug.match(/^(reciteWord_)?BeiShiGaoZhong_(\d+)$/);
  if (bsgz) {
    const n = parseInt(bsgz[2]);
    const nums = "一二三四五六七八九十";
    const label = nums[n-1] || n;
    if (n <= 5) return `北师大版高中必修${label}`;
    return `北师大版高中选修${label}`;
  }
  // 外研社版初中 (reciteWord_timestamp_WaiYanSheChuZhong_N)
  const wys = slug.match(/^reciteWord_\d+_WaiYanSheChuZhong_(\d+)$/);
  if (wys) {
    const n = parseInt(wys[1]);
    const grades = {1:"七年级上册",2:"八年级下册",3:"九年级上册",4:"九年级下册",5:"八年级上册",6:"七年级下册"};
    return `外研社版初中${grades[n] || `第${n}册`}`;
  }

  // Generic patterns: NAME_N or NAMEluan_N (base may include digits, e.g. CET4, Level8)
  const generic = slug.match(/^([A-Za-z]+\d*)(luan)?_(\d+)$/);
  if (generic) {
    const base = generic[1];
    const shuffled = generic[2] ? "乱序版" : "";
    const vol = generic[3];
    const names = {
      CET4: "大学英语四级", CET6: "大学英语六级",
      GMAT: "GMAT词汇", GRE: "GRE词汇",
      IELTS: "雅思词汇", TOEFL: "托福词汇", SAT: "SAT词汇",
      KaoYan: "考研英语", BEC: "商务英语",
      Level4: "英语专业四级", Level8: "英语专业八级",
      ChuZhong: "初中英语词汇", GaoZhong: "高中英语词汇",
      // luan variants (greedy [A-Za-z]+ consumes "luan" when no digit precedes it)
      ChuZhongluan: "初中英语词汇乱序版",
      GaoZhongluan: "高中英语词汇乱序版",
      GMATluan: "GMAT词汇乱序版",
      IELTSluan: "雅思词汇乱序版",
      KaoYanluan: "考研英语乱序版",
    };
    return `${names[base] || base}${shuffled}_${vol}`;
  }

  return slug; // fallback
}

// Ensure temp dir
mkdirSync(TEMP, { recursive: true });

async function main() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  // Enable WAL
  db.run("PRAGMA journal_mode=WAL");
  db.run("PRAGMA synchronous=OFF");
  db.run("PRAGMA cache_size=-64000"); // 64MB cache

  // Create tables
  db.run(`CREATE TABLE IF NOT EXISTS word_books (
    slug TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', cover TEXT NOT NULL DEFAULT ''
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS word_master (
    slug TEXT NOT NULL, word TEXT NOT NULL, book_slug TEXT NOT NULL DEFAULT '',
    us_pronounce TEXT NOT NULL DEFAULT '', uk_pronounce TEXT NOT NULL DEFAULT '',
    remember TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (slug, book_slug)
  )`);
  db.run("CREATE INDEX IF NOT EXISTS idx_word_master_word ON word_master(word)");
  db.run("CREATE INDEX IF NOT EXISTS idx_word_master_book ON word_master(book_slug)");

  db.run(`CREATE TABLE IF NOT EXISTS word_translations (
    word_slug TEXT NOT NULL DEFAULT '', pos TEXT NOT NULL DEFAULT '',
    trans_cn TEXT NOT NULL DEFAULT '', trans_en TEXT NOT NULL DEFAULT ''
  )`);
  db.run("CREATE INDEX IF NOT EXISTS idx_translations_slug ON word_translations(word_slug)");

  db.run(`CREATE TABLE IF NOT EXISTS word_phrases (
    word_slug TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '',
    trans_cn TEXT NOT NULL DEFAULT ''
  )`);
  db.run("CREATE INDEX IF NOT EXISTS idx_phrases_slug ON word_phrases(word_slug)");

  db.run(`CREATE TABLE IF NOT EXISTS word_sentences (
    word_slug TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '',
    trans_cn TEXT NOT NULL DEFAULT ''
  )`);
  db.run("CREATE INDEX IF NOT EXISTS idx_sentences_slug ON word_sentences(word_slug)");

  db.run(`CREATE TABLE IF NOT EXISTS word_synonyms (
    word_slug TEXT NOT NULL DEFAULT '', pos TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '', trans_cn TEXT NOT NULL DEFAULT ''
  )`);
  db.run("CREATE INDEX IF NOT EXISTS idx_synonyms_slug ON word_synonyms(word_slug)");

  db.run(`CREATE TABLE IF NOT EXISTS word_cognates (
    word_slug TEXT NOT NULL DEFAULT '', pos TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '', trans_cn TEXT NOT NULL DEFAULT ''
  )`);
  db.run("CREATE INDEX IF NOT EXISTS idx_cognates_slug ON word_cognates(word_slug)");

  // Prepare statements
  const insertBook = db.prepare("INSERT OR IGNORE INTO word_books VALUES (?, ?, ?)");
  const insertWord = db.prepare("INSERT OR IGNORE INTO word_master VALUES (?, ?, ?, ?, ?, ?)");
  const insertTrans = db.prepare("INSERT INTO word_translations VALUES (?, ?, ?, ?)");
  const insertPhrase = db.prepare("INSERT INTO word_phrases VALUES (?, ?, ?)");
  const insertSentence = db.prepare("INSERT INTO word_sentences VALUES (?, ?, ?)");
  const insertSynonym = db.prepare("INSERT INTO word_synonyms VALUES (?, ?, ?, ?)");
  const insertCognate = db.prepare("INSERT INTO word_cognates VALUES (?, ?, ?, ?)");

  const bookZips = readdirSync(BOOK_DIR).filter(f => f.endsWith(".zip"));
  console.log(`Found ${bookZips.length} book zip files`);

  let totalWords = 0;
  let totalTrans = 0;
  let totalPhrases = 0;
  let totalSentences = 0;
  let totalSynonyms = 0;
  let totalCognates = 0;

  for (const zipFile of bookZips) {
    const zipPath = join(BOOK_DIR, zipFile);
    const bookSlug = basename(zipFile, ".zip").replace(/^\d+_/, "");

    // Extract
    execSync(`unzip -o "${zipPath}" -d "${TEMP}"`, { stdio: "pipe" });

    // Find JSON file
    const files = readdirSync(TEMP).filter(f => f.endsWith(".json"));
    if (files.length === 0) continue;
    const jsonPath = join(TEMP, files[0]);

    // Insert book
    insertBook.run([bookSlug, bookSlugToName(bookSlug), ""]);

    // Read JSONL (one JSON per line)
    const content = readFileSync(jsonPath, "utf8");
    const lines = content.trim().split("\n");

    for (const line of lines) {
      if (!line.trim()) continue;
      let item;
      try {
        item = JSON.parse(line);
      } catch { continue; }

      const w = item.content?.word?.content;
      const word = (item.headWord || "").trim();
      if (!word) continue;

      const slug = word.toLowerCase();
      const usPhone = w?.usphone || "";
      const ukPhone = w?.ukphone || "";
      const remember = w?.remMethod?.val || "";

      // Insert word
      insertWord.run([slug, word, bookSlug, usPhone, ukPhone, remember]);
      totalWords++;

      // Translations
      if (w?.trans) {
        for (const t of w.trans) {
          insertTrans.run([slug, t.pos || "", t.tranCn || "", t.tranOther || ""]);
          totalTrans++;
        }
      }

      // Phrases
      if (w?.phrase?.phrases) {
        for (const p of w.phrase.phrases) {
          insertPhrase.run([slug, p.pContent || "", p.pCn || ""]);
          totalPhrases++;
        }
      }

      // Sentences
      if (w?.sentence?.sentences) {
        for (const s of w.sentence.sentences) {
          insertSentence.run([slug, s.sContent || "", s.sCn || ""]);
          totalSentences++;
        }
      }

      // Synonyms (syno)
      if (w?.syno?.synos) {
        for (const s of w.syno.synos) {
          const hwds = (s.hwds || []).map(h => h.w).join(", ");
          insertSynonym.run([slug, s.pos || "", hwds, s.tran || ""]);
          totalSynonyms++;
        }
      }

      // Cognates (relWord)
      if (w?.relWord?.rels) {
        for (const r of w.relWord.rels) {
          const words = (r.words || []).map(rw => `${rw.hwd}(${rw.tran})`).join(", ");
          insertCognate.run([slug, r.pos || "", words, ""]);
          totalCognates++;
        }
      }
    }

    // Clean up temp
    execSync(`rm -f "${TEMP}"/*.json`, { stdio: "pipe" });

    if (totalWords % 1000 === 0 || totalWords === 0) {
      console.log(`  Progress: ${totalWords} words...`);
    }
  }

  // Free statements
  insertBook.free();
  insertWord.free();
  insertTrans.free();
  insertPhrase.free();
  insertSentence.free();
  insertSynonym.free();
  insertCognate.free();

  // Write database
  console.log("Writing database file...");
  const data = db.export();
  const buffer = Buffer.from(data);
  mkdirSync("D:/claude/DWords/assets/data", { recursive: true });
  writeFileSync(OUTPUT, buffer);
  db.close();

  const sizeMB = (buffer.length / (1024 * 1024)).toFixed(1);
  console.log(`\n=== Export Complete ===`);
  console.log(`Words: ${totalWords}`);
  console.log(`Translations: ${totalTrans}`);
  console.log(`Phrases: ${totalPhrases}`);
  console.log(`Sentences: ${totalSentences}`);
  console.log(`Synonyms: ${totalSynonyms}`);
  console.log(`Cognates: ${totalCognates}`);
  console.log(`File size: ${sizeMB} MB`);
  console.log(`Output: ${OUTPUT}`);
}

main().catch(err => {
  console.error("Build failed:", err);
  process.exit(1);
});
