import { Router } from 'express';
import db from '../db.js';

const router = Router();

// GET /api/lists
router.get('/', (_req, res) => {
  const lists = db.prepare(`
    SELECT
      l.id,
      l.name,
      l.created_at AS createdAt,
      l.updated_at AS updatedAt,
      COUNT(r.id) AS recipeCount
    FROM grocery_lists l
    LEFT JOIN recipes r ON r.list_id = l.id
    GROUP BY l.id
    ORDER BY l.created_at DESC
  `).all();

  res.json({ lists });
});

// POST /api/lists
router.post('/', (req, res) => {
  const { name } = req.body as { name?: string };

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  const result = db.prepare(
    `INSERT INTO grocery_lists (name) VALUES (?) RETURNING id, name, created_at AS createdAt, updated_at AS updatedAt`
  ).get(name.trim()) as { id: number; name: string; createdAt: string; updatedAt: string };

  res.status(201).json(result);
});

// GET /api/lists/:id
router.get('/:id', (req, res) => {
  const list = db.prepare(
    `SELECT id, name, created_at AS createdAt, updated_at AS updatedAt FROM grocery_lists WHERE id = ?`
  ).get(req.params.id) as { id: number; name: string; createdAt: string; updatedAt: string } | undefined;

  if (!list) {
    res.status(404).json({ error: 'List not found' });
    return;
  }

  const recipes = db.prepare(
    `SELECT id, name, url, created_at AS createdAt FROM recipes WHERE list_id = ? ORDER BY created_at ASC`
  ).all(req.params.id) as { id: number; name: string; url: string; createdAt: string }[];

  const recipeIds = recipes.map((r) => r.id);

  const allIngredients = recipeIds.length > 0
    ? db.prepare(
        `SELECT id, recipe_id AS recipeId, raw_text AS rawText, quantity, unit, name, checked, sort_order AS sortOrder
         FROM ingredients
         WHERE recipe_id IN (${recipeIds.map(() => '?').join(',')})
         ORDER BY sort_order ASC`
      ).all(...recipeIds) as { id: number; recipeId: number; rawText: string; quantity: string | null; unit: string | null; name: string; checked: number; sortOrder: number }[]
    : [];

  const ingredientsByRecipe = new Map<number, typeof allIngredients>();
  for (const ing of allIngredients) {
    const arr = ingredientsByRecipe.get(ing.recipeId) ?? [];
    arr.push(ing);
    ingredientsByRecipe.set(ing.recipeId, arr);
  }

  res.json({
    ...list,
    recipes: recipes.map((r) => ({
      ...r,
      ingredients: (ingredientsByRecipe.get(r.id) ?? []).map((ing) => ({
        ...ing,
        checked: ing.checked === 1,
      })),
    })),
  });
});

// DELETE /api/lists/:id
router.delete('/:id', (req, res) => {
  const result = db.prepare(`DELETE FROM grocery_lists WHERE id = ?`).run(req.params.id);

  if (result.changes === 0) {
    res.status(404).json({ error: 'List not found' });
    return;
  }

  res.status(204).send();
});

export default router;
