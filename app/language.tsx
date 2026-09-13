"use client";

import { createContext, useContext, useState } from "react";
import { Languages } from "lucide-react";

type Locale = "en" | "tg" | "ru";
// BEGINNER SYNTAX: Text uses quotes, items use commas, and [square brackets] hold a list.
// FRONTEND EDIT: Each entry is [English, Tajik, Russian]. Add or change translated text here.
// English-only operational messages remain beside their JSX in roadlens-app.tsx and review/page.tsx.
const copy = {
  reportingActive: ["Road reporting active", "Гузоришдиҳии роҳ фаъол аст", "Приём дорожных отчётов активен"],
  reportingUnavailable: ["Reporting temporarily unavailable", "Гузориш муваққатан дастнорас аст", "Приём отчётов временно недоступен"],
  checkingNetwork: ["Checking report network…", "Санҷиши шабака…", "Проверка сети…"],
  liveReports: ["live reports", "гузориши фаъол", "активных отчётов"], operations: ["Operations", "Идоракунӣ", "Управление"],
  startScan: ["Start road scan", "Оғози санҷиши роҳ", "Начать осмотр дороги"], overview: ["Operations overview", "Шарҳи амалиёт", "Обзор операций"],
  roadOperations: ["Dushanbe road operations", "Идораи роҳҳои Душанбе", "Дорожные работы Душанбе"],
  intro: ["From phone evidence to a verified repair queue.", "Аз акси телефон то навбати тасдиқшудаи таъмир.", "От фотографии до подтверждённой очереди ремонта."],
  openReports: ["Open reports", "Гузоришҳои кушода", "Открытые отчёты"], awaitingReview: ["Awaiting review", "Дар интизори санҷиш", "Ожидают проверки"],
  repairFlow: ["In repair flow", "Дар раванди таъмир", "В процессе ремонта"], repaired: ["Repaired", "Таъмиршуда", "Отремонтировано"],
  priorityQueue: ["Priority queue", "Навбати афзалиятнок", "Приоритетная очередь"], liveMap: ["Live map", "Харитаи зинда", "Живая карта"],
  hotspots: ["Hotspots", "Минтақаҳои доғ", "Очаги повреждений"], inspectionRoute: ["Inspection route", "Масири санҷиш", "Маршрут инспекции"],
  focusPriority: ["Focus priority", "Намоиши афзалият", "Показать приоритет"], newObservation: ["New observation", "Мушоҳидаи нав", "Новое наблюдение"],
  scanDamage: ["Scan road damage", "Санҷиши осеби роҳ", "Осмотр повреждения"], addPhoto: ["Add a clear road photo", "Акси равшани роҳро илова кунед", "Добавьте чёткое фото дороги"],
  takePhoto: ["Take photo", "Акс гиред", "Сделать фото"], uploadPhoto: ["Upload photo", "Боркунии акс", "Загрузить фото"],
  refresh: ["Refresh", "Навсозӣ", "Обновить"], analyze: ["Analyze photo", "Таҳлили акс", "Анализировать фото"], submitReview: ["Submit for human review", "Барои санҷиши инсон фиристед", "Отправить на проверку"],
  adminTitle: ["Road inspection admin", "Идораи санҷиши роҳ", "Панель дорожной инспекции"], needsDecision: ["Needs decision", "Қарор лозим", "Требует решения"],
  activeWork: ["Active work", "Кори фаъол", "Активные работы"], urgent: ["Urgent", "Фаврӣ", "Срочно"], overdue: ["Overdue", "Деркардашуда", "Просрочено"],
  averageResolution: ["Avg. resolution", "Миёнаи анҷом", "Среднее время"], reportQueue: ["Report queue", "Навбати гузоришҳо", "Очередь отчётов"],
  review: ["Review", "Санҷиш", "Проверка"], work: ["Work", "Кор", "Работа"], done: ["Done", "Тайёр", "Готово"], all: ["All", "Ҳама", "Все"], exportCsv: ["Export CSV", "Содироти CSV", "Экспорт CSV"],
} as const;
type CopyKey = keyof typeof copy;
const index: Record<Locale, number> = { en: 0, tg: 1, ru: 2 };
const LanguageContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void; t: (key: CopyKey) => string }>({ locale: "en", setLocale: () => undefined, t: (key) => copy[key][0] });

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const setLocale = (next: Locale) => { setLocaleState(next); document.documentElement.lang = next; };
  return <LanguageContext.Provider value={{ locale, setLocale, t: (key) => copy[key][index[locale]] }}>{children}</LanguageContext.Provider>;
}
export function useLanguage() { return useContext(LanguageContext); }
export function LanguageControl() {
  const { locale, setLocale } = useLanguage();
  return <label className="language-control"><Languages aria-hidden="true" /><span className="sr-only">Language</span><select aria-label="Language" value={locale} onChange={(event) => setLocale(event.target.value as Locale)}><option value="en">EN</option><option value="tg">TJ</option><option value="ru">RU</option></select></label>;
}
