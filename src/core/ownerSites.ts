/**
 * Websites the owner has confirmed. Trusted as given (no discovery); keyed by the program's code name, one origin per program.
 * ORBIT visits these addresses and accepts browser-sensor reports only from these origins.
 */
export const OWNER_CONFIRMED_SITES: Record<string, string> = {
  'DR.AHMAD': 'https://dr-alfailakawi.com',
  TEBYAN: 'https://tebyan.dr-alfailakawi.com',
  ORDER: 'https://alturathkw.shop',
  ADMIN: 'https://admin.alturathkw.shop',
  MAJAL: 'https://majal.web.app',
  MIZAN: 'https://mizan-quran.web.app',
  MIRAS: 'https://mirasedu.web.app',
  SCHEDULE: 'https://schedule-kw.com',
  NAHJ: 'https://nahj-os.web.app',
  ACADEMICOS: 'https://academicos-edu.web.app',
};

export const confirmedSite = (codeName: string): string | null => OWNER_CONFIRMED_SITES[codeName.toUpperCase()] ?? null;
