// profiles row: daily targets, timezone, scan consent. Local copy in mock mode.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { hasSupabase } from '@/lib/env';
import type { TablesUpdate } from '@contracts/database';
import { supabase } from '@/lib/supabase';

export type Profile = {
  display_name: string | null;
  kcal_target: number | null;
  protein_target: number | null;
  carbs_target: number | null;
  fat_target: number | null;
  timezone: string;
  scan_consent: boolean;
};

const COLUMNS =
  'display_name,kcal_target,protein_target,carbs_target,fat_target,timezone,scan_consent';
const KEY = 'mock-profile-v1';

export const DEFAULT_PROFILE: Profile = {
  display_name: null,
  kcal_target: null,
  protein_target: null,
  carbs_target: null,
  fat_target: null,
  timezone: 'Europe/Bucharest',
  scan_consent: false,
};

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function getProfile(): Promise<Profile> {
  if (!hasSupabase) {
    try {
      return { ...DEFAULT_PROFILE, ...JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}') };
    } catch {
      return DEFAULT_PROFILE;
    }
  }
  const { data, error } = await supabase.from('profiles').select(COLUMNS).single();
  if (error) throw new Error(error.message);
  return {
    ...(data as unknown as Profile),
    kcal_target: num(data.kcal_target),
    protein_target: num(data.protein_target),
    carbs_target: num(data.carbs_target),
    fat_target: num(data.fat_target),
  };
}

/**
 * Turn consent off AND delete every kept scan, in one call (backend #36). Returns how many
 * scans were deleted. Turning consent on still goes through updateProfile.
 */
export async function withdrawScanConsent(): Promise<number> {
  if (!hasSupabase) {
    await updateProfile({ scan_consent: false });
    return 0;
  }
  const { data, error } = await supabase.rpc('withdraw_scan_consent');
  if (error) throw new Error(error.message);
  return data ?? 0;
}

export async function updateProfile(patch: Partial<Profile>): Promise<void> {
  const row: TablesUpdate<'profiles'> = { ...patch };
  // scan_consent_at records when consent was given (privacy: evaluation data only with consent).
  if (patch.scan_consent !== undefined)
    row.scan_consent_at = patch.scan_consent ? new Date().toISOString() : null;
  if (!hasSupabase) {
    const cur = await getProfile();
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...cur, ...patch }));
    return;
  }
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Please sign in again.');
  const { error } = await supabase.from('profiles').update(row).eq('id', u.user.id);
  if (error) throw new Error(error.message);
}

/** Bounds from the profiles table checks. */
export const TARGET_LIMITS = {
  kcal_target: [800, 10000],
  protein_target: [0, 1000],
  carbs_target: [0, 2000],
  fat_target: [0, 1000],
} as const;

export type TargetKey = keyof typeof TARGET_LIMITS;

/** Suggested split of a kcal target: 25 % protein, 50 % carbs, 25 % fat. */
export function suggestMacros(kcal: number) {
  return {
    protein_target: Math.round((kcal * 0.25) / 4),
    carbs_target: Math.round((kcal * 0.5) / 4),
    fat_target: Math.round((kcal * 0.25) / 9),
  };
}

/** Start and end of the user's local day containing `d`. */
export function dayBounds(d: Date): [Date, Date] {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return [start, end];
}
