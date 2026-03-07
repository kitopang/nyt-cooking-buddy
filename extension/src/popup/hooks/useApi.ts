import type { GroceryList, Recipe, ScrapedIngredient, ShoppingItem } from '../../shared/types';

const API_BASE = 'http://localhost:3001';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch {
    throw new Error('Could not reach local server. Make sure it is running: cd server && npm run dev');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  getLists: () =>
    apiFetch<{ lists: GroceryList[] }>('/api/lists').then((r) => r.lists),

  createList: (name: string) =>
    apiFetch<GroceryList>('/api/lists', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  saveRecipe: (listId: number, recipe: { name: string; url: string; ingredients: ScrapedIngredient[] }) =>
    apiFetch<Recipe>(`/api/lists/${listId}/recipes`, {
      method: 'POST',
      body: JSON.stringify(recipe),
    }),

  deleteRecipe: (recipeId: number) =>
    apiFetch<void>(`/api/recipes/${recipeId}`, { method: 'DELETE' }),

  getList: (listId: number) =>
    apiFetch<{ id: number; name: string; recipes: Recipe[] }>(`/api/lists/${listId}`),

  getShoppingList: (listId: number) =>
    apiFetch<{ items: ShoppingItem[] }>(`/api/lists/${listId}/shopping-list`, { method: 'POST' }),
};
