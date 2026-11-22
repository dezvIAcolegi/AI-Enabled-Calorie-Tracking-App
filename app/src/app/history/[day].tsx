import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';

import { Banner, Empty, Loading, MacroSummary } from '@/components/ui';
import { font, useTheme } from '@/components/theme';
import { mealsBetween, mealTotals, type MealRow } from '@/data/meals';
import { dayBounds } from '@/data/profile';
import { parseDayKey } from '@/features/history/days';
import { MealCard } from '@/features/history/MealCard';
import { editMeal } from '@/features/meal/editSaved';

export default function DayScreen() {
  const t = useTheme();
  const { day } = useLocalSearchParams<{ day: string }>();
  const date = parseDayKey(day ?? '');
  const [meals, setMeals] = useState<MealRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!date) return;
    const [from, to] = dayBounds(date);
    mealsBetween(from, to).then(setMeals, (e) =>
      setError(e instanceof Error ? e.message : 'Could not load this day.'),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  const title = date
    ? date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })
    : 'Day';
  if (!date) return <Empty title="Unknown day" />;
  if (error) return <Banner kind="error">{error}</Banner>;
  if (!meals) return <Loading label="Loading…" />;

  const total = meals.map(mealTotals).reduce(
    (a, m) => ({
      kcal: a.kcal + m.kcal,
      protein: a.protein + m.protein,
      carbs: a.carbs + m.carbs,
      fat: a.fat + m.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Stack.Screen options={{ title }} />
      {meals.length === 0 ? (
        <Empty title="Nothing logged this day" />
      ) : (
        <>
          <Text style={{ color: t.muted, fontSize: font.body }}>Day total</Text>
          <MacroSummary m={total} size="large" />
          {[...meals].reverse().map((m) => (
            <MealCard key={m.id} meal={m} onPress={() => editMeal(m)} />
          ))}
        </>
      )}
    </ScrollView>
  );
}
