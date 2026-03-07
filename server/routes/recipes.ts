import { Router } from 'express';
import db from '../db.js';

interface IngredientInput {
  rawText: string;
  quantity: string | null;
  unit: string | null;
  name: string;
  checked: boolean;
  sortOrder: number;
}

interface SaveRecipeBody {
  name?: string;
  url?: string;
  ingredients?: IngredientInput[];
}

const router = Router({ mergeParams: true });

// POST /api/lists/:listId/recipes
router.post('/', (req, res) => {
  const { listId } = req.params as { listId: string };
  const { name, url, ingredients } = req.body as SaveRecipeBody;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (!url || typeof url !== 'string' || url.trim().length === 0) {
    res.status(400).json({ error: 'url is required' });
    return;
  }
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    res.status(400).json({ error: 'ingredients must be a non-empty array' });
    return;
  }

  const list = db.prepare(`SELECT id FROM grocery_lists WHERE id = ?`).get(listId);
  if (!list) {
    res.status(404).json({ error: 'List not found' });
    return;
  }

  db.exec('BEGIN');
  try {
    const recipe = db.prepare(
      `INSERT INTO recipes (list_id, name, url) VALUES (?, ?, ?) RETURNING id, name, url, created_at AS createdAt`
    ).get(listId, name.trim(), url.trim()) as { id: number; name: string; url: string; createdAt: string };

    const insertIngredient = db.prepare(
      `INSERT INTO ingredients (recipe_id, raw_text, quantity, unit, name, checked, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING id, raw_text AS rawText, quantity, unit, name, checked, sort_order AS sortOrder`
    );

    const savedIngredients = ingredients.map((ing) =>
      insertIngredient.get(
        recipe.id,
        ing.rawText,
        ing.quantity ?? null,
        ing.unit ?? null,
        ing.name,
        ing.checked ? 1 : 0,
        ing.sortOrder
      ) as { id: number; rawText: string; quantity: string | null; unit: string | null; name: string; checked: number; sortOrder: number }
    );

    db.exec('COMMIT');

    res.status(201).json({
      ...recipe,
      ingredients: savedIngredients.map((ing) => ({ ...ing, checked: ing.checked === 1 })),
    });
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
});

// DELETE /api/recipes/:recipeId
router.delete('/:recipeId', (req, res) => {
  const result = db.prepare(`DELETE FROM recipes WHERE id = ?`).run(req.params.recipeId);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }

  res.status(204).send();
});

export default router;
