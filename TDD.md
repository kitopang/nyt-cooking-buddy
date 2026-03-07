# NYT Food — Technical Design Document

## Overview

A personal-use Chrome extension + locally hosted backend that lets you save NYT Cooking recipes into named grocery lists, aggregate ingredients across recipes with per-ingredient "I already have this" toggling, and automate Amazon Fresh ordering via a TypeScript + Playwright CLI script.

---

## Goals

- Browse [cooking.nytimes.com](https://cooking.nytimes.com), click a recipe, and save it to a named list with one click
- Uncheck ingredients you already have before saving
- Create lists for any purpose (e.g., "Week of March 3", "Dinner Party", etc.)
- View all aggregated unchecked ingredients across a list
- Export/order unchecked ingredients on Amazon Fresh via an automated CLI script
- Store recipe name, URL, and ingredients persistently in a local SQLite database

## Non-Goals (v1)

- Multi-user support or authentication
- Cloud deployment (server runs locally)
- Automatic checkout on Amazon Fresh (user reviews cart and checks out manually)
- Mobile or web UI beyond the extension popup

---

## Architecture

```
NYT Cooking page (browser tab)
  └── content script (scraper.ts)
        ↕ chrome.tabs.sendMessage
  Extension Popup (React)
        ↕ fetch
  Express Server (localhost:3001)
        ↕ better-sqlite3
  SQLite (server/data/nyt-food.db)
        ↕ fetch
  Playwright CLI (scripts/main.ts)
        ↕ browser automation
  Amazon Fresh
```

---

## Repository Structure

```
nyt-food/
├── TDD.md
├── package.json                       # npm workspaces root
├── .gitignore
│
├── extension/                         # Chrome MV3 extension
│   ├── manifest.json
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── public/
│   │   └── icons/                     # icon16.png, icon48.png, icon128.png
│   └── src/
│       ├── shared/
│       │   └── types.ts               # Shared types: ScrapedRecipe, ScrapeResponse, etc.
│       ├── background/
│       │   └── service-worker.ts      # Minimal MV3 service worker
│       ├── content/
│       │   └── scraper.ts             # Injected into cooking.nytimes.com/recipes/*
│       └── popup/
│           ├── index.html
│           ├── main.tsx               # ReactDOM.createRoot entry
│           ├── App.tsx                # Root component + state machine
│           ├── hooks/
│           │   ├── useRecipeScrape.ts # Sends SCRAPE_RECIPE to content script
│           │   └── useApi.ts          # Typed fetch wrapper → localhost:3001
│           └── components/
│               ├── RecipeView.tsx     # Recipe title + ingredient checklist
│               ├── IngredientItem.tsx # Single checkbox row
│               ├── ListSelector.tsx   # Dropdown + "New list..." option
│               ├── NewListInput.tsx   # Text input to name a new list
│               └── StatusBanner.tsx   # Loading / error / success states
│
├── server/                            # Local Express + SQLite
│   ├── package.json
│   ├── tsconfig.json
│   ├── server.ts                      # Express app, port 3001
│   ├── db.ts                          # better-sqlite3 client + schema init
│   ├── data/                          # Auto-created; gitignored
│   │   └── nyt-food.db
│   └── routes/
│       ├── lists.ts                   # GET/POST /api/lists, GET/DELETE /api/lists/:id
│       ├── recipes.ts                 # POST /api/lists/:id/recipes, DELETE /api/recipes/:id
│       └── ingredients.ts             # GET /api/lists/:id/ingredients, PATCH /api/ingredients/:id
│
└── scripts/                           # TypeScript + Playwright CLI
    ├── package.json
    ├── tsconfig.json
    ├── api-client.ts                  # Typed fetch wrapper for local server
    ├── amazon-fresh.ts                # Playwright automation class
    └── main.ts                        # CLI entry: list picker → browser automation
```

---

## Database Schema

File: `server/db.ts` — schema is initialized inline on first run via `CREATE TABLE IF NOT EXISTS`.

```sql
CREATE TABLE IF NOT EXISTS grocery_lists (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recipes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id    INTEGER NOT NULL REFERENCES grocery_lists(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  url        TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ingredients (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id   INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  raw_text    TEXT NOT NULL,      -- Full original text, e.g. "2 cups all-purpose flour"
  quantity    TEXT,               -- "2", "1/2", "a pinch" — stored as TEXT (not NUMERIC)
  unit        TEXT,               -- "cups", "tbsp", null for count items
  name        TEXT NOT NULL,      -- Parsed ingredient name, e.g. "all-purpose flour"
  checked     INTEGER NOT NULL DEFAULT 0,  -- 0 = need to buy, 1 = already have
  sort_order  INTEGER NOT NULL DEFAULT 0   -- Preserves original DOM order
);
```

**Design notes:**
- `quantity` is `TEXT` to preserve fractions like "1/2" and descriptors like "a pinch"
- `raw_text` is always stored as ground truth; `quantity`/`unit`/`name` are best-effort parsed
- `checked` defaults to `0` (need to buy); user can uncheck before saving
- Cascade deletes: deleting a list removes all its recipes and ingredients

---

## API Reference

Server: `http://localhost:3001`
Auth: None (localhost only)
CORS: Allows `chrome-extension://` origins

### Lists

| Method | Path | Body | Response |
|--------|------|------|----------|
| `GET` | `/api/lists` | — | `{ lists: List[] }` |
| `POST` | `/api/lists` | `{ name: string }` | `List` (201) |
| `GET` | `/api/lists/:id` | — | `ListWithRecipes` |
| `DELETE` | `/api/lists/:id` | — | 204 |

`List`:
```typescript
{ id: number; name: string; recipeCount: number; createdAt: string; updatedAt: string }
```

`ListWithRecipes`:
```typescript
{
  id: number; name: string; createdAt: string; updatedAt: string;
  recipes: Array<{
    id: number; name: string; url: string; createdAt: string;
    ingredients: Ingredient[];
  }>;
}
```

### Recipes

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/api/lists/:id/recipes` | `SaveRecipeBody` | `Recipe` (201) |
| `DELETE` | `/api/recipes/:id` | — | 204 |

`SaveRecipeBody`:
```typescript
{
  name: string;
  url: string;
  ingredients: Array<{
    rawText: string;
    quantity: string | null;
    unit: string | null;
    name: string;
    checked: boolean;
    sortOrder: number;
  }>;
}
```

### Ingredients

| Method | Path | Body | Response |
|--------|------|------|----------|
| `GET` | `/api/lists/:id/ingredients` | — | `AggregatedIngredients` |
| `PATCH` | `/api/ingredients/:id` | `{ checked: boolean }` | `{ id, checked }` |

`GET /api/lists/:id/ingredients` — returns all **unchecked** ingredients across all recipes in the list, grouped by normalized ingredient name. Used by the Playwright script.

```typescript
{
  listId: number;
  listName: string;
  ingredients: Array<{
    name: string;             // normalized: lowercase, trimmed
    totalQuantity: string | null;  // sum if units match, null otherwise
    recipes: Array<{
      recipeId: number;
      recipeName: string;
      rawText: string;
      quantity: string | null;
      unit: string | null;
    }>;
  }>;
}
```

---

## Chrome Extension

### Manifest V3

Key permissions:
- `activeTab` — access the currently open tab on demand (not all tabs)
- `storage` — `chrome.storage.local` for persisting `apiBaseUrl`
- `scripting` — fallback injection if content script not yet loaded

Host permissions:
- `https://cooking.nytimes.com/*` — content script target
- `http://localhost:3001/*` — API server

### Content Script (`scraper.ts`)

Injected into every `cooking.nytimes.com/recipes/*` page at `document_idle`. Sits dormant until the popup sends `{ type: 'SCRAPE_RECIPE' }`.

**Selector strategy:** Uses ordered fallback arrays, preferring `data-testid` attributes (more stable than class names):

```typescript
const TITLE_SELECTOR = 'h1[data-testid="recipe-title"], h1.pantry--title-display';
const INGREDIENT_ITEMS = [
  '[data-testid="recipe-ingredients-list"] li',
  '.recipe-ingredients li',
  '.ingredient-list li',
].join(', ');
```

Per ingredient `<li>`, attempts to extract sub-spans for `quantity`, `unit`, and `name`. Falls back to a regex parser on the full `rawText` if no sub-spans are found:

```
/^([\d\u00BC-\u00BE\/\s]+)?\s*(cups?|tbsp|tsp|oz|lbs?|g|kg|cloves?|cans?|bunch|head|pinch|dash)?\s*(.+)$/i
```

`rawText` (full `li.textContent`) is always stored regardless of parse success.

### Popup State Machine

```
loading → not-recipe    (if not on cooking.nytimes.com/recipes/*)
        → error         (if content script fails or server unreachable)
        → ready         (recipe scraped, lists loaded)
            → saving    (on Save click)
            → saved     (success)
            → error     (API failure)
```

### Message Passing

```
Popup                          Content Script
  │── SCRAPE_RECIPE ──────────────▶│
  │◀─ ScrapeResponse ─────────────│
```

If `chrome.tabs.sendMessage` fails (content script not yet injected), the popup falls back to `chrome.scripting.executeScript` to inject the script, then retries.

### Vite Build

Three separate bundle entry points:
- `src/popup/index.html` → `dist/popup/`
- `src/background/service-worker.ts` → `dist/background.js`
- `src/content/scraper.ts` → `dist/content/scraper.js`

Content script output must not be code-split (MV3 does not support dynamic `import()` in content scripts).

---

## Playwright Automation Script

### Usage

```bash
cd scripts
npm install
npx playwright install chromium

# Interactive list picker
tsx main.ts

# Direct list selection
tsx main.ts --list-id 2

# Dry run (print ingredients, no browser)
tsx main.ts --list-id 2 --dry-run
```

### Flow

1. Fetch all lists from `GET http://localhost:3001/api/lists`
2. Prompt user to select a list (or use `--list-id`)
3. Fetch aggregated unchecked ingredients from `GET /api/lists/:id/ingredients`
4. Print the ingredient list to stdout
5. If `--dry-run`, exit here
6. Prompt "Press Enter to open Amazon Fresh..."
7. Launch Playwright Chromium (non-headless) → navigate to Amazon Fresh
8. Pause again to allow manual login if needed
9. For each ingredient: search → find first add-to-cart button → click
10. Log success/failure per ingredient
11. **User reviews cart and manually checks out**

### Resilience

- Uses `waitForSelector` with timeouts instead of `page.waitForTimeout`
- Each ingredient add is wrapped in try/catch; failures are logged but don't abort the run
- Selectors are defined as ordered fallback arrays
- Final summary: `N added, M failed` with list of failed items

---

## Development Setup

### Prerequisites

- Node.js 20+
- npm 10+

### Server

```bash
cd server
npm install
npm run dev       # starts tsx watch on localhost:3001
```

### Extension

```bash
cd extension
npm install
npm run dev       # vite build --watch → outputs to extension/dist/
```

Load in Chrome:
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" → select `extension/dist/`
4. Reload after each `npm run dev` rebuild

### Playwright Script

```bash
cd scripts
npm install
npx playwright install chromium
tsx main.ts --dry-run
```

---

## Known Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| NYT Cooking DOM changes | High | Prefer `data-testid` selectors; ordered fallback arrays; always store `rawText` as ground truth |
| Amazon Fresh DOM changes | High | Multiple CSS selector fallbacks; user manually reviews cart before checkout |
| Content script not injected on page load | Medium | Popup falls back to `chrome.scripting.executeScript`, then retries the message |
| Ingredient parsing failures | Medium | Regex fallback; when no sub-spans exist, `name = rawText`; aggregation still works |
| NYT paywall hiding ingredients | Medium | Show specific error: "Make sure you're logged in and can see the full recipe" |
| Server not running | Medium | Extension shows: "Could not reach local server. Run `npm run dev` in server/" |

---

## Future Considerations

- Persist `checked` state changes from the popup list view (currently only set at save time)
- Ingredient quantity normalization/aggregation (e.g., sum "1 cup flour" + "2 cups flour" → "3 cups flour")
- Recipe deduplication warning if the same URL is added to the same list twice
- Export to a plain text or CSV shopping list as an alternative to Playwright automation
- Optional: deploy to a VPS or Fly.io for access from multiple machines
