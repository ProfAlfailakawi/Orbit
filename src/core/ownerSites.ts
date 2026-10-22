/** Websites the owner has confirmed by name. Trusted as given (no discovery); keyed by the program's code name. */
export const OWNER_CONFIRMED_SITES: Record<string, string> = {
  NAHJ: 'https://nahjq8.ai.studio',
};

export const confirmedSite = (codeName: string): string | null => OWNER_CONFIRMED_SITES[codeName.toUpperCase()] ?? null;
