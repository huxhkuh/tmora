import { test, expect, chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
test("production build installs service worker and works offline with IndexedDB", async ({
  page,
  context,
}) => {
  await page.goto("/");
  test.skip(
    !(
      await page.locator("script[type=module]").getAttribute("src")
    )?.startsWith("/assets/"),
    "Offline caching runs only in production build",
  );
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  const cdp = await context.newCDPSession(page);
  const result = await cdp.send("Page.getInstallabilityErrors");
  expect(
    result.installabilityErrors.filter((e) => e.errorId !== "in-incognito"),
  ).toEqual([]);
  await context.setOffline(true);
  await page.reload();
  await page
    .getByRole("button", { name: "צור פרויקט ראשון", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "שם הלקוח", exact: true })
    .fill("לקוח ללא רשת");
  await page.getByRole("button", { name: "שמירה", exact: true }).click();
  await page
    .getByRole("textbox", { name: "שם הפרויקט", exact: true })
    .fill("עבודה לא מקוונת");
  await page.getByRole("button", { name: "שמירה", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "התחל מדידה", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "השהיה", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "השהיה", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "עצירה ושמירה", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await context.setOffline(false);
});
test("normal browser profile is installable and timer survives complete browser restart", async () => {
  const profile = await fs.mkdtemp(path.resolve("../../work/pwa-profile-"));
  let context = await chromium.launchPersistentContext(profile, {
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ["--no-sandbox"] }
      : { channel: "chrome" }),
    headless: true,
  });
  try {
    let page = await context.newPage();
    await page.goto("http://127.0.0.1:5184/");
    test.skip(
      !(
        await page.locator("script[type=module]").getAttribute("src")
      )?.startsWith("/assets/"),
      "Production only",
    );
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    const cdp = await context.newCDPSession(page);
    expect(
      (await cdp.send("Page.getInstallabilityErrors")).installabilityErrors,
    ).toEqual([]);
    await page
      .getByRole("button", { name: "צור פרויקט ראשון", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "שם הלקוח", exact: true })
      .fill("בדיקת התמדה");
    await page.getByRole("button", { name: "שמירה", exact: true }).click();
    await page
      .getByRole("textbox", { name: "שם הפרויקט", exact: true })
      .fill("סגירת דפדפן");
    await page.getByRole("button", { name: "שמירה", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "התחל מדידה", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "השהיה", exact: true }),
    ).toBeVisible();
    await context.close();
    context = await chromium.launchPersistentContext(profile, {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ["--no-sandbox"] }
      : { channel: "chrome" }),
      headless: true,
    });
    page = await context.newPage();
    await page.goto("http://127.0.0.1:5184/");
    await expect(
      page.getByRole("button", { name: "השהיה", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".clock")).not.toHaveText("00:00:00");
    await page
      .getByRole("button", { name: "עצירה ושמירה", exact: true })
      .click();
    await expect(page.locator("tbody tr")).toHaveCount(1);
  } finally {
    await context.close();
  }
});
