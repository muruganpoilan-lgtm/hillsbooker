import en from "./en";
import ta from "./ta";

// Languages the site offers, in the order shown in the switch. To add Hindi or Malayalam: make hi.js or ml.js next to
// ta.js with the same keys, import it here, and add it to DICT and LANGS.
export const LANGS = [
  ["en", "English"],
  ["ta", "தமிழ்"],
];
export const COOKIE = "hb_lang";
const DICT = { en, ta };

export const pickLang = (v) => (Object.hasOwn(DICT, v) ? v : "en");

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);

// t("key", {name: "x"}) gives the text; t.n("unit.night", 3) picks singular or plural.
export function makeT(lang) {
  const d = DICT[pickLang(lang)];
  const get = (key) => d[key] ?? en[key] ?? key;
  const t = (key, vars) => fill(get(key), vars);
  t.n = (key, count, vars) => {
    const parts = get(key).split("|");
    return fill(parts.length > 1 && count !== 1 ? parts[1] : parts[0], { n: count, ...vars });
  };
  t.lang = pickLang(lang);
  return t;
}
