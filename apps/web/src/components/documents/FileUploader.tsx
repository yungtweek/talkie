'use client';
import React, { useRef, useState } from 'react';
import { fetchWithAutoRefresh } from '@/lib/fetchWithAutoRefresh.client';
import { presignAction } from '@/actions/ingest/presign.action';
import { completeAction } from '@/actions/ingest/complete.action';

export default function FileUploader() {
  const [pending, setPending] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const inputRef = useRef<HTMLInputElement>(null);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
  };

  const setFileFromList = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const f = files[0];
    setFile(f);
  };

  const handleDragEnter = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);
    const dt = e.dataTransfer;
    setFileFromList(dt?.files ?? null);
    // 드롭 후 포커스가 버튼으로 넘어가도록 약간의 배려
    if (dt && inputRef.current) inputRef.current.focus();
  };

  async function sha256Base64(file: File) {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const bytes = new Uint8Array(hashBuffer);
    let binary = '';
    for (const b of bytes) {
      binary += String.fromCharCode(b);
    }
    return btoa(binary);
  }

  async function uploadFileToPresignedUrl(
    url: string,
    file: File,
    contentType: string,
    checksumBase64: string,
  ) {
    const res = await fetchWithAutoRefresh(url, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'x-amz-checksum-sha256': checksumBase64,
      },
      credentials: 'include',
      body: file,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Upload failed: ${res.status} ${errText}`);
    }

    return {
      success: true,
      location: url.split('?')[0], // 실제 접근 가능한 S3 object URL
    };
  }

  const fetchData = async () => {
    if (!file || pending) return;
    setPending(true);

    const checksum = await sha256Base64(file);
    try {
      const presign = await presignAction({
        filename: file.name,
        checksum,
        contentType: file.type,
        size: file.size,
      });

      if (!presign.success) {
        return Promise.reject(new Error(`${presign.error.message}`));
      }
      const { url, bucket, key, contentType } = presign.data;

      const upload = await uploadFileToPresignedUrl(url, file, contentType, checksum);

      if (!upload.success) {
        return Promise.reject(new Error('Uploading FileType failed'));
      }

      const complete = await completeAction({ bucket, key, filename: file.name });

      if (!complete.success) {
        return Promise.reject(new Error(`${complete.error.message}`));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setPending(false);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = e => {
    e.preventDefault();
    if (pending || !file) return;
    void fetchData();
  };

  return (
    <div className="my-3">
      <form
        className="rounded-xl border border-border bg-white/70 p-4 shadow-sm backdrop-blur-sm dark:bg-white/5"
        onSubmit={handleSubmit}
        aria-busy={pending}
      >
        <div className="grid grid-cols-[1fr_auto] items-center gap-3">
          <label
            htmlFor="file-input"
            className={
              `relative flex min-h-11 w-full cursor-pointer select-none items-center justify-center gap-2 rounded-md border border-dashed ` +
              `border-white/20 bg-white/10 px-3 py-2 text-sm transition ` +
              `hover:border-white/40 hover:bg-white/20 ` +
              (isDragging
                ? 'border-indigo-400/70 bg-indigo-500/10 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.35)]'
                : '')
            }
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            aria-label="Drag & drop a file or click to select"
          >
            <span className="pointer-events-none text-[13px] text-neutral-300">
              {isDragging ? 'Drop here' : file ? file.name : 'Select a file or drag & drop'}
            </span>
            <input
              id="file-input"
              ref={inputRef}
              type="file"
              onChange={e => setFileFromList(e.target.files)}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-describedby="file-help"
            />
          </label>

          <button
            type="submit"
            className="h-[42px] w-20 rounded-lg border border-white/20 bg-gradient-to-b from-white/10 to-white/5 px-3 py-2 text-sm font-semibold text-neutral-100 transition hover:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={pending || !file}
          >
            {pending ? '…' : 'Upload'}
          </button>
        </div>
        <p id="file-help" className="mt-2 text-xs text-neutral-400">
          Please upload a document file. (PDF, Markdown, etc.)
        </p>
      </form>
    </div>
  );
}
