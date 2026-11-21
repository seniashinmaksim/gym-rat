import { useRef, useState } from 'react';
import type { Photo } from '../../domain/types';
import { store } from '../../lib/store';
import { usePhotoUrl } from '../hooks';
import { IconCamera, IconTrash, IconX } from './icons';
import { cx, toast } from './ui';

/** Decrypts and shows one encrypted photo. */
export function PhotoThumb({ id, className, onClick, alt = 'Photo' }: { id: string; className?: string; onClick?: () => void; alt?: string }) {
  const url = usePhotoUrl(id);
  return (
    <button type="button" onClick={onClick} className={cx('relative overflow-hidden rounded-xl bg-ink-100 dark:bg-ink-800', className)}>
      {url ? <img src={url} alt={alt} className="h-full w-full object-cover" /> : <span className="absolute inset-0 animate-pulse bg-ink-200/60 dark:bg-ink-700/40" />}
    </button>
  );
}

/** Full-screen viewer for a decrypted photo. */
export function PhotoViewer({ id, onClose, caption }: { id: string | null; onClose: () => void; caption?: string }) {
  const url = usePhotoUrl(id);
  if (!id) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <button type="button" className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white" aria-label="Close" onClick={onClose}><IconX size={20} /></button>
      {url && <img src={url} alt={caption ?? 'Photo'} className="max-h-full max-w-full rounded-xl object-contain" />}
      {caption && <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">{caption}</div>}
    </div>
  );
}

/**
 * Grid of encrypted photos with optional upload/delete.
 * `onAdded` receives the stored Photo so the owner can link its id.
 */
export function PhotoGrid({
  photoIds, onAdd, onDelete, emptyLabel = 'No photos yet', size = 'md',
}: {
  photoIds: string[];
  onAdd?: (file: File) => Promise<Photo | void>;
  onDelete?: (id: string) => Promise<void>;
  emptyLabel?: string;
  size?: 'sm' | 'md';
}) {
  const input = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<string | null>(null);
  const dim = size === 'sm' ? 'h-16 w-16' : 'h-24 w-24';

  const pick = async (files: FileList | null) => {
    if (!files?.length || !onAdd) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) await onAdd(f);
      toast(files.length > 1 ? `${files.length} photos encrypted and saved` : 'Photo encrypted and saved');
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {photoIds.map((id) => (
          <div key={id} className="group relative">
            <PhotoThumb id={id} className={dim} onClick={() => setView(id)} />
            {onDelete && (
              <button type="button" aria-label="Delete photo"
                onClick={async () => {
                  if (!window.confirm('Delete this photo permanently?')) return;
                  await onDelete(id);
                }}
                className="absolute right-1 top-1 rounded-lg bg-black/60 p-1 text-white opacity-90 transition hover:bg-rose-600 sm:opacity-0 sm:group-hover:opacity-100">
                <IconTrash size={13} />
              </button>
            )}
          </div>
        ))}
        {onAdd && (
          <div className={cx(dim, 'flex flex-col gap-1')}>
            <button type="button" disabled={busy} onClick={() => input.current?.click()}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-ink-300 text-[11px] text-ink-500 transition hover:border-accent-500 hover:text-accent-600 disabled:opacity-50 dark:border-ink-700 dark:hover:text-accent-400">
              <IconCamera size={16} />
              {busy ? 'Encrypting…' : 'Camera'}
            </button>
            <button type="button" disabled={busy} onClick={() => gallery.current?.click()}
              className="flex h-8 items-center justify-center rounded-xl border border-dashed border-ink-300 text-[11px] text-ink-500 disabled:opacity-50 dark:border-ink-700">Gallery</button>
          </div>
        )}
        {!onAdd && photoIds.length === 0 && <span className="text-xs text-ink-500">{emptyLabel}</span>}
      </div>
      <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void pick(e.target.files); e.target.value = ''; }} />
      <input ref={gallery} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void pick(e.target.files); e.target.value = ''; }} />
      <PhotoViewer id={view} onClose={() => setView(null)} />
    </div>
  );
}

/** Deletes the photo bytes + metadata; caller unlinks the id from its owner. */
export async function deletePhotoEverywhere(id: string) {
  await store.deletePhoto(id);
}
