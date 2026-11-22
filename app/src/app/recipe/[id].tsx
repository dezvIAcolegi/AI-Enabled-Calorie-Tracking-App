// A recipe: ingredients, totals, and "log a portion".
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Banner, Button, Chip, Empty, Loading, MacroSummary } from '@/components/ui';
import { font, useTheme } from '@/components/theme';
import { foodLabel } from '@/data/foods';
import { mealTypeFor, saveMeal, type MealType } from '@/data/meals';
import { deleteRecipe, getRecipe, itemsForPortion, perServing, type Recipe } from '@/data/recipes';
import { sumMacros } from '@contracts/macros';
import { fmtGrams } from '@/lib/format';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export default function RecipeScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined);
  const [portions, setPortions] = useState('1');
  const [mealType, setMealType] = useState<MealType>(() => mealTypeFor(new Date()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRecipe(id).then(setRecipe, () => setRecipe(null));
  }, [id]);

  if (recipe === undefined) return <Loading label="Loading recipe…" />;
  if (recipe === null)
    return (
      <Empty title="Recipe not found" action={{ title: 'Back', onPress: () => router.back() }} />
    );

  const p = Number(portions.replace(',', '.'));
  const valid = p > 0 && p <= 50;
  const items = valid ? itemsForPortion(recipe, p) : [];

  const log = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveMeal({
        mealType,
        source: 'recipe',
        note: `${fmtGrams(p)} × ${recipe.name}`,
        items,
      });
      router.dismissTo('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not log it.');
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    Alert.alert('Delete recipe?', recipe.name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteRecipe(recipe.id);
          router.back();
        },
      },
    ]);

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.body}>
      <Stack.Screen options={{ title: recipe.name }} />
      <Text style={{ color: t.muted, fontSize: font.body }}>
        Makes {fmtGrams(recipe.servings)} serving{recipe.servings === 1 ? '' : 's'}. Per serving:
      </Text>
      <MacroSummary m={perServing(recipe)} size="large" />
      <View style={[styles.card, { backgroundColor: t.card }]}>
        {recipe.items.map((i) => (
          <View key={i.id} style={styles.row}>
            <Text style={{ color: t.text, fontSize: font.body, flex: 1 }} numberOfLines={1}>
              {foodLabel(i.food)}
            </Text>
            <Text style={{ color: t.muted, fontSize: font.body }}>{fmtGrams(i.grams)} g</Text>
          </View>
        ))}
        {recipe.note && <Text style={{ color: t.muted, fontSize: font.small }}>{recipe.note}</Text>}
      </View>

      <Text style={{ color: t.text, fontSize: font.large, fontWeight: '700' }}>Log a portion</Text>
      <View style={styles.row}>
        {['0.5', '1', '1.5', '2'].map((v) => (
          <Chip
            key={v}
            label={`${v} serving${v === '1' ? '' : 's'}`}
            selected={portions === v}
            onPress={() => setPortions(v)}
          />
        ))}
      </View>
      <View style={styles.row}>
        <Text style={{ color: t.text, fontSize: font.body }}>Servings</Text>
        <TextInput
          value={portions}
          onChangeText={setPortions}
          keyboardType="decimal-pad"
          accessibilityLabel="Servings to log"
          style={[
            styles.small,
            { color: t.text, borderColor: valid ? t.border : t.danger, backgroundColor: t.card },
          ]}
        />
      </View>
      {valid && <MacroSummary m={sumMacros(items)} />}
      <View style={styles.row}>
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
      <Button title="Log it" onPress={log} loading={busy} disabled={!valid || items.length === 0} />
      <Button
        title="Edit recipe"
        kind="secondary"
        onPress={() => router.push({ pathname: '/recipe/edit', params: { id: recipe.id } })}
      />
      <Button title="Delete recipe" kind="danger" onPress={remove} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 12, paddingBottom: 40 },
  card: { borderRadius: 12, padding: 14, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  small: {
    borderWidth: 1,
    borderRadius: 8,
    minWidth: 70,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: font.large,
    textAlign: 'center',
  },
});
