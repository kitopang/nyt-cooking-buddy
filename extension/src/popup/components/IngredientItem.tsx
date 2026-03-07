import type { ScrapedIngredient } from '../../shared/types';

interface Props {
  ingredient: ScrapedIngredient;
  onChange: (checked: boolean) => void;
}

export function IngredientItem({ ingredient, onChange }: Props) {
  return (
    <label className="flex items-start gap-2 py-1 cursor-pointer group">
      <input
        type="checkbox"
        checked={ingredient.checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 shrink-0 accent-black"
      />
      <span className={`text-sm leading-snug ${ingredient.checked ? 'line-through text-gray-400' : 'text-gray-800'}`}>
        {ingredient.rawText}
      </span>
    </label>
  );
}
