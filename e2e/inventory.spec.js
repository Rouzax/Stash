import { test, expect } from '@playwright/test';

// otheradmin's family starts with no items and no consumption, so these tests
// cannot disturb the counts that admin.spec.js asserts on family 1. They build
// on each other's state, hence serial.
test.describe.configure({ mode: 'serial' });

const ITEM = 'Gummy Bears';

async function login(page) {
  await page.goto('/');
  await page.fill('input[autocomplete="username"]', 'otheradmin');
  await page.fill('input[type="password"]', 'testpassword');
  await page.click('button.btn-primary');
  await page.waitForSelector('.header');
}

function card(page) {
  return page.locator('.card', { has: page.locator('.item-name', { hasText: ITEM }) });
}

async function takeOne(page, expectedCount) {
  await card(page).locator('.btn-take').first().click();
  await expect(card(page).locator('.item-count')).toHaveText(expectedCount);
}

test('Empty stash shows the empty state and a calm rush meter', async ({ page }) => {
  await login(page);
  await expect(page.locator('.empty-title')).toHaveText('THE STASH IS EMPTY');
  await expect(page.locator('.rush-label')).toContainText('0%');
});

test('Add an item', async ({ page }) => {
  await login(page);
  await page.click('.fab');
  await page.fill('.modal .field:has(label:text-is("NAME")) input', ITEM);
  await page.fill('.modal .field:has(label:text-is("COUNT")) input', '3');
  await page.fill('.modal .field:has(label:text-is("LOW STOCK ≤")) input', '1');
  await page.click('.modal .btn-primary');
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect(card(page).locator('.item-count')).toHaveText('3');
  await expect(card(page).locator('.low-badge')).toHaveCount(0);
});

test('Taking fills the rush meter and is saved on the server', async ({ page }) => {
  await login(page);
  await takeOne(page, '2');
  await expect(page.locator('.rush-label')).not.toContainText(/\b0%/);

  await page.reload();
  await page.waitForSelector('.header');
  await expect(card(page).locator('.item-count')).toHaveText('2');
  await expect(page.locator('.rush-label')).not.toContainText(/\b0%/);
});

test('Reaching the threshold shows the LOW badge', async ({ page }) => {
  await login(page);
  await takeOne(page, '1');
  await expect(card(page).locator('.low-badge')).toBeVisible();
});

test('Count never goes below zero', async ({ page }) => {
  await login(page);
  await takeOne(page, '0');
  await card(page).locator('.btn-take').first().click();
  await expect(card(page).locator('.item-count')).toHaveText('0');

  await page.reload();
  await page.waitForSelector('.header');
  await expect(card(page).locator('.item-count')).toHaveText('0');
});

test('Delete the item', async ({ page }) => {
  await login(page);
  await card(page).locator('.btn-edit').click();
  await page.click('.modal .btn-danger');
  await page.click('.modal .btn-danger:has-text("CONFIRM")');
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator('.empty-title')).toHaveText('THE STASH IS EMPTY');
});
