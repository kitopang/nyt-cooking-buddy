export interface GroceryList {
  id: number;
  name: string;
  recipeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeRef {
  recipeId: number;
  recipeName: string;
  rawText: string;
  quantity: string | null;
  unit: string | null;
}

export interface AggregatedIngredient {
  name: string;
  totalQuantity: string | null;
  recipes: RecipeRef[];
}

export interface AggregatedResponse {
  listId: number;
  listName: string;
  ingredients: AggregatedIngredient[];
}
