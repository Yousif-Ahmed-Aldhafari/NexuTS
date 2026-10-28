import { expect, type Page, test } from "@playwright/test";

const password = "SyntheticPassword#2026!";

async function login(page: Page, email: string) {
  await page.goto("/auth/v2/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard\/home-page/);
}

async function logout(page: Page) {
  await page.locator("#user-menu-trigger").click();
  await page.getByText("Log out", { exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/v2\/login/);
}

async function browserRequest<T = unknown>(page: Page, path: string, method = "GET", body?: unknown) {
  return page.evaluate(
    async ({ requestPath, requestMethod, requestBody }) => {
      const response = await fetch(requestPath, {
        method: requestMethod,
        headers: requestBody === undefined ? undefined : { "Content-Type": "application/json" },
        body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
      });
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    { requestPath: path, requestMethod: method, requestBody: body },
  ) as Promise<{ status: number; body: T }>;
}

test("registration, validation, login, dashboard and logout lifecycle", async ({ page }) => {
  const email = `e2e.register.${Date.now()}@synthetic.local`;
  await page.goto("/auth/v2/register");
  await page.locator("#username").fill("Synthetic Browser User");
  await page.locator("#email").fill("invalid-email");
  await page.locator("#password").fill(password);
  await page.locator("#confirmPassword").fill(password);
  await page.locator('button[type="submit"]').click();
  expect(await page.locator("#email").evaluate((element) => element.matches(":invalid"))).toBe(true);

  await page.locator("#email").fill(email);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/auth\/v2\/login/);
  await login(page, email);
  await expect(page).toHaveURL(/\/dashboard\/home-page/);
  await logout(page);
  await page.goto("/dashboard/home-page");
  await expect(page).toHaveURL(/\/auth\/v2\/login/);
});

test("administrator QA workflow works and regular users cannot cross project boundaries", async ({ page }) => {
  await login(page, "e2e.admin@synthetic.local");
  const projectResponse = await browserRequest<{ id: string }>(page, "/api/projects", "POST", {
    name: "Synthetic Browser Project",
    url: "https://example.test/browser-project",
    logo: null,
  });
  expect(projectResponse.status).toBe(201);
  const project = projectResponse.body;
  const tableResponse = await browserRequest<{ id: string }>(page, "/api/tables", "POST", {
    name: "Synthetic Browser Table",
    projectId: project.id,
    tableType: "TEST_CASES",
  });
  expect(tableResponse.status).toBe(201);
  const table = tableResponse.body;
  const entryResponse = await browserRequest(page, "/api/entries", "POST", {
    tableId: table.id,
    title: "Synthetic Browser Entry",
    username: "Synthetic Administrator",
    description: "Browser workflow",
    stepsToReproduce: "Open the synthetic workflow",
    result: "Passed",
    expectedResult: "Passed",
    status: "SUCCESS",
    fixStatus: "FIXED",
    assignedTo: "",
    screenshotClipName: "",
    screenshotClipUrl: "",
  });
  expect(entryResponse.status).toBe(201);

  await page.goto("/dashboard/qa-boards");
  await expect(page.getByText("Synthetic Browser Project", { exact: true })).toBeVisible();
  await page.goto(`/dashboard/qa-boards/${project.id}`);
  await expect(page.getByText("Synthetic Browser Table", { exact: true })).toBeVisible();
  await page.goto("/dashboard/settings");
  await expect(page.getByText("System Users", { exact: true })).toBeVisible();
  await logout(page);

  await login(page, "e2e.member@synthetic.local");
  const foreign = await browserRequest(page, `/api/projects/${process.env.E2E_FOREIGN_PROJECT_ID}`);
  expect([403, 404]).toContain(foreign.status);
  const createDenied = await browserRequest(page, "/api/projects", "POST", {
    name: "Forbidden Browser Project",
    url: "",
    logo: null,
  });
  expect(createDenied.status).toBe(403);
  await page.goto("/dashboard/qa-boards");
  await expect(page.getByText("Synthetic Foreign Project", { exact: true })).toHaveCount(0);
});
