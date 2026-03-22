import { useState, useEffect } from 'react';
import type { GroceryList, Recipe } from '../../shared/types';
import { api } from '../hooks/useApi';
import { StatusBanner } from './StatusBanner';

interface Props {
  lists: GroceryList[];
  onBack: () => void;
  onOrder: (listId: number) => void;
}

export function ListView({ lists, onBack, onOrder }: Props) {
  const [selectedListId, setSelectedListId] = useState<number | null>(lists[0]?.id ?? null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedListId) return;
    setLoading(true);
    setError('');
    api.getList(selectedListId)
      .then((data) => setRecipes(data.recipes))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [selectedListId]);

  return (
    <div className="p-3 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="text-xs text-gray-500 hover:text-gray-800"
        >
          ← Back
        </button>
        <span className="text-sm font-medium text-gray-800">Browse List</span>
      </div>

      {lists.length === 0 ? (
        <p className="text-sm text-gray-500">No lists yet. Save a recipe first.</p>
      ) : (
        <>
          <select
            value={selectedListId ?? ''}
            onChange={(e) => setSelectedListId(Number(e.target.value))}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-black"
          >
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.recipeCount} recipe{l.recipeCount !== 1 ? 's' : ''})
              </option>
            ))}
          </select>

          {loading && <StatusBanner type="loading" message="Loading recipes…" />}
          {error && <StatusBanner type="error" message={error} />}

          {!loading && !error && (
            recipes.length === 0 ? (
              <p className="text-sm text-gray-500">No recipes in this list yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {recipes.map((r) => (
                  <div key={r.id} className="border border-gray-200 rounded p-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <button
                        onClick={() => chrome.tabs.create({ url: r.url, active: false })}
                        className="text-sm font-medium text-black hover:underline text-left"
                      >
                        {r.name}
                      </button>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {r.ingredients.length} ingredient{r.ingredients.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        api.deleteRecipe(r.id)
                          .then(() => setRecipes((prev) => prev.filter((x) => x.id !== r.id)))
                          .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
                      }}
                      className="text-gray-300 hover:text-red-500 transition-colors shrink-0 text-xs mt-0.5"
                      aria-label="Remove recipe"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )
          )}

          <button
            onClick={() => selectedListId && onOrder(selectedListId)}
            disabled={!selectedListId || recipes.length === 0 || loading}
            className="w-full py-2 rounded bg-black text-white text-sm font-medium disabled:opacity-40 hover:bg-gray-800 transition-colors"
          >
            Order on Amazon Fresh
          </button>
        </>
      )}
    </div>
  );
}
