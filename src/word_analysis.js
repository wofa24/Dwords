const { readFile } = require("fs/promises");
const path = require("path");

let affixData = null;

async function loadAffixData() {
  if (!affixData) {
    const raw = await readFile(
      path.join(__dirname, "../assets/data/word_roots.json"),
      "utf-8",
    );
    affixData = JSON.parse(raw);
    // Pre-process: sort prefixes/suffixes by length desc for greedy matching
    const sortByLen = (a, b) => b.affix.length - a.affix.length;
    affixData.prefixes.sort(sortByLen);
    affixData.suffixes.sort(sortByLen);
    affixData.roots.sort(sortByLen);
  }
  return affixData;
}

/**
 * Match an affix at the start of a word. Tries direct match first,
 * then variant forms.
 */
function matchPrefix(word, prefixes) {
  const lower = word.toLowerCase();
  for (const pref of prefixes) {
    if (lower.startsWith(pref.affix)) {
      return { ...pref, matched: pref.affix };
    }
    if (pref.variants) {
      for (const variant of pref.variants.split("/")) {
        const v = variant.trim();
        if (lower.startsWith(v)) {
          return { ...pref, matched: v, affix: v };
        }
      }
    }
  }
  return null;
}

/**
 * Match an affix at the end of a word.
 */
function matchSuffix(word, suffixes) {
  const lower = word.toLowerCase();
  for (const suff of suffixes) {
    if (lower.endsWith(suff.affix)) {
      return { ...suff, matched: suff.affix };
    }
    if (suff.variants) {
      for (const variant of suff.variants.split("/")) {
        const v = variant.trim();
        if (lower.endsWith(v)) {
          return { ...suff, matched: v, affix: v };
        }
      }
    }
  }
  return null;
}

/**
 * Try to match a root anywhere in the word (after prefix removal).
 */
function matchRoot(segment, roots) {
  const lower = segment.toLowerCase();
  for (const root of roots) {
    // Check direct match
    if (lower === root.affix) {
      return { ...root, matched: root.affix };
    }
    // Check if segment starts with or ends with the root
    if (lower.startsWith(root.affix) && lower.length >= root.affix.length + 1) {
      return { ...root, matched: root.affix };
    }
    if (lower.endsWith(root.affix) && lower.length >= root.affix.length + 1) {
      return { ...root, matched: root.affix };
    }
    if (lower.includes(root.affix) && root.affix.length >= 2) {
      return { ...root, matched: root.affix };
    }
    // Check variants
    if (root.variants) {
      for (const variant of root.variants.split("/")) {
        const v = variant.trim();
        if (
          lower === v ||
          lower.startsWith(v) ||
          lower.endsWith(v) ||
          (lower.includes(v) && v.length >= 2)
        ) {
          return { ...root, matched: v, affix: v };
        }
      }
    }
  }
  return null;
}

/**
 * Analyze a word to find its root/affix components.
 * Returns null if no meaningful decomposition found (less than 2 parts).
 */
async function analyzeWord(word) {
  const data = await loadAffixData();
  const lower = word.toLowerCase().trim();

  // 1. Check curated words first
  if (data.words[lower]) {
    return {
      word: lower,
      source: "curated",
      parts: data.words[lower].parts,
    };
  }

  // 2. Algorithmic decomposition
  const parts = [];
  let remaining = lower;

  // Try prefix (longest match first)
  const prefix = matchPrefix(remaining, data.prefixes);
  if (prefix && remaining.length > prefix.matched.length + 2) {
    parts.push({
      text: prefix.matched,
      type: "prefix",
      meaning: prefix.meaning,
    });
    remaining = remaining.slice(prefix.matched.length);
  }

  // Try suffix (longest match first)
  const suffix = matchSuffix(remaining, data.suffixes);
  if (suffix && remaining.length > suffix.matched.length + 2) {
    const rootText = remaining.slice(
      0,
      remaining.length - suffix.matched.length,
    );
    if (rootText.length >= 2) {
      // Try to identify the root
      const rootMatch = matchRoot(rootText, data.roots);
      if (rootMatch) {
        parts.push({
          text: rootMatch.matched,
          type: "root",
          meaning: rootMatch.meaning,
        });
        if (rootText.length > rootMatch.matched.length) {
          // There's extra text - could be interfix or additional letters
          const extra = rootText.replace(rootMatch.matched, "");
          if (extra.length <= 2) {
            parts.push({ text: extra, type: "interfix", meaning: "连接" });
          }
        }
      } else if (rootText.length <= 4) {
        parts.push({ text: rootText, type: "root", meaning: "" });
      }
      parts.push({
        text: suffix.matched,
        type: "suffix",
        meaning: suffix.meaning,
      });
    }
  } else if (suffix && remaining.length <= suffix.matched.length + 2) {
    // Word is mostly suffix - not informative
  } else {
    // No clear suffix, try root match on remaining
    const rootMatch = matchRoot(remaining, data.roots);
    if (rootMatch && remaining.length > rootMatch.matched.length) {
      parts.push({
        text: rootMatch.matched,
        type: "root",
        meaning: rootMatch.meaning,
      });
      const extra = remaining.replace(rootMatch.matched, "");
      if (extra.length <= 3) {
        parts.push({ text: extra, type: "interfix", meaning: "连接" });
      }
    }
  }

  // Normalize all parts to ensure text and meaning are strings
  const normalized = parts.map((p) => ({
    text: String(p.text || p.matched || ""),
    type: String(p.type || "unknown"),
    meaning: String(p.meaning || ""),
  }));

  // Only return if we found at least 2 meaningful parts
  const meaningfulParts = normalized.filter((p) => p.type !== "interfix");
  return meaningfulParts.length >= 2
    ? { word: lower, source: "algorithmic", parts: normalized }
    : null;
}

module.exports = { analyzeWord };
