import type { ScrapedRecipe } from '../../shared/types';

interface Props {
  recipe: ScrapedRecipe;
}

export function RecipeView({ recipe }: Props) {
  return (
    <div>
      <h2 className="font-semibold text-sm text-gray-900 leading-snug mb-1">
        {recipe.name}
      </h2>
      <p className="text-xs text-gray-400 mb-2">
        {recipe.ingredients.length} ingredient{recipe.ingredients.length !== 1 ? 's' : ''}
      </p>
      {/* <div className="max-h-56 overflow-y-auto pr-1 border-t border-gray-100 pt-1">
        {recipe.ingredients.map((ing, i) => (
          <p key={i} className="text-sm text-gray-700 py-0.5">{ing.rawText}</p>
        ))}
      </div> */}
    </div>
  );
}
