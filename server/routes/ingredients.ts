import { Router } from 'express';
import db from '../db.js';

const router = Router({ mergeParams: true });

// GET /api/lists/:listId/ingredients
// Returns aggregated unchecked ingredients across all recipes in the list
router.get('/', (req, res) => {
  const { listId } = req.params as { listId: string };

  const list = db.prepare(
    `SELECT id, name FROM grocery_lists WHERE id = ?`
  ).get(listId) as { id: number; name: string } | undefined;

  if (!list) {
    res.status(404).json({ error: 'List not found' });
    return;
  }

  const rows = db.prepare(`
    SELECT
      i.id,
      i.raw_text AS rawText,
      i.quantity,
      i.unit,
      i.name,
      i.checked,
      r.id AS recipeId,
      r.name AS recipeName
    FROM ingredients i
    JOIN recipes r ON r.id = i.recipe_id
    WHERE r.list_id = ?
      AND i.checked = 0
    ORDER BY LOWER(TRIM(i.name)) ASC, i.sort_order ASC
  `).all(listId) as {
    id: number;
    rawText: string;
    quantity: string | null;
    unit: string | null;
    name: string;
    checked: number;
    recipeId: number;
    recipeName: string;
  }[];

  // Group by normalized ingredient name
  const grouped = new Map<string, {
    name: string;
    units: Set<string>;
    quantities: number[];
    recipes: { recipeId: number; recipeName: string; rawText: string; quantity: string | null; unit: string | null }[];
  }>();

  for (const row of rows) {
    const key = row.name.toLowerCase().trim();
    const entry = grouped.get(key) ?? {
      name: row.name,
      units: new Set(),
      quantities: [],
      recipes: [],
    };

    entry.recipes.push({
      recipeId: row.recipeId,
      recipeName: row.recipeName,
      rawText: row.rawText,
      quantity: row.quantity,
      unit: row.unit,
    });

    if (row.unit) entry.units.add(row.unit.toLowerCase());
    if (row.quantity) {
      const parsed = parseFloat(row.quantity);
      if (!isNaN(parsed)) entry.quantities.push(parsed);
    }

    grouped.set(key, entry);
  }

  const ingredients = Array.from(grouped.values()).map((entry) => {
    let totalQuantity: string | null = null;

    // Only sum quantities when all occurrences share the same unit
    if (entry.units.size === 1 && entry.quantities.length === entry.recipes.length) {
      const [unit] = entry.units;
      const sum = entry.quantities.reduce((a, b) => a + b, 0);
      // Format cleanly: avoid "2.0 cups", prefer "2 cups"
      const sumStr = Number.isInteger(sum) ? String(sum) : sum.toFixed(2).replace(/\.?0+$/, '');
      totalQuantity = `${sumStr} ${unit}`;
    }

    return {
      name: entry.name,
      totalQuantity,
      recipes: entry.recipes,
    };
  });

  res.json({
    listId: list.id,
    listName: list.name,
    ingredients,
  });
});

// PATCH /api/ingredients/:ingredientId
router.patch('/:ingredientId', (req, res) => {
  const { checked } = req.body as { checked?: boolean };

  if (typeof checked !== 'boolean') {
    res.status(400).json({ error: 'checked (boolean) is required' });
    return;
  }

  const result = db.prepare(
    `UPDATE ingredients SET checked = ? WHERE id = ? RETURNING id, checked`
  ).get(checked ? 1 : 0, req.params.ingredientId) as { id: number; checked: number } | undefined;

  if (!result) {
    res.status(404).json({ error: 'Ingredient not found' });
    return;
  }

  res.json({ id: result.id, checked: result.checked === 1 });
});

export default router;
