import { Header } from './components/Header';
import { RecipeBoxView } from './components/RecipeBoxView';
import { StatusBanner } from './components/StatusBanner';
import { useRecipeScrape } from './hooks/useRecipeScrape';

export function App() {
  const scrapeState = useRecipeScrape();

  if (scrapeState.status === 'loading') {
    return (
      <div>
        <Header />
        <div className="px-3 pb-3">
          <StatusBanner type="loading" message="Detecting page…" />
        </div>
      </div>
    );
  }

  if (scrapeState.status === 'recipe-box') {
    return (
      <div>
        <Header />
        <RecipeBoxView />
      </div>
    );
  }

  // not-recipe, ready (recipe page), or error — we no longer act on recipe pages
  return (
    <div>
      <Header />
      <div className="px-3 pb-3">
        <p className="text-sm text-gray-500">
          Navigate to an NYT Cooking recipe box to generate a shopping list.
        </p>
      </div>
    </div>
  );
}
