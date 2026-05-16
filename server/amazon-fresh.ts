import path from 'path';
import os from 'os';
import { chromium, type BrowserContext, type Page } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

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

      // Strip the `.s-result-item ` prefix so we can use the selector scoped inside a result item
      const innerCartSel = cartSel.replace(/^\.s-result-item\s+/, '');

      // Extract product info from each result that has an Add to Cart button.
      // We build a list aligned to cart buttons so Claude's index maps directly.
      const resultItems = await page.locator('.s-result-item[data-asin]').evaluateAll((els, sel) => {
        const items: { domIndex: number; label: string }[] = [];
        els.forEach((el, i) => {
          if (!el.querySelector(sel)) return; // skip items without Add to Cart
          const title = el.querySelector('h2')?.textContent?.trim() ?? '';
          if (!title) return;
          const price = el.querySelector('.a-price .a-offscreen')?.textContent?.trim() ?? '';
          const size = el.querySelector('.a-size-base.a-color-secondary, .a-row .a-size-base')?.textContent?.trim() ?? '';
          items.push({
            domIndex: i,
            label: `${items.length + 1}. ${title}${size ? ` — ${size}` : ''}${price ? ` (${price})` : ''}`,
          });
        });
        return items;
      }, innerCartSel);

      if (resultItems.length === 0) {
        return { item: name, success: false, note: 'No products with Add to Cart found' };
      }

      // Ask Claude to pick the best match from the product list
      let pickIdx = 0; // index into resultItems array
      let pickReason = 'Fell back to first result';

      try {
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-5',
          max_tokens: 256,
          messages: [
            {
              role: 'user',
              content: `I'm shopping on Amazon Fresh for: "${name}" (searched: "${searchTerm}").

Here are the search results:
${resultItems.map((r) => r.label).join('\n')}

Always pick item #1 UNLESS it is clearly the wrong product (wrong ingredient, wrong category, bulk/commercial size). Only then pick the next best match further down the list.
If NONE of the items are a reasonable match, return index 0.

Return ONLY a JSON object: { "index": <number from the list, or 0 if no match>, "confidence": "high" | "medium" | "low" | "none", "reason": "<brief>" }`,
            },
          ],
        });

        const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';
        const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
        const pick = JSON.parse(cleaned) as { index: number; confidence: string; reason: string };

        console.log(`[amazon-fresh] Claude pick for "${name}":`, pick);

        if (pick.confidence === 'none' || pick.index === 0) {
          return { item: name, success: false, note: `No good match: ${pick.reason}` };
        }
        if (pick.confidence === 'low') {
          return { item: name, success: false, note: `Low confidence, skipped: ${pick.reason}` };
        }
        if (pick.index >= 1 && pick.index <= resultItems.length) {
          pickIdx = pick.index - 1;
          pickReason = pick.reason;
        } else {
          console.warn(`[amazon-fresh] Claude returned index ${pick.index} but only ${resultItems.length} items — using first`);
        }
      } catch (err) {
        console.warn('[amazon-fresh] Claude pick failed, falling back to first result:', err instanceof Error ? err.message : err);
      }

      // Click the Add to Cart button inside the correct DOM result item
      const targetAsin = page.locator('.s-result-item[data-asin]').nth(resultItems[pickIdx].domIndex);
      const cartBtn = targetAsin.locator(innerCartSel).first();
      await cartBtn.scrollIntoViewIfNeeded();
      await cartBtn.click();
      await page.waitForTimeout(800);

      return { item: name, success: true, note: pickReason };
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
