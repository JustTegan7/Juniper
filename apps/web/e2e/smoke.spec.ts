import { expect, test } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test("homepage loads with no sideways scroll", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test("signed-out visitors are sent to login", async ({ page }) => {
  await page.goto("/today");
  await expect(page).toHaveURL(/\/login/);
});

test.describe("signed in", () => {
  test.skip(!email || !password, "Set E2E_EMAIL and E2E_PASSWORD (a Neon dev branch login) to run these.");

  test("log in, land on Today, open Calendar", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Password").fill(password!);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/today/);
    await page.goto("/calendar");
    await expect(page.getByRole("heading", { level: 1, name: /\d{4}/ })).toBeVisible();
  });
});
