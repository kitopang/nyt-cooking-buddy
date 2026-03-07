import { useState, useEffect } from 'react';
import type { ShoppingItem } from '../../shared/types';
import { api } from '../hooks/useApi';
import { StatusBanner } from './StatusBanner';

const API_BASE = 'http://localhost:3001';

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

interface Props {
  listId: number;
  onBack: () => void;
}

export function OrderView({ listId, onBack }: Props) {
  type Phase = 'generating' | 'review' | 'ordering' | 'done';

  const [phase, setPhase] = useState<Phase>('generating');
  const [error, setError] = useState('');
  const [items, setItems] = useState<(ShoppingItem & { checked: boolean })[]>([]);
  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const [summary, setSummary] = useState<DoneEvent | null>(null);

  useEffect(() => {
    api.getShoppingList(listId)
      .then((data) => {
        setItems(data.items.map((item) => ({ ...item, checked: true })));
        setPhase('review');
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        setPhase('review');
      });
  }, [listId]);

  async function handleAddToCart() {
    const selected = items.filter((i) => i.checked);
    if (selected.length === 0) return;

    setPhase('ordering');
    setProgress([]);

    try {
      const res = await fetch(`${API_BASE}/api/lists/${listId}/add-to-cart`, {
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

  const selectedCount = items.filter((i) => i.checked).length;

  return (
    <div className="p-3 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-xs text-gray-500 hover:text-gray-800">
          ← Back
        </button>
        <span className="text-sm font-medium text-gray-800">Order on Amazon Fresh</span>
      </div>

      {phase === 'generating' && (
        <StatusBanner type="loading" message="Claude is building your shopping list…" />
      )}

      {phase === 'review' && error && (
        <StatusBanner type="error" message={error} />
      )}

      {phase === 'review' && !error && (
        <>
          <p className="text-xs text-gray-500">{selectedCount} of {items.length} items selected</p>
          <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
            {items.map((item, i) => (
              <label key={i} className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() =>
                    setItems((prev) =>
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
        </>
      )}

      {(phase === 'ordering' || (phase === 'done' && !summary)) && progress.length === 0 && !error && (
        <StatusBanner type="loading" message="Opening Amazon Fresh…" />
      )}

      {(phase === 'ordering' || phase === 'done') && progress.length > 0 && (
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

      {phase === 'ordering' && (
        <StatusBanner type="loading" message="Adding items to cart…" />
      )}

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

      {phase === 'done' && error && (
        <StatusBanner type="error" message={error} />
      )}
    </div>
  );
}
