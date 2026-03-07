import { useState, useEffect } from 'react';
import type { GroceryList, ScrapedRecipe } from '../shared/types';
import { useRecipeScrape } from './hooks/useRecipeScrape';
import { api } from './hooks/useApi';
import { RecipeView } from './components/RecipeView';
import { ListSelector } from './components/ListSelector';
import { StatusBanner } from './components/StatusBanner';
import { ListView } from './components/ListView';

type Phase = 'loading' | 'not-recipe' | 'ready' | 'saving' | 'saved' | 'error';
type View = 'add' | 'browse';

export function App() {
  const scrapeState = useRecipeScrape();

  const [view, setView] = useState<View>('add');
  const [lists, setLists] = useState<GroceryList[]>([]);
  const [selectedListId, setSelectedListId] = useState<number | 'new' | null>(null);
  const [recipe, setRecipe] = useState<ScrapedRecipe | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [savedListName, setSavedListName] = useState('');
  // URLs already saved in the currently selected list
  const [existingUrls, setExistingUrls] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (scrapeState.status === 'not-recipe') {
      api.getLists()
        .then((fetched) => {
          setLists(fetched);
          setPhase('not-recipe');
        })
        .catch(() => setPhase('not-recipe'));
      return;
    }
    if (scrapeState.status === 'error') {
      setPhase('error');
      setErrorMsg(scrapeState.error);
      return;
    }
    if (scrapeState.status === 'ready') {
      setRecipe(scrapeState.recipe);
      api.getLists()
        .then((fetched) => {
          setLists(fetched);
          setSelectedListId(fetched[0]?.id ?? 'new');
          setPhase('ready');
        })
        .catch((err: unknown) => {
          setPhase('error');
          setErrorMsg(err instanceof Error ? err.message : String(err));
        });
    }
  }, [scrapeState.status]);

  // Whenever the selected list changes, fetch its recipes to build the URL set
  useEffect(() => {
    if (typeof selectedListId !== 'number') {
      setExistingUrls(new Set());
      return;
    }
    api.getList(selectedListId)
      .then((data) => setExistingUrls(new Set(data.recipes.map((r) => r.url))))
      .catch(() => setExistingUrls(new Set()));
  }, [selectedListId]);

  const alreadySaved = recipe !== null && existingUrls.has(recipe.url);

  async function handleSave() {
    if (!recipe || selectedListId === null || selectedListId === 'new') return;
    setPhase('saving');
    try {
      const listName = lists.find((l) => l.id === selectedListId)?.name ?? 'your list';
      await api.saveRecipe(selectedListId, recipe);
      const fetched = await api.getLists();
      setLists(fetched);
      setExistingUrls((prev) => new Set([...prev, recipe.url]));
      setSavedListName(listName);
      setPhase('saved');
    } catch (err: unknown) {
      setPhase('error');
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleNewList(name: string) {
    try {
      const created = await api.createList(name);
      setLists((prev) => [created, ...prev]);
      setSelectedListId(created.id);
    } catch (err: unknown) {
      setPhase('error');
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }

  if (view === 'browse') {
    return <ListView lists={lists} onBack={() => setView('add')} />;
  }

  if (phase === 'loading' || scrapeState.status === 'loading') {
    return <div className="p-3"><StatusBanner type="loading" message="Reading recipe…" /></div>;
  }

  if (phase === 'error') {
    return <div className="p-3"><StatusBanner type="error" message={errorMsg} /></div>;
  }

  const browseButton = (
    <button
      onClick={() => setView('browse')}
      className="w-full py-1.5 rounded border border-gray-200 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
    >
      Browse saved recipes
    </button>
  );

  if (phase === 'not-recipe') {
    return (
      <div className="p-3 flex flex-col gap-3">
        <p className="text-sm text-gray-600">Navigate to an NYT Cooking recipe page to save it.</p>
        {browseButton}
      </div>
    );
  }

  if (phase === 'saved') {
    return (
      <div className="p-3 flex flex-col gap-3">
        <StatusBanner type="success" message={`Saved to "${savedListName}"!`} />
        {browseButton}
      </div>
    );
  }

  // phase === 'ready' | 'saving'
  return (
    <div className="p-3 flex flex-col gap-3">
      {recipe && <RecipeView recipe={recipe} />}

      <ListSelector
        lists={lists}
        selectedId={selectedListId}
        onSelect={setSelectedListId}
        onNewList={handleNewList}
      />

      <button
        onClick={handleSave}
        disabled={phase === 'saving' || selectedListId === null || selectedListId === 'new' || alreadySaved}
        className="w-full py-2 rounded bg-black text-white text-sm font-medium disabled:opacity-40 hover:bg-gray-800 transition-colors"
      >
        {alreadySaved ? 'Already in list' : phase === 'saving' ? 'Saving…' : 'Save Recipe'}
      </button>

      {browseButton}
    </div>
  );
}
