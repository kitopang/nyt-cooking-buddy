import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { getCachedShoppingList, setCachedShoppingList } from '../cache.js';
import type { ShoppingItem } from './order.js';

const router = Router();
const anthropic = new Anthropic();

interface AggregateBody {
  cacheKey: string;
  recipes: { title: string; ingredients: string[] }[];
  force?: boolean;
}

// POST /api/shopping-list
// Accepts raw recipe+ingredient data (scraped client-side from NYT).
// Uses cacheKey for deduplication — pass force:true to bypass.
router.post('/', async (req, res) => {
  const { cacheKey, recipes, force } = req.body as AggregateBody;

  if (!cacheKey || !Array.isArray(recipes) || recipes.length === 0) {
    res.status(400).json({ error: 'cacheKey and recipes[] are required' });
    return;
  }

  if (!force) {
    const cached = getCachedShoppingList(cacheKey);
    if (cached) {
      res.json({ items: cached, cached: true });
      return;
    }
  }

  const lines = recipes.flatMap(({ title, ingredients }) => [
    `### ${title}`,
    ...ingredients.map((i) => `- ${i}`),
  ]);

  const ingredientLines = lines.join('\n');

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      system:
        'You are a grocery shopping assistant. Given raw ingredient strings from multiple recipes, produce a clean aggregated shopping list optimized for Amazon Fresh. Combine duplicates and sum quantities where units match. Return ONLY valid JSON with no markdown fences.',
      messages: [
        {
          role: 'user',
          content: `Here are all the ingredients from my selected recipes:\n\n${ingredientLines}\n\nReturn JSON in this exact shape: { "items": [{ "name": string, "quantity": string, "searchTerm": string, "hasAtHome": boolean }] }\n\n"searchTerm" should be a clean Amazon search string (no quantities, just the ingredient name, e.g. "all purpose flour").\n"hasAtHome" should be true for common pantry staples most people already own (e.g. salt, pepper, olive oil, butter, flour, sugar, garlic, onion, vegetable oil, baking soda, baking powder, soy sauce, vinegar, water). Set it to false for everything else.`,
        },
      ],
    });

    const raw = message.content[0]?.type === 'text' ? message.content[0].text : '';
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

    let parsed: { items: ShoppingItem[] };
    try {
      parsed = JSON.parse(cleaned) as { items: ShoppingItem[] };
    } catch {
      res.status(502).json({ error: 'Claude returned invalid JSON', raw });
      return;
    }

    setCachedShoppingList(cacheKey, parsed.items);
    res.json({ items: parsed.items, cached: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `Claude API error: ${msg}` });
  }
});

export default router;
