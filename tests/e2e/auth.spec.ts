import { expect, test } from "./fixtures";

test("sends a visitor without a session to the login page", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("signs in with the demo company and lands on the dashboard", async ({ signedIn: page }) => {
  await expect(page.getByText("Ama Mensah").first()).toBeVisible();
});

test("rejects a wrong password", async ({ page }) => {
  await page.goto("/auth/login");
  await page.getByLabel("Email or phone number").fill("ama.mensah@kumasitraders.com.gh");
  await page.locator('input[autocomplete="current-password"]').fill("not-the-password1");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Invalid username or password")).toBeVisible();
  await expect(page).toHaveURL(/\/auth\/login/);
});
