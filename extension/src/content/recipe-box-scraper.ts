import type { RecipeBoxRecipe, RecipeBoxScrapeResponse } from '../shared/types';

chrome.runtime.onMessage.addListener(
  (message: { type: string }, _sender, sendResponse) => {
    if (message.type !== 'SCRAPE_RECIPE_BOX') return;

    scrapeRecipeBox()
      .then(sendResponse)
      .catch((err: unknown) =>
        sendResponse({ success: false, error: String(err) } satisfies RecipeBoxScrapeResponse)
      );

    return true; // async response
  }
);

async function scrapeRecipeBox(): Promise<RecipeBoxScrapeResponse> {
  // The box name is in the page title (e.g. "Want to Cook - NYT Cooking")
  // Prefer specific heading selectors before falling back to document.title
  const boxTitle =
    document.querySelector<HTMLElement>('h2.pantry--ui-xl')?.textContent?.trim() ||
    'Recipe Box';

  // Collect unique recipe URLs from all <a> tags on the page
  const seen = new Set<string>();
  const recipeRefs: { title: string; url: string }[] = [];

  for (const el of document.querySelectorAll<HTMLAnchorElement>('a[href*="/recipes/"]')) {
    const url = el.href;
    if (!url.match(/\/recipes\/\d+/) || seen.has(url)) continue;
    seen.add(url);

    // Walk up to find the card container, then look for a heading
    const card = el.closest('article, li, [class*="card"], [class*="recipe"]') ?? el.parentElement;
    const heading = card?.querySelector('h3, h2, h1, [class*="title"], [class*="name"]');
    const title = heading?.textContent?.trim() || el.textContent?.trim() || url;

    recipeRefs.push({ title, url });
  }

  if (recipeRefs.length === 0) {
    return {
      success: false,
      error: 'No recipes found on this page. Make sure you are viewing an NYT Cooking recipe box.',
    };
  }

  // Fetch ingredients for each recipe in parallel (authenticated via user session cookies)
  const recipes = await Promise.all(
    recipeRefs.map(async ({ title, url }) => ({
      title,
      url,
      ingredients: await fetchIngredients(url),
    }))
  );

  const withIngredients = recipes.filter((r) => r.ingredients.length > 0);

  if (withIngredients.length === 0) {
    return {
      success: false,
      error: 'Could not load ingredients for any recipes. Make sure you are logged in to NYT Cooking.',
    };
  }

  return { success: true, boxTitle, data: withIngredients };
}

async function fetchIngredients(url: string): Promise<string[]> {
  try {
    const res = await fetch(url);
    const html = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Try all JSON-LD blocks — NYT sometimes has multiple
    for (const script of doc.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')) {
      try {
        const raw = JSON.parse(script.textContent ?? '');
        const entries = Array.isArray(raw) ? raw : [raw];
        for (const entry of entries) {
          if (entry['@type'] === 'Recipe' && Array.isArray(entry.recipeIngredient) && entry.recipeIngredient.length > 0) {
            return entry.recipeIngredient as string[];
          }
        }
      } catch {
        // malformed JSON-LD — try next block
      }
    }

    // DOM fallback: same selectors as the recipe scraper
    const items = doc.querySelectorAll(
      '[data-testid="recipe-ingredients-list"] li, .recipe-ingredients li, [class*="ingredientsList"] li, [class*="ingredients"] li'
    );
    return Array.from(items)
      .map((el) => el.textContent?.trim() ?? '')
      .filter(Boolean);
  } catch {
    return [];
  }
}
