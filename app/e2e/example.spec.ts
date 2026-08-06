import { test, expect } from '@playwright/test';

test('has title or loads main page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/무역|YSACC|Trading/i);
});
