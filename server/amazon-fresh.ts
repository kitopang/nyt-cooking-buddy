import { chromium, type Browser, type Page } from 'playwright';

const AMAZON_FRESH_URL =
  'https://www.amazon.com/alm/storefront?almBrandId=QW1hem9uIEZyZXNo';

// Selector fallback arrays — Amazon A/B tests heavily; update if broken.
// Last verified: 2025-02

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
  private browser: Browser | null = null;
  private page: Page | null = null;

  async open(): Promise<void> {
    this.browser = await chromium.launch({ headless: false, args: ['--start-maximized'] });
    const context = await this.browser.newContext({ viewport: null });
    this.page = await context.newPage();
    await this.page.goto(AMAZON_FRESH_URL, { waitUntil: 'domcontentloaded' });
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
    await this.browser?.close();
    this.browser = null;
    this.page = null;
  }
}
