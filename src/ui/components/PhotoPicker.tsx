/**
 * Choose photos BEFORE saving a record: "Camera" opens the phone camera directly (capture), "Gallery"
 * opens the photo library / file chooser (fallback when capture is not supported — browsers without a
 * camera simply show the file chooser for both). Previews use local blob URLs only; nothing is stored
 * until the owning record is saved (then encrypted by the store).
 */
import { useEffect, useMemo, useRef } from 'react';
import { IconCamera, IconTrash } from './icons';
import { L } from '../../i18n';

export function PhotoPicker({ files, onChange, max = 4 }: { files: File[]; onChange: (f: File[]) => void; max?: number }) {
  const cam = useRef<HTMLInputElement>(null);
  const gal = useRef<HTMLInputElement>(null);
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  const add = (list: FileList | null) => {
    const picked = Array.from(list ?? []).filter((f) => f.type.startsWith('image/'));
    if (picked.length) onChange([...files, ...picked].slice(0, max));
  };
  const btn = 'flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-ink-200 text-sm font-medium text-ink-700 active:scale-95 dark:border-ink-700 dark:text-ink-200';
  return (
    <div>
      {files.length > 0 && (
        <div className="mb-2 grid grid-cols-4 gap-2">
          {urls.map((u, i) => (
            <div key={u} className="relative aspect-square overflow-hidden rounded-xl bg-ink-100 dark:bg-ink-800">
              <img src={u} alt={L(`Selected photo ${i + 1}`, `Выбранное фото ${i + 1}`)} className="h-full w-full object-cover" />
              <button type="button" aria-label={L('Remove photo', 'Убрать фото')} onClick={() => onChange(files.filter((_, j) => j !== i))}
                className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white"><IconTrash size={14} /></button>
            </div>
          ))}
        </div>
      )}
      {files.length < max && (
        <div className="flex gap-2">
          <button type="button" className={btn} onClick={() => cam.current?.click()}><IconCamera size={16} />{files.length ? L('Retake / add', 'Ещё снимок') : L('Camera', 'Камера')}</button>
          <button type="button" className={btn} onClick={() => gal.current?.click()}>{L('Gallery', 'Галерея')}</button>
        </div>
      )}
      <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" aria-hidden tabIndex={-1} onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      <input ref={gal} type="file" accept="image/*" multiple className="hidden" aria-hidden tabIndex={-1} onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
    </div>
  );
}
