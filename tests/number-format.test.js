import test from "node:test";
import assert from "node:assert/strict";
import { formatHours, formatMoney } from "../src/number-format.js";

test("cached number display preserves rounding, currency and bidi across language switches", () => {
  for (const locale of ["he-IL", "en-GB", "he-IL"]) {
    for (const value of [0, 1 / 3600, 1.005, 12345.6789, -12.5]) {
      assert.equal(formatHours(value, locale), value.toLocaleString(locale, { maximumFractionDigits: 2 }));
      assert.equal(formatMoney(value, locale), value.toLocaleString(locale, {
        style: "currency", currency: "ILS", maximumFractionDigits: 2,
      }));
    }
  }
});
