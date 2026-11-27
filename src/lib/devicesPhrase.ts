/** «جهاز واحد / جهازين / ٣ أجهزة / ١١ جهازًا»: the count of devices as it is said in Arabic after «إلى». */
export function devicesPhrase(count: number): string {
  const n = Math.max(0, Math.floor(count));
  if (n === 1) return 'جهاز واحد';
  if (n === 2) return 'جهازين';
  if (n >= 3 && n <= 10) return `${n} أجهزة`;
  return `${n} جهازًا`;
}
