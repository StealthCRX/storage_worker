import { useFiles } from '../hooks/useFiles';
import { useUpload } from '../hooks/useUpload';
import { DropZone } from '../components/DropZone';
import { UploadProgress } from '../components/UploadProgress';
import { FileList } from '../components/FileList';

export function DashboardPage() {
  const { files, loading, error, refresh } = useFiles();
  const { status, upload, reset } = useUpload(refresh);

  const isUploading = status.state === 'uploading' || status.state === 'completing';

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Upload</h2>
        <DropZone onFileSelected={upload} disabled={isUploading} />
        <UploadProgress status={status} onReset={reset} />
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Files</h2>
          <button
            onClick={refresh}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Refresh
          </button>
        </div>
        <FileList files={files} loading={loading} error={error} onRefresh={refresh} />
      </section>
    </div>
  );
}
