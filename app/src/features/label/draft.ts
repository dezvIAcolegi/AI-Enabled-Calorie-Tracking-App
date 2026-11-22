// The label result being reviewed, plus where it came from (a barcode that wasn't found).
import { useSyncExternalStore } from 'react';

import type { LabelResult } from '@/api';

export type LabelDraft = { result: LabelResult; barcode?: string };

let draft: LabelDraft | null = null;
const listeners = new Set<() => void>();

export function setLabelDraft(next: LabelDraft | null) {
  draft = next;
  listeners.forEach((l) => l());
}

export function useLabelDraft(): LabelDraft | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => draft,
  );
}
