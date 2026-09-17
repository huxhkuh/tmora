import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
test("English workflow, theme, persistence, tabs, mobile and Hebrew return", async ({
  page,
  context,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "גיבוי והגדרות", exact: true })
    .click();
  await page.getByLabel("שפת הממשק", { exact: true }).selectOption("en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(
    page.getByRole("heading", { name: "You're in control." }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Ocean", exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ocean");
  const other = await context.newPage();
  await other.goto("/");
  await expect(
    other.getByRole("button", { name: "Backup & settings", exact: true }),
  ).toBeVisible();
  await expect(other.locator("html")).toHaveAttribute("data-theme", "ocean");
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page
    .getByRole("button", { name: "Create your first project", exact: true })
    .click();
  await page.getByLabel("Client name", { exact: true }).fill("לקוח עברי");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page
    .getByLabel("Project name", { exact: true })
    .fill("English & עברית");
  await page.getByLabel("Pricing", { exact: true }).selectOption("hourly");
  await page.getByLabel("Hourly rate (ILS)", { exact: true }).fill("240");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByLabel("Time classification", { exact: true }).selectOption("billable");
  await page.getByRole("button", { name: "Start timer", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.getByRole("button", { name: "Stop & save", exact: true }).click();
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  await page.getByLabel("Project", { exact: true }).selectOption({ label: "English & עברית" });
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  const text = await fs.readFile(await (await download).path(), "utf8");
  expect(text).toContain("שעות מדויקות");
  expect(text).toContain("English & עברית");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByText("Tasks", { exact: true }).click();
  await page.getByPlaceholder("New task…").fill("Review / סקירה");
  await page
    .getByRole("button", {
      name: "Add task to project English & עברית",
      exact: true,
    })
    .click();
  await expect(page.getByText("Review / סקירה", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Backup & settings", exact: true })
    .click();
  for (const theme of ["Forest", "Plum", "Cream & clay", "Ocean"])
    await page.getByRole("radio", { name: theme, exact: true }).check();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../../work/english-mobile.png",
    fullPage: true,
  });
  await page
    .getByLabel("Interface language", { exact: true })
    .selectOption("he");
  await expect(other.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("button", { name: "גיבוי והגדרות", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "he");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ocean");
  expect(errors).toEqual([]);
});
