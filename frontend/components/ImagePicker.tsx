'use client';

import { ImagePlus, Star, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type DragEvent } from 'react';
import { cn } from '@/lib/format';
import { ACCEPTED_IMAGE_TYPES, MAX_PRODUCT_IMAGES } from '@/lib/validation';

interface ImagePickerProps {
  files: File[];
  onChange: (files: File[]) => void;
  error?: string | null;
}

export function ImagePicker({ files, onChange, error }: ImagePickerProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  function add(list: FileList | null) {
    if (!list || list.length === 0) return;
    onChange([...files, ...Array.from(list)]);
  }

  function remove(index: number) {
    onChange(files.filter((_, i) => i !== index));
  }

  function makeCover(index: number) {
    onChange([files[index], ...files.filter((_, i) => i !== index)]);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    add(e.dataTransfer.files);
  }

  const full = files.length >= MAX_PRODUCT_IMAGES;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <label htmlFor={inputId} className="text-xs font-medium text-muted">
          Photos
        </label>
        <span className={cn('text-xs', files.length > MAX_PRODUCT_IMAGES ? 'text-danger' : 'text-subtle')}>
          {files.length}/{MAX_PRODUCT_IMAGES}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {files.map((file, index) => (
          <div key={previews[index]} className="group relative aspect-square overflow-hidden rounded-lg border border-line bg-panel">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previews[index]} alt={file.name} className="h-full w-full object-cover" />
            {index === 0 ? (
              <span className="absolute bottom-1 left-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">Cover</span>
            ) : (
              <button
                type="button"
                onClick={() => makeCover(index)}
                className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-fg shadow-sm hover:text-accent"
                aria-label={`Use ${file.name} as the cover photo`}
              >
                <Star className="h-3 w-3" />
                Cover
              </button>
            )}
            <button
              type="button"
              onClick={() => remove(index)}
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-fg shadow-sm hover:text-danger"
              aria-label={`Remove ${file.name}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {!full && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              'flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-center text-xs font-medium transition-colors',
              dragging ? 'border-accent bg-accent-soft text-accent' : error ? 'border-danger text-danger' : 'border-line-strong text-muted hover:border-accent hover:text-accent',
            )}
          >
            <ImagePlus className="h-5 w-5" />
            Add photo
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        multiple
        className="sr-only"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = ''; // allow re-selecting the same file after removing it
        }}
      />

      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : (
        <p className="text-xs text-subtle">JPEG, PNG or WebP, up to 5 MB each.</p>
      )}
    </div>
  );
}
