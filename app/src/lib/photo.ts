import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import type { PhotoFile } from '@/api';

/** Longest side after resizing. Keeps uploads small for Gemini's free tier. */
export const MAX_PHOTO_SIDE = 1024;

/** Downscale so the longest side is at most 1024 px, re-encoded as JPEG. */
export async function resizeForUpload(
  uri: string,
  width: number,
  height: number,
): Promise<PhotoFile> {
  const longest = Math.max(width, height);
  const resize =
    longest > MAX_PHOTO_SIDE
      ? width >= height
        ? { width: MAX_PHOTO_SIDE }
        : { height: MAX_PHOTO_SIDE }
      : undefined;
  const out = await manipulateAsync(uri, resize ? [{ resize }] : [], {
    compress: 0.8,
    format: SaveFormat.JPEG,
  });
  return { uri: out.uri, mimeType: 'image/jpeg', name: 'photo.jpg' };
}
