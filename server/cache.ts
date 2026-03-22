import type { ShoppingItem } from './routes/order.js';

const shoppingListCache = new Map<number, ShoppingItem[]>();

export function getCachedShoppingList(listId: number): ShoppingItem[] | null {
  return shoppingListCache.get(listId) ?? null;
}

export function setCachedShoppingList(listId: number, items: ShoppingItem[]): void {
  shoppingListCache.set(listId, items);
}

export function invalidateShoppingList(listId: number): void {
  shoppingListCache.delete(listId);
}
