import { FileMeta } from '../types';
import { FileRow } from './FileRow';

interface FileListProps {
  files: FileMeta[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export function FileList({ files, loading, error, onRefresh }: FileListProps) {
  if (loading) {
    return <p className="text-sm text-gray-500 py-4">Loading files...</p>;
  }

  if (error) {
    return (
      <div className="py-4">
        <p className="text-sm text-red-600">{error}</p>
        <button onClick={onRefresh} className="text-sm text-blue-600 hover:underline mt-1">
          Retry
        </button>
      </div>
    );
  }

  if (files.length === 0) {
    return <p className="text-sm text-gray-500 py-4">No files uploaded yet.</p>;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-2 px-4">
              File
            </th>
            <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-2 px-4">
              Size
            </th>
            <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-2 px-4">
              Downloads
            </th>
            <th className="py-2 px-4"></th>
          </tr>
        </thead>
        <tbody className="px-4">
          {files.map((file) => (
            <FileRow key={file.id} file={file} onRefresh={onRefresh} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
