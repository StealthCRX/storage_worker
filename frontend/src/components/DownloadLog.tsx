import { useState } from 'react';
import { DownloadEntry } from '../types';

interface DownloadLogProps {
  downloads: DownloadEntry[];
}

export function DownloadLog({ downloads }: DownloadLogProps) {
  const [expanded, setExpanded] = useState(false);

  if (downloads.length === 0) {
    return <span className="text-xs text-gray-400">No downloads</span>;
  }

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-blue-600 hover:underline"
      >
        {downloads.length} download{downloads.length !== 1 ? 's' : ''}
        {expanded ? ' (hide)' : ''}
      </button>
      {expanded && (
        <ul className="mt-1 space-y-0.5">
          {downloads.map((d, i) => (
            <li key={i} className="text-xs text-gray-500">
              {d.by} &mdash; {new Date(d.at).toLocaleString()}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
