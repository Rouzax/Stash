import { test, expect } from '@playwright/test';
import { seedDatabase } from './seed.js';

test.beforeAll(async () => {
  await seedDatabase();
});

async function login(page, username = 'superadmin') {
  await page.goto('/');
  await page.fill('input[autocomplete="username"]', username);
  await page.fill('input[type="password"]', 'testpassword');
  await page.click('button.btn-primary');
  await page.waitForSelector('.header');
}

async function goToAdmin(page) {
  await page.click('.menu-btn');
  await page.click('.menu-item:has-text("FAMILY")');
  await page.waitForSelector('.admin-area');
}

// Non-admin tests first to stay within login rate limit (5/min per route)

test('Admin menu hidden for regular member', async ({ page }) => {
  await login(page, 'member1');
  await page.click('.menu-btn');
  await expect(page.locator('.menu-item:has-text("FAMILY")')).toHaveCount(0);
});

test('System tab hidden for regular admin', async ({ page }) => {
  await login(page, 'familyadmin');
  await goToAdmin(page);
  await expect(page.locator('.admin-tab')).toHaveCount(3);
  await expect(page.locator('.admin-tab:has-text("SYSTEM")')).toHaveCount(0);
});

test('Users tab - user list', async ({ page }) => {
  await login(page);
  await goToAdmin(page);
  await expect(page.locator('.admin-tab.active')).toContainText('USERS');
  await expect(page.locator('.user-row')).toHaveCount(3);
  await page.screenshot({ path: 'docs/images/admin-users.png', fullPage: true });
});

test('Settings tab', async ({ page }) => {
  await login(page);
  await goToAdmin(page);
  await page.click('.admin-tab:has-text("SETTINGS")');
  await page.waitForSelector('.admin-section');
  await expect(page.locator('.admin-section input').first()).toHaveValue('The Testers');
  await page.screenshot({ path: 'docs/images/admin-settings.png', fullPage: true });
});

test('Activity tab', async ({ page }) => {
  await login(page);
  await goToAdmin(page);
  await page.click('.admin-tab:has-text("ACTIVITY")');
  await page.waitForSelector('.activity-feed');
  await expect(page.locator('.activity-entry')).not.toHaveCount(0);
  await page.screenshot({ path: 'docs/images/admin-activity.png', fullPage: true });
});

test('System tab - superadmin only', async ({ page }) => {
  await login(page);
  await goToAdmin(page);
  await page.click('.admin-tab:has-text("SYSTEM")');
  await page.waitForSelector('.user-list');
  await expect(page.locator('.user-row')).toHaveCount(4);
  await expect(page.locator('.family-row')).toHaveCount(2);
  await page.screenshot({ path: 'docs/images/admin-system.png', fullPage: true });
});
