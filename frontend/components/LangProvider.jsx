"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { COOKIE, makeT, pickLang } from "../lib/i18n";

const LangContext = createContext({ lang: "en", t: makeT("en"), setLang() {} });

// `initial` is what the server read from the cookie, so the first paint in the browser matches the server.
export function LangProvider({ initial = "en", children }) {
  const router = useRouter();
  const [lang, setLangState] = useState(pickLang(initial));

  const setLang = useCallback(
    (next) => {
      const l = pickLang(next);
      try {
        document.cookie = `${COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
        document.documentElement.lang = l;
      } catch {}
      setLangState(l);
      router.refresh(); // pages built on the server pick up the new language
    },
    [router],
  );

  const value = useMemo(() => ({ lang, t: makeT(lang), setLang }), [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);
