interface Props {
  type: 'loading' | 'error' | 'success';
  message?: string;
}

export function StatusBanner({ type, message }: Props) {
  if (type === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-6 text-gray-500 text-sm">
        <svg className="animate-spin h-6 w-6 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
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
