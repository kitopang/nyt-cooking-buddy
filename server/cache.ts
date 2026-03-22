import type { ShoppingItem } from './routes/order.js';

const shoppingListCache = new Map<string, ShoppingItem[]>();

export function getCachedShoppingList(key: string): ShoppingItem[] | null {
  return shoppingListCache.get(key) ?? null;
}

export function setCachedShoppingList(key: string, items: ShoppingItem[]): void {
  shoppingListCache.set(key, items);
}
