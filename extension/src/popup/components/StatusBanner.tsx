interface Props {
  type: 'loading' | 'error' | 'success';
  message?: string;
}

export function StatusBanner({ type, message }: Props) {
  if (type === 'loading') {
    return (
      <div className="flex items-center justify-center gap-2 py-4 text-gray-500 text-sm">
        <span className="animate-spin text-base">⟳</span>
        {message ?? 'Loading...'}
      </div>
    );
  }

  if (type === 'error') {
    return (
      <div className="rounded bg-red-50 border border-red-200 px-3 py-2 text-red-700 text-sm">
        {message}
      </div>
    );
  }

  return (
    <div className="rounded bg-green-50 border border-green-200 px-3 py-2 text-green-700 text-sm">
      {message}
    </div>
  );
}
