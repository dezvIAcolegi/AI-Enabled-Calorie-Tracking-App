// Build or edit a recipe from library products and searched foods.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Banner, Button, Loading, MacroSummary } from '@/components/ui';
import { font, useTheme } from '@/components/theme';
import { foodForCandidate, foodLabel, uuid, type FoodRow } from '@/data/foods';
import { getRecipe, perServing, recipeTotals, saveRecipe, validateRecipe } from '@/data/recipes';
import { parseGrams } from '@/features/meal/editor';
import { onFoodPicked, onFoodRowPicked } from '@/features/meal/pick';
import { fmtGrams } from '@/lib/format';

type Row = { key: string; food: FoodRow; grams: string };

export default function RecipeEdit() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [loading, setLoading] = useState(!!id);
  const [name, setName] = useState('');
  const [servings, setServings] = useState('1');
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    getRecipe(id).then((r) => {
      if (r) {
        setName(r.name);
        setServings(fmtGrams(r.servings));
        setNote(r.note ?? '');
        setRows(r.items.map((i) => ({ key: i.id, food: i.food, grams: fmtGrams(i.grams) })));
      }
      setLoading(false);
    });
  }, [id]);

  if (loading) return <Loading label="Loading recipe…" />;

  const addRow = (food: FoodRow, grams = 100) =>
    setRows((r) => [...r, { key: uuid(), food, grams: fmtGrams(grams) }]);
  const fromSearch = () => {
    onFoodPicked(async (c, g) => {
      try {
        addRow(await foodForCandidate(c), g);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not add that food.');
      }
    });
    router.push('/meal/search');
  };
  const fromLibrary = () => {
    onFoodRowPicked((f) => addRow(f, f.serving_grams ?? 100));
    router.push('/library/pick');
  };

  const items = rows.flatMap((r) => {
    const g = parseGrams(r.grams);
    return g === null ? [] : [{ food: r.food, grams: g }];
  });
  const s = Number(servings.replace(',', '.'));
  const preview = {
    items: items.map((i, n) => ({ id: String(n), ...i })),
    servings: s > 0 ? s : 1,
  };

  const save = async () => {
    const input = { id, name, servings: s, note, items };
    const err =
      rows.length !== items.length ? 'Each ingredient needs 0.1–5000 g.' : validateRecipe(input);
    if (err) {
      setError(err);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await saveRecipe(input);
      router.replace({ pathname: '/recipe/[id]', params: { id: saved } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the recipe.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: id ? 'Edit recipe' : 'New recipe' }} />
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Recipe name, e.g. Ciorbă de legume"
        placeholderTextColor={t.muted}
        accessibilityLabel="Recipe name"
        style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.card }]}
      />
      <View style={styles.row}>
        <Text style={{ color: t.text, fontSize: font.body, flex: 1 }}>Servings it makes</Text>
        <TextInput
          value={servings}
          onChangeText={setServings}
          keyboardType="decimal-pad"
          accessibilityLabel="Servings"
          style={[styles.small, { color: t.text, borderColor: t.border, backgroundColor: t.card }]}
        />
      </View>
      <Text style={{ color: t.text, fontSize: font.large, fontWeight: '700' }}>Ingredients</Text>
      {rows.map((r) => (
        <View key={r.key} style={[styles.row, styles.card, { backgroundColor: t.card }]}>
          <Text style={{ color: t.text, fontSize: font.body, flex: 1 }} numberOfLines={2}>
            {foodLabel(r.food)}
          </Text>
          <TextInput
            value={r.grams}
            onChangeText={(v) =>
              setRows((all) => all.map((x) => (x.key === r.key ? { ...x, grams: v } : x)))
            }
            keyboardType="decimal-pad"
            accessibilityLabel={`Grams of ${foodLabel(r.food)}`}
            style={[
              styles.small,
              {
                color: t.text,
                borderColor: parseGrams(r.grams) === null ? t.danger : t.border,
                backgroundColor: t.bg,
              },
            ]}
          />
          <Text style={{ color: t.muted }}>g</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${foodLabel(r.food)}`}
            hitSlop={8}
            onPress={() => setRows((all) => all.filter((x) => x.key !== r.key))}
          >
            <Text style={{ color: t.danger, fontSize: font.large }}>✕</Text>
          </Pressable>
        </View>
      ))}
      <View style={styles.row}>
        <Button title="+ From library" kind="secondary" style={{ flex: 1 }} onPress={fromLibrary} />
        <Button title="+ Search food" kind="secondary" style={{ flex: 1 }} onPress={fromSearch} />
      </View>
      {items.length > 0 && (
        <View style={[styles.card, { backgroundColor: t.card, gap: 6 }]}>
          <Text style={{ color: t.muted, fontSize: font.small }}>Whole recipe</Text>
          <MacroSummary m={recipeTotals(preview)} />
          <Text style={{ color: t.muted, fontSize: font.small }}>Per serving</Text>
          <MacroSummary m={perServing(preview)} />
        </View>
      )}
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Note (optional)"
        placeholderTextColor={t.muted}
        multiline
        maxLength={1000}
        style={[
          styles.input,
          { color: t.text, borderColor: t.border, backgroundColor: t.card, minHeight: 70 },
        ]}
      />
      {error && <Banner kind="error">{error}</Banner>}
      <Button title="Save recipe" onPress={save} loading={saving} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 12, paddingBottom: 40 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: font.large,
  },
  small: {
    borderWidth: 1,
    borderRadius: 8,
    minWidth: 70,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: font.body,
    textAlign: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  card: { borderRadius: 10, padding: 12 },
});
