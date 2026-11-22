// "12 of 30 AI scans left today" from scan_quota() (Kevin's proposal). Hidden when unknown.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { font, useTheme } from '@/components/theme';
import { hasSupabase } from '@/lib/env';
import { supabase } from '@/lib/supabase';

export type Quota = { allowed: boolean; used: number; limit: number };

export async function fetchQuota(): Promise<Quota | null> {
  if (!hasSupabase) return null;
  const { data, error } = await supabase.rpc('scan_quota');
  if (error || !data) return null; // function not deployed yet: just don't show it
  return data as Quota;
}

export function ScanQuota() {
  const t = useTheme();
  const [q, setQ] = useState<Quota | null>(null);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      fetchQuota().then((v) => live && setQ(v));
      return () => {
        live = false;
      };
    }, []),
  );
  if (!q) return null;
  const left = Math.max(0, q.limit - q.used);
  return (
    <Text style={{ color: left === 0 ? t.danger : t.muted, fontSize: font.body }}>
      {left === 0
        ? `You've used all ${q.limit} AI scans for today. Barcodes and search still work.`
        : `${left} of ${q.limit} AI scans left today.`}
    </Text>
  );
}
