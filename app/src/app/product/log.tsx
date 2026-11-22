// Log an amount of one food (from a barcode, the library or a saved label), and/or keep it.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { macrosFor } from '@contracts/macros';
import { Banner, Button, Chip, Empty, MacroSummary } from '@/components/ui';
import { font, useTheme } from '@/components/theme';
import { addProduct, foodLabel, per100, toCandidate, touchProduct } from '@/data/foods';
import { mealTypeFor, saveMeal, type MealType } from '@/data/meals';
import type { MealSource } from '@/features/meal/draft';
import { parseGrams } from '@/features/meal/editor';
import { portionsFor } from '@/features/meal/portions';
import { getActiveFood } from '@/features/product/active';
import { fmtGrams } from '@/lib/format';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export default function LogProductScreen() {
  const t = useTheme();
  const p = useLocalSearchParams<{
    source?: string;
    library?: string;
    saved?: string;
    productId?: string;
  }>();
  const [food] = useState(getActiveFood);
  const source = (
    ['barcode', 'label', 'manual'].includes(p.source ?? '') ? p.source : 'manual'
  ) as MealSource;
  const [grams, setGrams] = useState(() => fmtGrams(food?.serving_grams ?? 100));
  const [mealType, setMealType] = useState<MealType>(() => mealTypeFor(new Date()));
  const [busy, setBusy] = useState<'log' | 'keep' | null>(null);
  const [inLibrary, setInLibrary] = useState(p.saved === '1' || !!p.productId);
  const [error, setError] = useState<string | null>(null);

  if (!food)
    return (
      <Empty title="Nothing to log" action={{ title: 'Back', onPress: () => router.back() }} />
    );

  const g = parseGrams(grams);
  const unit = food.basis === 'ml' ? 'ml' : 'g';
  const chips = [
    ...(food.serving_grams
      ? [{ label: food.serving_name ?? `1 serving`, grams: Number(food.serving_grams) }]
      : []),
    ...portionsFor(food.name).slice(1, 2),
    { label: `100 ${unit}`, grams: 100 },
  ];

  const keep = async () => {
    setBusy('keep');
    setError(null);
    try {
      await addProduct(food);
      setInLibrary(true);
      if (p.library === '1') router.dismissTo('/library');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add it.');
    } finally {
      setBusy(null);
    }
  };

  const log = async () => {
    if (g === null) return;
    setBusy('log');
    setError(null);
    try {
      const c = toCandidate(food);
      await saveMeal({
        mealType,
        source: p.source === 'label' || p.saved === '1' ? 'label' : source,
        items: [
          {
            name: foodLabel(food),
            food_id: food.id,
            grams: g,
            confidence: 1,
            per_100g: c.per_100g,
            candidates: [c],
          },
        ],
      });
      if (p.productId) void touchProduct(p.productId);
      router.dismissTo('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not log it.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: p.library === '1' ? 'Add to library' : 'Log food' }} />
      {p.saved === '1' && <Banner>Saved to your library.</Banner>}
      <Text style={{ color: t.text, fontSize: font.title, fontWeight: '700' }}>
        {foodLabel(food)}
      </Text>
      <Text style={{ color: t.muted, fontSize: font.body }}>
        {Math.round(per100(food).kcal)} kcal per 100 {unit}
      </Text>
      <View style={styles.row}>
        <TextInput
          value={grams}
          onChangeText={setGrams}
          keyboardType="decimal-pad"
          selectTextOnFocus
          accessibilityLabel={`Amount in ${unit}`}
          style={[
            styles.input,
            {
              color: t.text,
              borderColor: g === null ? t.danger : t.border,
              backgroundColor: t.card,
            },
          ]}
        />
        <Text style={{ color: t.muted, fontSize: font.large }}>{unit}</Text>
      </View>
      <View style={styles.chips}>
        {chips.map((c) => (
          <Chip
            key={c.label}
            label={c.label}
            selected={g === c.grams}
            onPress={() => setGrams(fmtGrams(c.grams))}
          />
        ))}
      </View>
      {g !== null && <MacroSummary m={macrosFor(per100(food), g)} size="large" />}
      <View style={styles.chips}>
        {MEAL_TYPES.map((m) => (
          <Chip
            key={m}
            label={m[0]!.toUpperCase() + m.slice(1)}
            selected={m === mealType}
            onPress={() => setMealType(m)}
          />
        ))}
      </View>
      {error && <Banner kind="error">{error}</Banner>}
      <Button
        title="Log it"
        onPress={log}
        loading={busy === 'log'}
        disabled={g === null || busy !== null}
      />
      {!inLibrary && (
        <Button
          title="Add to my library"
          kind="secondary"
          onPress={keep}
          loading={busy === 'keep'}
          disabled={busy !== null}
        />
      )}
      {inLibrary && p.saved !== '1' && (
        <Text style={{ color: t.ok, fontSize: font.body }}>In your library ✓</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: font.title,
    minWidth: 110,
    textAlign: 'center',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
