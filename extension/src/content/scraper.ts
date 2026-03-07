import type { ScrapeRequest, ScrapeResponse, ScrapedIngredient } from '../shared/types';

// ---------------------------------------------------------------------------
// Selectors — ordered fallback arrays, most stable (data-testid) first.
// NYT Cooking deploys frequently; inspect live DOM if scraping breaks.
// Last verified: 2025-02
// ---------------------------------------------------------------------------

const TITLE_SELECTORS = [
  'h1[data-testid="recipe-title"]',
  'h1.pantry--title-display',
  'h1',
];

const INGREDIENT_LIST_SELECTORS = [
  '[data-testid="recipe-ingredients-list"] li',
  '.recipe-ingredients li',
  '.ingredient-list li',
  '[class*="ingredientsList"] li',
  '[class*="ingredients"] li',
];

// Sub-element selectors within each <li>
const QUANTITY_SELECTORS = [
  '[data-testid="ingredient-quantity"]',
  '.quantity',
  '[class*="quantity"]',
];

const UNIT_SELECTORS = [
  '[data-testid="ingredient-unit"]',
  '.ingredient-unit',
  '[class*="unit"]',
];

const NAME_SELECTORS = [
  '[data-testid="ingredient-name"]',
  '.ingredient-name',
  '[class*="ingredientName"]',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function querySelector<T extends Element>(el: ParentNode, selectors: string[]): T | null {
  for (const sel of selectors) {
    const found = el.querySelector<T>(sel);
    if (found) return found;
  }
  return null;
}

function querySelectorAll(root: Document | Element, selectors: string[]): NodeListOf<Element> | Element[] {
  for (const sel of selectors) {
    const found = root.querySelectorAll(sel);
    if (found.length > 0) return found;
  }
  return [];
}

// Regex fallback for ingredients rendered as a single text node
// e.g. "2 cups all-purpose flour" or "1/2 tsp kosher salt"
const INGREDIENT_REGEX =
  /^([\d\u00BC-\u00BE\u2150-\u215E\/\s.]+)?\s*(cups?|tbsp?|tsp?|tablespoons?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|liters?|l|cloves?|cans?|pkg|packages?|bunches?|heads?|slices?|pinch|dashes?|handfuls?)?\s*(.+)$/i;

function parseIngredientFallback(rawText: string): Pick<ScrapedIngredient, 'quantity' | 'unit' | 'name'> {
  const match = rawText.trim().match(INGREDIENT_REGEX);
  if (match) {
    return {
      quantity: match[1]?.trim() || null,
      unit: match[2]?.trim() || null,
      name: match[3]?.trim() || rawText,
    };
  }
  return { quantity: null, unit: null, name: rawText };
}

// ---------------------------------------------------------------------------
// Core scrape function
// ---------------------------------------------------------------------------

function scrapeRecipe(): ScrapeResponse {
  // Find title
  const titleEl = querySelector<HTMLElement>(document, TITLE_SELECTORS);
  if (!titleEl) {
    return {
      success: false,
      error: 'Could not find the recipe title. Make sure you are on an NYT Cooking recipe page and are logged in.',
    };
  }

  // Find ingredient list items
  const ingredientEls = querySelectorAll(document, INGREDIENT_LIST_SELECTORS);
  if (ingredientEls.length === 0) {
    return {
      success: false,
      error: 'Could not find the ingredients list. Make sure you are logged in to NYT Cooking and the full recipe is visible.',
    };
  }

  const ingredients: ScrapedIngredient[] = Array.from(ingredientEls).map((li, index) => {
    const rawText = li.textContent?.trim() ?? '';

    // Try structured sub-selectors first
    const quantityEl = querySelector<HTMLElement>(li, QUANTITY_SELECTORS);
    const unitEl = querySelector<HTMLElement>(li, UNIT_SELECTORS);
    const nameEl = querySelector<HTMLElement>(li, NAME_SELECTORS);

    if (nameEl) {
      return {
        rawText,
        quantity: quantityEl?.textContent?.trim() || null,
        unit: unitEl?.textContent?.trim() || null,
        name: nameEl.textContent?.trim() || rawText,
        checked: false,
        sortOrder: index,
      };
    }

    // Fall back to regex parsing
    const parsed = parseIngredientFallback(rawText);
    return {
      rawText,
      ...parsed,
      checked: false,
      sortOrder: index,
    };
  }).filter((ing) => ing.rawText.length > 0);

  if (ingredients.length === 0) {
    return {
      success: false,
      error: 'Ingredients list was found but appears empty.',
    };
  }

  return {
    success: true,
    data: {
      name: titleEl.textContent?.trim() ?? '',
      url: window.location.href,
      ingredients,
    },
  };
}

// ---------------------------------------------------------------------------
// Message listener
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (message: ScrapeRequest, _sender, sendResponse) => {
    if (message.type === 'SCRAPE_RECIPE') {
      sendResponse(scrapeRecipe());
    }
    return true; // keep channel open for async
  }
);
