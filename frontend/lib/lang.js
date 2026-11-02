import { cookies } from "next/headers";
import { COOKIE, makeT, pickLang } from "./i18n";

// For server components: the language the visitor chose (kept in a cookie), and its text function.
export async function getLang() {
  try {
    const jar = await cookies();
    return pickLang(jar.get(COOKIE)?.value);
  } catch {
    return "en";
  }
}

export async function getT() {
  return makeT(await getLang());
}
