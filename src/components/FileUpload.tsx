'use client';

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, X, Check, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';

export function FileUpload() {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setError(null);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.endsWith('.md')) {
      setFile(droppedFile);
    } else {
      setError('请上传 .md（Markdown）格式的文件');
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.name.endsWith('.md')) {
      setFile(selectedFile);
    } else {
      setError('请上传 .md（Markdown）格式的文件');
    }
  }, []);

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await apiFetch('/api/resumes', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '上传失败');
      }

      setUploaded(true);
      setTimeout(() => {
        router.push('/');
        router.refresh();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const removeFile = () => {
    setFile(null);
    setError(null);
    setUploaded(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto">
      <AnimatePresence mode="wait">
        {!file ? (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative cursor-pointer border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300
              ${isDragging
                ? 'border-[var(--accent)] bg-[var(--accent-glow)] scale-[1.02]'
                : 'border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--accent-glow)]'
              }
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".md"
              onChange={handleFileSelect}
              className="hidden"
            />

            <motion.div
              animate={isDragging ? { scale: 1.15, y: -5 } : { scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="w-16 h-16 rounded-2xl bg-[var(--muted)] flex items-center justify-center">
                <Upload className="w-7 h-7 text-[var(--muted-foreground)]" />
              </div>
              <div>
                <p className="text-lg font-medium mb-1">
                  {isDragging ? '松开鼠标即可上传' : '将简历文件拖拽到这里'}
                </p>
                <p className="text-sm text-[var(--muted-foreground)]">
                  或点击选择文件 — 支持 .md 格式
                </p>
              </div>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="preview"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="border border-[var(--border)] rounded-2xl p-6"
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-[var(--accent-glow)] flex items-center justify-center">
                <FileText className="w-6 h-6 text-[var(--accent)]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{file.name}</p>
                <p className="text-sm text-[var(--muted-foreground)]">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
              {!uploading && !uploaded && (
                <button
                  onClick={removeFile}
                  className="p-2 rounded-lg hover:bg-[var(--muted)] transition-colors"
                >
                  <X className="w-4 h-4 text-[var(--muted-foreground)]" />
                </button>
              )}
            </div>

            <AnimatePresence mode="wait">
              {uploaded ? (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400"
                >
                  <Check className="w-5 h-5" />
                  <span className="font-medium">上传成功！</span>
                </motion.div>
              ) : (
                <motion.button
                  key="button"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={handleUpload}
                  disabled={uploading}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)] text-white font-medium
                    hover:shadow-lg hover:shadow-[var(--accent-glow)] transition-shadow duration-300
                    disabled:opacity-60 disabled:cursor-not-allowed
                    flex items-center justify-center gap-2"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      上传中...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      上传简历
                    </>
                  )}
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <motion.p
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 text-sm text-red-500 text-center"
        >
          {error}
        </motion.p>
      )}
    </div>
  );
}
