import { chromium, type Browser, type Page } from 'playwright';
import type { AggregatedIngredient } from './types.ts';

// Amazon Fresh storefront URL
const AMAZON_FRESH_URL =
  'https://www.amazon.com/alm/storefront?almBrandId=QW1hem9uIEZyZXNo';

// ---------------------------------------------------------------------------
// Selectors — maintained as ordered fallback arrays. Amazon A/B tests heavily;
// update these if the script stops finding elements.
// Last verified: 2025-02
// ---------------------------------------------------------------------------

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
  // Amazon Fresh result grid add-to-cart buttons
  '.s-result-item [name="submit.add-to-cart"]',
  '.s-result-item [data-action="add-to-cart-action"] button',
  '.s-result-item button[aria-label*="Add to cart"]',
  '.s-result-item .a-button-primary button',
];

// ---------------------------------------------------------------------------

async function findFirst(page: Page, selectors: string[]): Promise<string | null> {
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
      return sel;
    }
  }
  return null;
}

export interface AddResult {
  ingredient: string;
  success: boolean;
  note?: string;
}

export class AmazonFresh {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async open(): Promise<void> {
    this.browser = await chromium.launch({
      headless: false, // non-headless so user can handle login/CAPTCHA
      args: ['--start-maximized'],
    });
    const context = await this.browser.newContext({
      viewport: null, // respect --start-maximized
    });
    this.page = await context.newPage();
    await this.page.goto(AMAZON_FRESH_URL, { waitUntil: 'domcontentloaded' });
  }

  /** Wait for user to finish logging in / handle CAPTCHA manually */
  async waitForUser(prompt: string): Promise<void> {
    console.log(`\n${prompt}`);
    await new Promise<void>((resolve) => {
      process.stdin.once('data', () => resolve());
    });
  }

  async addIngredient(ingredient: AggregatedIngredient): Promise<AddResult> {
    const page = this.page!;
    // Build a useful search string: prefer totalQuantity, fall back to name
    const searchTerm = ingredient.totalQuantity
      ? `${ingredient.totalQuantity}` // e.g. "2 cups flour" → Amazon finds "flour"
      : ingredient.name;

    try {
      // Find search box
      const searchSel = await findFirst(page, SEARCH_BOX_SELECTORS);
      if (!searchSel) {
        return { ingredient: ingredient.name, success: false, note: 'Search box not found' };
      }

      await page.locator(searchSel).first().click({ clickCount: 3 }); // select all
      await page.locator(searchSel).first().fill(searchTerm);

      // Submit
      const submitSel = await findFirst(page, SEARCH_SUBMIT_SELECTORS);
      if (submitSel) {
        await page.locator(submitSel).first().click();
      } else {
        await page.keyboard.press('Enter');
      }

      // Wait for results
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1500); // let result grid render

      // Find first add-to-cart button
      const cartSel = await findFirst(page, ADD_TO_CART_SELECTORS);
      if (!cartSel) {
        return {
          ingredient: ingredient.name,
          success: false,
          note: 'No add-to-cart button found in results',
        };
      }

      await page.locator(cartSel).first().scrollIntoViewIfNeeded();
      await page.locator(cartSel).first().click();
      await page.waitForTimeout(800); // allow cart update to settle

      return { ingredient: ingredient.name, success: true };
    } catch (err) {
      return {
        ingredient: ingredient.name,
        success: false,
        note: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
    this.page = null;
  }
}
