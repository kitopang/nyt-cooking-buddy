import path from 'path';
import os from 'os';
import { chromium, type BrowserContext, type Page } from 'playwright';

const AMAZON_FRESH_URL =
  'https://www.amazon.com/alm/storefront?almBrandId=QW1hem9uIEZyZXNo';

const CHROME_PROFILE_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
const CUSTOM_PROFILE_DIR = path.join(os.homedir(), '.nyt-food-playwright');

// Selector fallback arrays — Amazon A/B tests heavily; update if broken.
const SEARCH_BOX_SELECTORS = [
  '#twotabsearchtextbox',
  'input[name="field-keywords"]',
  'input[type="text"][placeholder*="Search"]',
];

const SEARCH_SUBMIT_SELECTORS = [
  '#nav-search-submit-button',
  'input[type="submit"][value="Go"]',
  '[aria-label="Search"]',
];

const ADD_TO_CART_SELECTORS = [
  '.s-result-item input.a-button-input[aria-label="Add to cart"]',
  '.s-result-item input[aria-label*="Add to cart"]',
  '.s-result-item [name="submit.add-to-cart"]',
  '.s-result-item [data-action="add-to-cart-action"] button',
  '.s-result-item button[aria-label*="Add to cart"]',
  '.s-result-item .a-button-primary button',
];

async function findFirst(page: Page, selectors: string[]): Promise<string | null> {
  for (const sel of selectors) {
    if (await page.locator(sel).first().isVisible({ timeout: 2000 }).catch(() => false)) {
      return sel;
    }
  }
  return null;
}

export interface AddResult {
  item: string;
  success: boolean;
  note?: string;
}

export class AmazonFresh {
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async open(): Promise<void> {
    // Prefer the real Chrome profile (all cookies already there).
    // Falls back to a custom profile if Chrome is already running and holds the profile lock.
    try {
      this.context = await chromium.launchPersistentContext(CHROME_PROFILE_DIR, {
        headless: false,
        channel: 'chrome',
        args: ['--start-maximized'],
        viewport: null,
      });
      console.log('[amazon-fresh] Using real Chrome profile.');
    } catch {
      console.log('[amazon-fresh] Chrome is running — falling back to standalone profile. Sign in when prompted (saved for future runs).');
      this.context = await chromium.launchPersistentContext(CUSTOM_PROFILE_DIR, {
        headless: false,
        channel: 'chrome',
        args: ['--start-maximized'],
        viewport: null,
      });
    }
    this.page = await this.context.newPage();
    await this.page.goto(AMAZON_FRESH_URL, { waitUntil: 'domcontentloaded' });

    // Check if logged in: the account nav line shows "Hello, <name>" when signed in.
    const isLoggedIn = async () => {
      const text = await this.page!.locator('#nav-link-accountList-nav-line-1').textContent({ timeout: 3000 }).catch(() => '');
      return text.trim().toLowerCase() !== 'hello, sign in';
    };

    if (!await isLoggedIn()) {
      console.log('[amazon-fresh] Not signed in — please log into Amazon in the browser window. Waiting up to 3 minutes…');
      // Wait up to 3 min for the user to sign in
      await this.page.waitForFunction(
        () => {
          const el = document.querySelector('#nav-link-accountList-nav-line-1');
          return el && el.textContent?.trim().toLowerCase() !== 'hello, sign in';
        },
        undefined,
        { timeout: 180_000 },
      );
      console.log('[amazon-fresh] Signed in. Continuing…');
      await this.page.goto(AMAZON_FRESH_URL, { waitUntil: 'domcontentloaded' });
    }
  }

  async addItem(name: string, searchTerm: string): Promise<AddResult> {
    const page = this.page!;
    try {
      const searchSel = await findFirst(page, SEARCH_BOX_SELECTORS);
      if (!searchSel) return { item: name, success: false, note: 'Search box not found' };

      await page.locator(searchSel).first().click({ clickCount: 3 });
      await page.locator(searchSel).first().fill(searchTerm);

      const submitSel = await findFirst(page, SEARCH_SUBMIT_SELECTORS);
      if (submitSel) {
        await page.locator(submitSel).first().click();
      } else {
        await page.keyboard.press('Enter');
      }

      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1500);

      const cartSel = await findFirst(page, ADD_TO_CART_SELECTORS);
      if (!cartSel) return { item: name, success: false, note: 'No add-to-cart button found' };

      await page.locator(cartSel).first().scrollIntoViewIfNeeded();
      await page.locator(cartSel).first().click();
      await page.waitForTimeout(800);

      return { item: name, success: true };
    } catch (err) {
      return { item: name, success: false, note: err instanceof Error ? err.message : String(err) };
    }
  }

  async close(): Promise<void> {
    await this.context?.close();
    this.context = null;
    this.page = null;
  }
}
