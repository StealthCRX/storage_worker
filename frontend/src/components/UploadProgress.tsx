import { UploadStatus } from '../hooks/useUpload';

interface UploadProgressProps {
  status: UploadStatus;
  onReset: () => void;
}

export function UploadProgress({ status, onReset }: UploadProgressProps) {
  if (status.state === 'idle') return null;

  const stateLabel = {
    uploading: 'Uploading',
    completing: 'Finalizing',
    done: 'Complete',
    error: 'Failed',
    idle: '',
  }[status.state];

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mt-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700 truncate max-w-xs">
          {status.fileName}
        </span>
        <span className="text-sm text-gray-500">{stateLabel}</span>
      </div>

      {(status.state === 'uploading' || status.state === 'completing') && (
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${status.progress}%` }}
          />
        </div>
      )}

      {status.state === 'uploading' && (
        <p className="text-xs text-gray-500 mt-1">{status.progress}%</p>
      )}

      {status.state === 'done' && (
        <div className="flex items-center justify-between mt-1">
          <p className="text-sm text-green-600">Upload complete</p>
          <button onClick={onReset} className="text-sm text-blue-600 hover:underline">
            Upload another
          </button>
        </div>
      )}

      {status.state === 'error' && (
        <div className="mt-1">
          <p className="text-sm text-red-600">{status.error}</p>
          <button onClick={onReset} className="text-sm text-blue-600 hover:underline mt-1">
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
