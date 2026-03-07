import { useState } from 'react';

interface Props {
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

export function NewListInput({ onConfirm, onCancel }: Props) {
  const [value, setValue] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onConfirm(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-1 mt-1">
      <input
        autoFocus
        type="text"
        placeholder="List name…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="flex-1 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-black"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className="text-sm px-2 py-1 bg-black text-white rounded disabled:opacity-40"
      >
        Create
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="text-sm px-2 py-1 text-gray-500 rounded hover:bg-gray-100"
      >
        ✕
      </button>
    </form>
  );
}
