import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import db from '../db.js';
import { AmazonFresh } from '../amazon-fresh.js';
import { getCachedShoppingList, setCachedShoppingList } from '../cache.js';

const router = Router({ mergeParams: true });
const anthropic = new Anthropic();

export interface ShoppingItem {
  name: string;
  quantity: string;
  searchTerm: string;
  hasAtHome: boolean;
}

// POST /api/lists/:listId/shopping-list
// Calls Claude to aggregate all ingredients for the list into a clean shopping list.
// Pass { force: true } in the body to bypass the cache.
router.post('/shopping-list', async (req, res) => {
  const { listId } = req.params as { listId: string };
  const force = (req.body as { force?: boolean }).force === true;

  const list = db.prepare(`SELECT id, name FROM grocery_lists WHERE id = ?`).get(listId) as
    | { id: number; name: string }
    | undefined;

  if (!list) {
    res.status(404).json({ error: 'List not found' });
    return;
  }

  if (!force) {
    const cached = getCachedShoppingList(list.id);
    if (cached) {
      res.json({ items: cached, cached: true });
      return;
    }
  }

  const rows = db.prepare(`
    SELECT i.raw_text
    FROM ingredients i
    JOIN recipes r ON r.id = i.recipe_id
    WHERE r.list_id = ?
    ORDER BY r.id, i.sort_order
  `).all(listId) as { raw_text: string }[];

  if (rows.length === 0) {
    res.status(400).json({ error: 'No ingredients found in this list' });
    return;
  }

  const ingredientLines = rows.map((r) => `- ${r.raw_text}`).join('\n');

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      system:
        'You are a grocery shopping assistant. Given raw ingredient strings from multiple recipes, produce a clean aggregated shopping list optimized for Amazon Fresh. Combine duplicates and sum quantities where units match. Return ONLY valid JSON with no markdown fences.',
      messages: [
        {
          role: 'user',
          content: `Here are all the ingredients from my grocery list "${list.name}":\n\n${ingredientLines}\n\nReturn JSON in this exact shape: { "items": [{ "name": string, "quantity": string, "searchTerm": string, "hasAtHome": boolean }] }\n\n"searchTerm" should be a clean Amazon search string (no quantities, just the ingredient name, e.g. "all purpose flour").\n"hasAtHome" should be true for common pantry staples most people already own (e.g. salt, pepper, olive oil, butter, flour, sugar, garlic, onion, vegetable oil, baking soda, baking powder, soy sauce, vinegar, water). Set it to false for everything else.`,
        },
      ],
    });

    const raw = message.content[0]?.type === 'text' ? message.content[0].text : '';
    // Strip any accidental markdown fences
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

    let parsed: { items: ShoppingItem[] };
    try {
      parsed = JSON.parse(cleaned) as { items: ShoppingItem[] };
    } catch {
      res.status(502).json({ error: 'Claude returned invalid JSON', raw });
      return;
    }

    setCachedShoppingList(list.id, parsed.items);
    res.json({ items: parsed.items, cached: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `Claude API error: ${msg}` });
  }
});

// POST /api/lists/:listId/add-to-cart
// Launches Playwright and adds items to Amazon Fresh cart, streaming progress via SSE
router.post('/add-to-cart', async (req, res) => {
  const { items } = req.body as { items?: Array<{ name: string; searchTerm: string }> };

  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'items must be a non-empty array' });
    return;
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  function send(data: object) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  const fresh = new AmazonFresh();
  const failures: { item: string; note?: string }[] = [];
  let succeeded = 0;

  try {
    send({ type: 'status', message: 'Opening Amazon Fresh…' });
    await fresh.open();

    send({ type: 'status', message: 'Amazon Fresh is open. Starting to add items…' });

    for (const { name, searchTerm } of items) {
      const result = await fresh.addItem(name, searchTerm);
      if (result.success) {
        succeeded++;
      } else {
        failures.push({ item: name, note: result.note });
      }
      send({
        type: 'progress',
        item: name,
        success: result.success,
        note: result.note,
      });
    }

    send({ type: 'done', succeeded, failed: failures.length, failures });
  } catch (err) {
    send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  } finally {
    await fresh.close();
    res.end();
  }
});

export default router;
