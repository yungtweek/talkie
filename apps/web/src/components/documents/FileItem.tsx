import React from 'react';
import { FragmentType } from '@/gql';
import { FileMetaFragment, FileMetaFragmentDoc } from '@/gql/graphql';
import type { FileVisibility as FileVisibilityT } from '@/gql/graphql';
import { FileStatus, FileVisibility } from '@talkie/types-zod';
import { useFragment } from '@apollo/client/react';
import { formatBytes } from '@/lib/format';

// ---- UI helpers (module-level to avoid re-creation per render) ----
const renderStatus = (status: FileStatus) => {
  const s = String(status || '').toLowerCase();
  const base =
    'inline-flex items-center justify-center min-w-14 h-[22px] px-2 rounded-full text-[11px] tracking-[0.2px] border cursor-default';
  const cls =
    s === FileStatus.Ready || s === FileStatus.Indexed
      ? 'bg-[var(--warn-bg)] text-[var(--warn-fg)] border-[color:var(--warn-border)]'
      : s === FileStatus.Vectorized
        ? 'bg-[var(--ok-bg)] text-[var(--ok-fg)] border-[color:var(--ok-border)] font-semibold'
        : 'bg-[color:var(--muted-badge-bg)] text-[color:var(--muted-badge-fg)] border-border';
  return <span className={`${base} ${cls}`}>{(status ?? '-').toUpperCase()}</span>;
};

const renderVisibility = (v: FileVisibility) => {
  const isPublic = v === FileVisibility.Public;
  const base =
    'inline-flex items-center justify-center min-w-14 h-[22px] px-2 rounded-full text-[11px] tracking-[0.2px] border';
  const cls = isPublic
    ? 'bg-[var(--info-bg)] text-[var(--info-fg)] border-[color:var(--info-border)] hover:border-[color:var(--info-strong-border)]'
    : 'bg-[var(--danger-bg)] text-[var(--danger-fg)] border-[color:var(--danger-border)] hover:border-[color:var(--danger-strong-border)]';
  return <span className={`${base} ${cls}`}>{String(v).toUpperCase()}</span>;
};

const FileItem: React.FC<{
  node: FragmentType<typeof FileMetaFragmentDoc>;
  deleting: boolean;
  updatingVisibility: boolean;
  onToggle: (fileId: string, v: FileVisibilityT) => Promise<void>;
  onDelete: (fileId: string) => Promise<void>;
}> = ({ node, deleting, updatingVisibility, onToggle, onDelete }) => {
  const { data } = useFragment<FileMetaFragment>({
    fragment: FileMetaFragmentDoc,
    from: node,
  });

  if (!data) return null;
  // Narrow possibly null fragment fields (schema may allow nulls)
  if (!data.id || !data.status || !data.visibility) return null;

  const id = data.id;
  const visibility = data.visibility;
  const status = data.status;

  return (
    <tr>
      <td className="max-w-[420px] overflow-hidden text-ellipsis whitespace-nowrap" title={data.filename}>
        {data.filename}
      </td>
      <td style={{ textAlign: 'center', width: 150 }}>{renderStatus(status)}</td>
      <td style={{ textAlign: 'center', width: 90 }}>{formatBytes(data.size)}</td>
      <td style={{ textAlign: 'center', width: 120 }}>
        <button
          type="button"
          className="bg-transparent p-0"
          onClick={() => {
            void onToggle(id, visibility);
          }}
          aria-label={`toggle visibility for ${data.filename}`}
        >
          {renderVisibility(data.visibility)}
        </button>
      </td>
      <td className="w-px whitespace-nowrap text-right">
        <button
          type="button"
          className={
            'rounded-md border border-[color:var(--danger-border)] bg-[var(--danger-bg)] px-2.5 py-2 text-sm font-medium text-[var(--danger-fg)] hover:border-[color:var(--danger-strong-border)]'
          }
          onClick={() => {
            void onDelete(id);
          }}
          disabled={deleting || updatingVisibility}
        >
          DELETE
        </button>
      </td>
    </tr>
  );
};

export default React.memo(FileItem);
