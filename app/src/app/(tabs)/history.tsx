// History: last 7 days as a macro chart, then the last 4 weeks day by day.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Banner, Loading, MacroSummary } from '@/components/ui';
import { font, useTheme } from '@/components/theme';
import { mealsBetween } from '@/data/meals';
import { dayBounds, getProfile } from '@/data/profile';
import { averageOfLogged, dailyTotals, type DayTotals } from '@/features/history/days';
import { WeekChart } from '@/features/history/WeekChart';

const DAYS = 28;

export default function HistoryScreen() {
  const t = useTheme();
  const [days, setDays] = useState<DayTotals[] | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const today = new Date();
    const [, end] = dayBounds(today);
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (DAYS - 1));
    try {
      const [meals, profile] = await Promise.all([
        mealsBetween(start, end),
        getProfile().catch(() => null),
      ]);
      setDays(dailyTotals(meals, today, DAYS));
      setTarget(profile?.kcal_target ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your history.');
    }
  }, []);
  useFocusEffect(useCallback(() => void load(), [load]));

  if (!days && !error) return <Loading label="Loading history…" />;
  const week = (days ?? []).slice(-7);
  const avg = averageOfLogged(week);
  const open = (key: string) => router.push({ pathname: '/history/[day]', params: { day: key } });

  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={styles.body}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      {error && (
        <Banner kind="error" action={{ title: 'Retry', onPress: load }}>
          {error}
        </Banner>
      )}
      <View style={[styles.card, { backgroundColor: t.card }]}>
        <Text style={{ color: t.text, fontSize: font.large, fontWeight: '700' }}>Last 7 days</Text>
        <WeekChart days={week} target={target} onDay={open} />
        {avg ? (
          <>
            <Text style={{ color: t.muted, fontSize: font.small }}>
              Daily average (days with meals)
            </Text>
            <MacroSummary m={avg} />
          </>
        ) : (
          <Text style={{ color: t.muted, fontSize: font.body }}>No meals this week yet.</Text>
        )}
      </View>
      <Text style={{ color: t.text, fontSize: font.large, fontWeight: '700' }}>Past days</Text>
      {[...(days ?? [])].reverse().map((d) => (
        <Pressable
          key={d.key}
          onPress={() => open(d.key)}
          accessibilityRole="button"
          style={[styles.row, { backgroundColor: t.card }]}
        >
          <Text style={{ color: t.text, fontSize: font.body, flex: 1 }}>
            {d.date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}
          </Text>
          <Text
            style={{
              color: d.meals ? (target && d.totals.kcal > target ? t.danger : t.text) : t.muted,
              fontSize: font.body,
            }}
          >
            {d.meals
              ? `${Math.round(d.totals.kcal)} kcal · ${d.meals} meal${d.meals === 1 ? '' : 's'}`
              : 'nothing logged'}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 10 },
  card: { borderRadius: 12, padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, padding: 14 },
});
