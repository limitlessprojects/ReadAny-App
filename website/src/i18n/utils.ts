import { type UIKey, defaultLang, ui } from "./ui";

export { defaultLang };

export function getLangFromUrl(url: URL) {
  const [, lang] = url.pathname.split("/");
  if (lang in ui) return lang as keyof typeof ui;
  return defaultLang;
}

export function useTranslations(lang: keyof typeof ui) {
  return function t(key: UIKey) {
    const langUi = ui[lang] || ui[defaultLang];
    return langUi[key] || ui[defaultLang][key];
  };
}
