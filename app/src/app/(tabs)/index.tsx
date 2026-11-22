// Today: meals of the day and totals against the profile's targets.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Empty, Loading, MacroSummary, ProgressBar } from '@/components/ui';
import { font, useTheme } from '@/components/theme';
import { deleteMeal, mealsBetween, mealTotals, type MealRow } from '@/data/meals';
import { dayBounds, getProfile, type Profile } from '@/data/profile';
import { fmtGrams } from '@/lib/format';
import { useAiMocks } from '@/lib/env';

const ORDER = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 } as const;

export default function TodayScreen() {
  const t = useTheme();
  const [meals, setMeals] = useState<MealRow[] | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const [from, to] = dayBounds(new Date());
    const [m, p] = await Promise.allSettled([mealsBetween(from, to), getProfile()]);
    if (m.status === 'fulfilled') setMeals(m.value);
    else setError(m.reason instanceof Error ? m.reason.message : 'Could not load today’s meals.');
    if (p.status === 'fulfilled') setProfile(p.value);
  }, []);
  useFocusEffect(useCallback(() => void load(), [load]));

  const remove = (m: MealRow) =>
    Alert.alert('Delete this meal?', m.meal_items.map((i) => i.name).join(', '), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMeal(m.id);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not delete it.');
          }
          void load();
        },
      },
    ]);

  if (!meals && !error) return <Loading label="Loading today…" />;
  const all = meals ?? [];
  const total = all.reduce(
    (s, m) => {
      const x = mealTotals(m);
      return {
        kcal: s.kcal + x.kcal,
        protein: s.protein + x.protein,
        carbs: s.carbs + x.carbs,
        fat: s.fat + x.fat,
      };
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
  const sorted = [...all].sort(
    (a, b) => ORDER[a.meal_type] - ORDER[b.meal_type] || a.eaten_at.localeCompare(b.eaten_at),
  );
  const left = profile?.kcal_target ? profile.kcal_target - total.kcal : null;

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
      {useAiMocks && (
        <Text style={{ color: t.muted, fontSize: font.small }}>
          Demo mode: AI answers are samples.
        </Text>
      )}
      {error && (
        <Banner kind="error" action={{ title: 'Retry', onPress: load }}>
          {error}
        </Banner>
      )}
      <View style={[styles.card, { backgroundColor: t.card }]}>
        <MacroSummary m={total} size="large" />
        {left !== null && (
          <Text style={{ color: left < 0 ? t.danger : t.muted, fontSize: font.body }}>
            {left >= 0
              ? `${Math.round(left)} kcal left today`
              : `${Math.round(-left)} kcal over your target`}
          </Text>
        )}
        <ProgressBar
          label="Calories"
          value={total.kcal}
          target={profile?.kcal_target ?? null}
          color={t.kcal}
        />
        <ProgressBar
          label="Protein (g)"
          value={total.protein}
          target={profile?.protein_target ?? null}
          color={t.protein}
        />
        <ProgressBar
          label="Carbs (g)"
          value={total.carbs}
          target={profile?.carbs_target ?? null}
          color={t.carbs}
        />
        <ProgressBar
          label="Fat (g)"
          value={total.fat}
          target={profile?.fat_target ?? null}
          color={t.fat}
        />
        {!profile?.kcal_target && (
          <Pressable onPress={() => router.push('/profile')} accessibilityRole="link">
            <Text style={{ color: t.primary, fontSize: font.body }}>Set your daily targets →</Text>
          </Pressable>
        )}
      </View>

      {sorted.length === 0 ? (
        <Empty
          title="Nothing logged yet today"
          body="Photograph your meal, describe it or scan a barcode."
          action={{ title: 'Log a meal', onPress: () => router.push('/scan') }}
        />
      ) : (
        sorted.map((m) => {
          const mt = mealTotals(m);
          return (
            <Pressable
              key={m.id}
              onLongPress={() => remove(m)}
              accessibilityHint="Long press to delete"
              style={[styles.card, { backgroundColor: t.card }]}
            >
              <View style={styles.mealHead}>
                <Text style={{ color: t.text, fontSize: font.large, fontWeight: '700' }}>
                  {m.meal_type[0]!.toUpperCase() + m.meal_type.slice(1)}
                </Text>
                <Text style={{ color: t.muted, fontSize: font.small }}>
                  {new Date(m.eaten_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
                <Text
                  style={{
                    color: t.kcal,
                    fontSize: font.large,
                    fontWeight: '700',
                    marginLeft: 'auto',
                  }}
                >
                  {Math.round(mt.kcal)} kcal
                </Text>
              </View>
              {m.meal_items.map((i) => (
                <View key={i.id} style={styles.item}>
                  <Text style={{ color: t.text, fontSize: font.body, flex: 1 }} numberOfLines={1}>
                    {i.name}
                  </Text>
                  <Text style={{ color: t.muted, fontSize: font.body }}>
                    {fmtGrams(i.grams)} g · {Math.round(i.kcal)} kcal
                  </Text>
                </View>
              ))}
            </Pressable>
          );
        })
      )}
      {sorted.length > 0 && (
        <Button title="Log another meal" kind="secondary" onPress={() => router.push('/scan')} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 12 },
  card: { borderRadius: 12, padding: 16, gap: 10 },
  mealHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  item: { flexDirection: 'row', gap: 8 },
});
