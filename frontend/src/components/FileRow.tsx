import { useState } from 'react';
import { FileMeta } from '../types';
import { getDownloadUrl } from '../api/download';
import { deleteFile } from '../api/files';
import { DownloadLog } from './DownloadLog';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

interface FileRowProps {
  file: FileMeta;
  onRefresh?: () => void;
}

export function FileRow({ file, onRefresh }: FileRowProps) {
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const { url } = await getDownloadUrl(file.id);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      onRefresh?.();
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${file.name}"?`)) return;
    setDeleting(true);
    try {
      await deleteFile(file.id);
      onRefresh?.();
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <tr className="border-b border-gray-100 last:border-b-0">
      <td className="py-3 pr-4">
        <div className="text-sm font-medium text-gray-900 truncate max-w-xs">{file.name}</div>
        <div className="text-xs text-gray-500">
          by {file.uploadedBy} &mdash; {new Date(file.uploadedAt).toLocaleString()}
        </div>
      </td>
      <td className="py-3 pr-4 text-sm text-gray-600 whitespace-nowrap">{formatSize(file.size)}</td>
      <td className="py-3 pr-4">
        <DownloadLog downloads={file.downloads} />
      </td>
      <td className="py-3 text-right whitespace-nowrap">
        <button
          onClick={handleDownload}
          disabled={downloading || deleting}
          className="text-sm text-blue-600 hover:text-blue-700 hover:underline disabled:opacity-50 mr-3"
        >
          {downloading ? 'Preparing...' : 'Download'}
        </button>
        <button
          onClick={handleDelete}
          disabled={downloading || deleting}
          className="text-sm text-red-500 hover:text-red-700 hover:underline disabled:opacity-50"
        >
          {deleting ? 'Deleting...' : 'Delete'}
        </button>
      </td>
    </tr>
  );
}
