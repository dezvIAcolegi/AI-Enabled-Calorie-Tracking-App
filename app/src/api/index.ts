// One typed function per AI service endpoint. Screens import from here only.

import { aiRequest, TIMEOUT_MS } from './client';
import { env, useAiMocks } from '@/lib/env';
import { mocks } from './mocks';
import type { FoodsSearchResponse, LabelResult, MealResponse } from './types';

export { ApiError, type ApiErrorKind } from './client';
export * from './types';

/** A local photo ready to upload. Resize it first (see lib/photo.ts). */
export type PhotoFile = { uri: string; mimeType?: string; name?: string };

function photoForm(photo: PhotoFile): FormData {
  const form = new FormData();
  // React Native's FormData accepts this { uri, name, type } shape for files.
  form.append('image', {
    uri: photo.uri,
    name: photo.name ?? 'photo.jpg',
    type: photo.mimeType ?? 'image/jpeg',
  } as unknown as Blob);
  return form;
}

/** POST /meal/photo */
export function mealFromPhoto(photo: PhotoFile, signal?: AbortSignal): Promise<MealResponse> {
  if (useAiMocks) return mocks.mealPhoto();
  return aiRequest<MealResponse>({
    method: 'POST',
    path: '/meal/photo',
    body: photoForm(photo),
    timeoutMs: TIMEOUT_MS.photo,
    signal,
  });
}

/** POST /meal/text — e.g. "two eggs and a slice of toast" (1–500 chars). */
export function mealFromText(text: string, signal?: AbortSignal): Promise<MealResponse> {
  if (useAiMocks) return mocks.mealText();
  return aiRequest<MealResponse>({
    method: 'POST',
    path: '/meal/text',
    body: { text },
    timeoutMs: TIMEOUT_MS.text,
    signal,
  });
}

/** POST /label/read */
export function readLabel(photo: PhotoFile, signal?: AbortSignal): Promise<LabelResult> {
  if (useAiMocks) return mocks.labelRead();
  return aiRequest<LabelResult>({
    method: 'POST',
    path: '/label/read',
    body: photoForm(photo),
    timeoutMs: TIMEOUT_MS.photo,
    signal,
  });
}

/** GET /foods/search?q= */
export function searchFoods(q: string, signal?: AbortSignal): Promise<FoodsSearchResponse> {
  if (useAiMocks) return mocks.foodsSearch(q);
  return aiRequest<FoodsSearchResponse>({
    method: 'GET',
    path: '/foods/search',
    query: { q },
    timeoutMs: TIMEOUT_MS.search,
    signal,
  });
}

/** Search box limit from the spec (q: 1–100 chars). */
export const SEARCH_MAX = 100;

let lastWarm = 0;
/**
 * Fire-and-forget GET /health so a sleeping free-tier host is awake by the time the user
 * has taken a photo. No auth needed; at most once every 5 minutes; errors are ignored.
 */
export function warmUp(): void {
  if (useAiMocks || Date.now() - lastWarm < 5 * 60_000) return;
  lastWarm = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS.health);
  fetch(`${env.aiUrl}/health`, { signal: ctrl.signal })
    .catch(() => {})
    .finally(() => clearTimeout(timer));
}
