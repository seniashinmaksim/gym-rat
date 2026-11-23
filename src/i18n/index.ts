/** Language layer: see `core.ts`. This entry adds the React hook. */
import { useSyncExternalStore } from 'react';
import { getLang, onLangChange, type Lang } from './core';

export * from './core';

export function useLang(): Lang {
  return useSyncExternalStore(onLangChange, getLang, getLang);
}
