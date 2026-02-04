import { UploadItem } from '../hooks/useUpload';

interface UploadProgressProps {
  items: UploadItem[];
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
  onClearDone: () => void;
}

export function UploadProgress({ items, onCancel, onRemove, onClearDone }: UploadProgressProps) {
  if (items.length === 0) return null;

  const hasDone = items.some(
    (i) => i.state === 'done' || i.state === 'error' || i.state === 'cancelled',
  );

  return (
    <div className="mt-4 space-y-2">
      {hasDone && (
        <div className="flex justify-end">
          <button onClick={onClearDone} className="text-xs text-gray-500 hover:text-gray-700">
            Clear finished
          </button>
        </div>
      )}
      {items.map((item) => (
        <UploadItemRow
          key={item.id}
          item={item}
          onCancel={() => onCancel(item.id)}
          onRemove={() => onRemove(item.id)}
        />
      ))}
    </div>
  );
}

function UploadItemRow({
  item,
  onCancel,
  onRemove,
}: {
  item: UploadItem;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const stateLabel: Record<string, string> = {
    pending: 'Waiting...',
    uploading: 'Uploading',
    completing: 'Finalizing',
    done: 'Complete',
    error: 'Failed',
    cancelled: 'Cancelled',
  };

  const isActive = item.state === 'uploading' || item.state === 'completing' || item.state === 'pending';

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-700 truncate max-w-xs">
          {item.file.name}
        </span>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs ${
              item.state === 'done'
                ? 'text-green-600'
                : item.state === 'error'
                  ? 'text-red-600'
                  : item.state === 'cancelled'
                    ? 'text-gray-400'
                    : 'text-gray-500'
            }`}
          >
            {stateLabel[item.state]}
            {item.state === 'uploading' && ` ${item.progress}%`}
          </span>
          {isActive && (
            <button
              onClick={onCancel}
              className="text-xs text-red-500 hover:text-red-700 font-medium"
            >
              Cancel
            </button>
          )}
          {!isActive && (
            <button
              onClick={onRemove}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              x
            </button>
          )}
        </div>
      </div>

      {(item.state === 'uploading' || item.state === 'completing') && (
        <div className="w-full bg-gray-200 rounded-full h-1.5">
          <div
            className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${item.progress}%` }}
          />
        </div>
      )}

      {item.state === 'error' && item.error && (
        <p className="text-xs text-red-500 mt-1">{item.error}</p>
      )}
    </div>
  );
}
