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

test('Register step 1 - invalid invite code shows error', async ({ page }) => {
  await page.goto('/');
  await page.click('.auth-tabs button:nth-child(2)');
  await page.fill('input[maxlength="8"]', 'ZZZZZZZZ');
  await page.click('button.btn-primary:has-text("CONTINUE")');
  await expect(page.locator('.error-msg')).toContainText('Invalid or expired invite code');
});

test('Register step 1 - valid member code shows join form', async ({ page }) => {
  await page.goto('/');
  await page.click('.auth-tabs button:nth-child(2)');
  await page.fill('input[maxlength="8"]', 'TESTJOIN');
  await page.click('button.btn-primary:has-text("CONTINUE")');
  await expect(page.locator('.hint-box')).toContainText('The Testers');
  await expect(page.locator('button.btn-primary:has-text("JOIN FAMILY")')).toBeVisible();
});

test('Register step 1 - valid starter code shows create form', async ({ page }) => {
  await page.goto('/');
  await page.click('.auth-tabs button:nth-child(2)');
  await page.fill('input[maxlength="8"]', 'NEWHOME0');
  await page.click('button.btn-primary:has-text("CONTINUE")');
  await expect(page.locator('.hint-box')).toContainText('NEW FAMILY');
  await expect(page.locator('label:has-text("FAMILY NAME")')).toBeVisible();
  await expect(page.locator('button.btn-primary:has-text("CREATE FAMILY")')).toBeVisible();
});

test('Register - back button returns to step 1 with code preserved', async ({ page }) => {
  await page.goto('/');
  await page.click('.auth-tabs button:nth-child(2)');
  await page.fill('input[maxlength="8"]', 'TESTJOIN');
  await page.click('button.btn-primary:has-text("CONTINUE")');
  await expect(page.locator('.hint-box')).toBeVisible();
  await page.click('button:has-text("Back to invite code")');
  await expect(page.locator('input[maxlength="8"]')).toHaveValue('TESTJOIN');
});

test('Register - member invite full signup', async ({ page }) => {
  await page.goto('/');
  await page.click('.auth-tabs button:nth-child(2)');
  await page.fill('input[maxlength="8"]', 'TESTJOIN');
  await page.click('button.btn-primary:has-text("CONTINUE")');
  await expect(page.locator('.hint-box')).toContainText('The Testers');
  await page.fill('input[autocomplete="username"]', 'newmember');
  await page.fill('input[autocomplete="new-password"]', 'testpassword');
  await page.locator('input[autocomplete="new-password"]').nth(1).fill('testpassword');
  await page.click('button.btn-primary:has-text("JOIN FAMILY")');
  await page.waitForSelector('.header');
});
