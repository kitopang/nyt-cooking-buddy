export interface ScrapedIngredient {
  rawText: string;
  quantity: string | null;
  unit: string | null;
  name: string;
  checked: boolean;
  sortOrder: number;
}

export interface ScrapedRecipe {
  name: string;
  url: string;
  ingredients: ScrapedIngredient[];
}

export type ScrapeRequest = { type: 'SCRAPE_RECIPE' };

export type ScrapeResponse =
  | { success: true; data: ScrapedRecipe }
  | { success: false; error: string };

// API types (mirroring server responses)

export interface GroceryList {
  id: number;
  name: string;
  recipeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Ingredient {
  id: number;
  rawText: string;
  quantity: string | null;
  unit: string | null;
  name: string;
  checked: boolean;
  sortOrder: number;
}

export interface Recipe {
  id: number;
  name: string;
  url: string;
  createdAt: string;
  ingredients: Ingredient[];
}

export interface ShoppingItem {
  name: string;
  quantity: string;
  searchTerm: string;
  hasAtHome: boolean;
}
