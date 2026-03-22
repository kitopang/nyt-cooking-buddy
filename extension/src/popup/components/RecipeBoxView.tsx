import { useState, useEffect } from 'react';
import type { RecipeBoxRecipe, RecipeBoxScrapeResponse, ShoppingItem } from '../../shared/types';
import { StatusBanner } from './StatusBanner';

const API_BASE = 'http://localhost:3001';

type Phase =
  | 'loading'     // scraping recipe-box page
  | 'select'      // user picks which recipes to include
  | 'generating'  // Claude aggregating ingredients
  | 'review'      // shopping list with checkboxes
  | 'ordering'    // SSE add-to-cart in progress
  | 'done'        // summary
  | 'error';

interface BoxRecipe extends RecipeBoxRecipe {
  selected: boolean;
}

interface ProgressItem {
  name: string;
  success: boolean;
  note?: string;
}

interface DoneEvent {
  succeeded: number;
  failed: number;
  failures: { item: string; note?: string }[];
}

export function RecipeBoxView() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState('');
  const [boxTitle, setBoxTitle] = useState('');
  const [recipes, setRecipes] = useState<BoxRecipe[]>([]);
  const [shoppingItems, setShoppingItems] = useState<(ShoppingItem & { checked: boolean })[]>([]);
  const [fromCache, setFromCache] = useState(false);
  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const [summary, setSummary] = useState<DoneEvent | null>(null);

  // Step 1: scrape the recipe-box page via content script
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) {
        setError('Could not access the current tab.');
        setPhase('error');
        return;
      }
      sendScrapeMessage(tab.id).then((response) => {
        if (!response.success) {
          setError(response.error);
          setPhase('error');
          return;
        }
        setBoxTitle(response.boxTitle);
        setRecipes(response.data.map((r) => ({ ...r, selected: true })));
        setPhase('select');
      }).catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not connect to the page. Try reloading.');
        setPhase('error');
      });
    });
  }, []);

  // Step 2: generate shopping list via Claude

  async function handleGenerate(force = false) {
    const selected = recipes.filter((r) => r.selected);
    if (selected.length === 0) return;

    setPhase('generating');
    setError('');

    const cacheKey = selected.map((r) => r.url).sort().join('|');

    try {
      const res = await fetch(`${API_BASE}/api/shopping-list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cacheKey,
          recipes: selected.map(({ title, ingredients }) => ({ title, ingredients })),
          force,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Server error: ${res.status}`);
      }

      const data = await res.json() as { items: ShoppingItem[]; cached: boolean };
      setShoppingItems(data.items.map((item) => ({ ...item, checked: !item.hasAtHome })));
      setFromCache(data.cached);
      setPhase('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  }

  // Step 3: add selected items to Amazon Fresh cart via SSE
  async function handleAddToCart() {
    const selected = shoppingItems.filter((i) => i.checked);
    if (selected.length === 0) return;

    setPhase('ordering');
    setProgress([]);

    try {
      const res = await fetch(`${API_BASE}/api/lists/0/add-to-cart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: selected.map(({ name, searchTerm }) => ({ name, searchTerm })) }),
      });

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? `Request failed: ${res.status}`);
        setPhase('done');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6)) as {
              type: string;
              item?: string;
              success?: boolean;
              note?: string;
              succeeded?: number;
              failed?: number;
              failures?: { item: string; note?: string }[];
              message?: string;
            };
            if (event.type === 'progress' && event.item !== undefined) {
              setProgress((prev) => [...prev, { name: event.item!, success: !!event.success, note: event.note }]);
            } else if (event.type === 'done') {
              setSummary({ succeeded: event.succeeded ?? 0, failed: event.failed ?? 0, failures: event.failures ?? [] });
              setPhase('done');
            } else if (event.type === 'error') {
              setError(event.message ?? 'Unknown error');
              setPhase('done');
            }
          } catch {
            // ignore malformed SSE lines
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('done');
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <div className="p-3">
        <StatusBanner type="loading" message="Loading recipes from your box…" />
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="p-3">
        <StatusBanner type="error" message={error} />
      </div>
    );
  }

  // ── Recipe selection ─────────────────────────────────────────────────────

  if (phase === 'select') {
    const selectedCount = recipes.filter((r) => r.selected).length;
    return (
      <div className="p-3 flex flex-col gap-3">
        {boxTitle && <h2 className="font-semibold text-base text-gray-900 leading-snug">{boxTitle}</h2>}
        <p className="text-xs text-gray-500">{selectedCount} of {recipes.length} recipes selected</p>
        <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
          {recipes.map((recipe, i) => (
            <label key={i} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={recipe.selected}
                onChange={() =>
                  setRecipes((prev) =>
                    prev.map((r, idx) => idx === i ? { ...r, selected: !r.selected } : r)
                  )
                }
                className="shrink-0"
              />
              <span className="truncate">{recipe.title}</span>
              <span className="text-xs text-gray-400 shrink-0">{recipe.ingredients.length} ing.</span>
            </label>
          ))}
        </div>
        <button
          onClick={() => handleGenerate()}
          disabled={selectedCount === 0}
          className="w-full py-2 rounded bg-black text-white text-sm font-medium disabled:opacity-40 hover:bg-gray-800 transition-colors"
        >
          Generate Shopping List ({selectedCount})
        </button>
      </div>
    );
  }

  // ── Generating ───────────────────────────────────────────────────────────

  if (phase === 'generating') {
    return (
      <div className="p-3">
        <StatusBanner type="loading" message="Claude is building your shopping list…" />
      </div>
    );
  }

  // ── Shopping list review ─────────────────────────────────────────────────

  if (phase === 'review') {
    const selectedCount = shoppingItems.filter((i) => i.checked).length;
    return (
      <div className="p-3 flex flex-col gap-3">
        {boxTitle && <h2 className="font-semibold text-base text-gray-900 leading-snug">{boxTitle}</h2>}
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">{selectedCount} of {shoppingItems.length} items selected</p>
          <button
            onClick={() => handleGenerate(true)}
            className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
          >
            {fromCache ? 'Regenerate ↺' : '↺ Regenerate'}
          </button>
        </div>
        <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
          {shoppingItems.map((item, i) => (
            <label key={i} className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={item.checked}
                onChange={() =>
                  setShoppingItems((prev) =>
                    prev.map((it, idx) => idx === i ? { ...it, checked: !it.checked } : it)
                  )
                }
                className="mt-0.5 shrink-0"
              />
              <span className="flex-1">
                <span className="font-medium">{item.name}</span>
                {item.quantity && <span className="text-gray-400"> — {item.quantity}</span>}
              </span>
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-400 italic">
          Amazon Fresh will open in your browser. The popup may close — the automation will continue.
        </p>
        <button
          onClick={handleAddToCart}
          disabled={selectedCount === 0}
          className="w-full py-2 rounded bg-black text-white text-sm font-medium disabled:opacity-40 hover:bg-gray-800 transition-colors"
        >
          Add to Cart ({selectedCount})
        </button>
      </div>
    );
  }

  // ── Ordering / Done ──────────────────────────────────────────────────────

  return (
    <div className="p-3 flex flex-col gap-3">
      {(phase === 'ordering' || phase === 'done') && progress.length === 0 && !summary && (
        <StatusBanner type="loading" message="Opening Amazon Fresh…" />
      )}

      {progress.length > 0 && (
        <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
          {progress.map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span>{p.success ? '✓' : '✗'}</span>
              <span className={p.success ? 'text-gray-800' : 'text-red-600'}>{p.name}</span>
              {p.note && <span className="text-xs text-gray-400">{p.note}</span>}
            </div>
          ))}
        </div>
      )}

      {phase === 'ordering' && <StatusBanner type="loading" message="Adding items to cart…" />}

      {phase === 'done' && summary && (
        <div className="text-sm">
          <p className="font-medium">
            {summary.succeeded} added{summary.failed > 0 ? `, ${summary.failed} failed` : ''}
          </p>
          {summary.failures.length > 0 && (
            <ul className="mt-1 text-xs text-red-600 list-disc list-inside">
              {summary.failures.map((f, i) => (
                <li key={i}>{f.item}{f.note ? ` — ${f.note}` : ''}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {phase === 'done' && error && <StatusBanner type="error" message={error} />}
    </div>
  );
}

async function sendScrapeMessage(tabId: number): Promise<RecipeBoxScrapeResponse> {
  // First attempt — content script may already be loaded
  try {
    return await new Promise<RecipeBoxScrapeResponse>((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { type: 'SCRAPE_RECIPE_BOX' }, (resp) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(resp as RecipeBoxScrapeResponse);
      });
    });
  } catch {
    // Content script not yet injected (tab was open before extension loaded) — inject and retry
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/recipe-box-scraper.js'],
    });
    return new Promise<RecipeBoxScrapeResponse>((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { type: 'SCRAPE_RECIPE_BOX' }, (resp) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(resp as RecipeBoxScrapeResponse);
      });
    });
  }
}
