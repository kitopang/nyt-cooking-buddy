import type { GroceryList, AggregatedIngredient } from './types.ts';

const API_BASE = process.env['NYT_FOOD_API_BASE'] ?? 'http://localhost:3001';

async function apiFetch<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`);
  } catch {
    throw new Error(
      `Could not reach server at ${API_BASE}. Is it running?\n  cd server && npm run dev`
    );
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status} ${path}`);
  }

  return res.json() as Promise<T>;
}

export async function getLists(): Promise<GroceryList[]> {
  const data = await apiFetch<{ lists: GroceryList[] }>('/api/lists');
  return data.lists;
}

export async function getAggregatedIngredients(listId: number): Promise<AggregatedIngredient[]> {
  const data = await apiFetch<{ ingredients: AggregatedIngredient[] }>(
    `/api/lists/${listId}/ingredients`
  );
  return data.ingredients;
}
