// Intl formatters own native ICU resources. Keep only the current language's
// pair, rather than allocating a formatter for every visible amount/hour total.
let activeLocale, hoursFormatter, moneyFormatter;
function prepare(locale) {
  if (locale === activeLocale) return;
  hoursFormatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  moneyFormatter = new Intl.NumberFormat(locale, {
    style: "currency", currency: "ILS", maximumFractionDigits: 2,
  });
  activeLocale = locale;
}
export function formatHours(hours, locale) {
  prepare(locale);
  return hoursFormatter.format(hours);
}
export function formatMoney(amount, locale) {
  prepare(locale);
  return moneyFormatter.format(amount);
}
