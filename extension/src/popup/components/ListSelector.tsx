import type { GroceryList } from '../../shared/types';
import { NewListInput } from './NewListInput';

interface Props {
  lists: GroceryList[];
  selectedId: number | 'new' | null;
  onSelect: (id: number | 'new') => void;
  onNewList: (name: string) => void;
}

export function ListSelector({ lists, selectedId, onSelect, onNewList }: Props) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">Save to list</label>
      <select
        value={selectedId ?? ''}
        onChange={(e) => {
          const val = e.target.value;
          onSelect(val === 'new' ? 'new' : Number(val));
        }}
        className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-black bg-white"
      >
        <option value="" disabled>Select a list…</option>
        {lists.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name} ({l.recipeCount} recipe{l.recipeCount !== 1 ? 's' : ''})
          </option>
        ))}
        <option value="new">+ New list…</option>
      </select>

      {selectedId === 'new' && (
        <NewListInput
          onConfirm={onNewList}
          onCancel={() => onSelect(lists[0]?.id ?? 'new')}
        />
      )}
    </div>
  );
}
