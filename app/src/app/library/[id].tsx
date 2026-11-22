// Edit a library product: nickname always; values only for the user's own (label/manual) foods.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Banner, Button, Loading } from '@/components/ui';
import { font, useTheme } from '@/components/theme';
import {
  deleteProduct,
  editableFood,
  listProducts,
  per100,
  renameProduct,
  updateFood,
  type Product,
} from '@/data/foods';
import { kcalCheck, NUTRIENTS } from '@/features/label/form';
import { parseGrams } from '@/features/meal/editor';

export default function EditProduct() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [p, setP] = useState<Product | null>(null);
  const [nickname, setNickname] = useState('');
  const [vals, setVals] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listProducts().then(
      (all) => {
        const found = all.find((x) => x.id === id) ?? null;
        setP(found);
        if (found) {
          setNickname(found.nickname ?? '');
          const m = per100(found.food);
          setVals(Object.fromEntries(NUTRIENTS.map((n) => [n, String(m[n])])));
        }
      },
      (e) => setError(String(e)),
    );
  }, [id]);

  if (!p) return error ? <Banner kind="error">{error}</Banner> : <Loading label="Loading…" />;
  const editable = editableFood(p.food);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (editable) {
        const m = Object.fromEntries(NUTRIENTS.map((n) => [n, Number(vals[n]?.replace(',', '.'))]));
        if (NUTRIENTS.some((n) => vals[n] !== '0' && parseGrams(vals[n] ?? '') === null))
          throw new Error('Enter every value as a number.');
        await updateFood(p.food_id, { per_100g: m as never, missing_fields: [] });
      }
      await renameProduct(p.id, nickname);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const check = editable
    ? kcalCheck(
        Object.fromEntries(
          NUTRIENTS.map((n) => [n, Number(vals[n]?.replace(',', '.')) || 0]),
        ) as never,
      )
    : null;

  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: 'Edit product' }} />
      <Text style={{ color: t.muted, fontSize: font.body }}>
        {p.food.name}
        {p.food.brand ? ` · ${p.food.brand}` : ''}
      </Text>
      <Text style={{ color: t.text, fontSize: font.body }}>Name in your library</Text>
      <TextInput
        value={nickname}
        onChangeText={setNickname}
        placeholder={p.food.name}
        placeholderTextColor={t.muted}
        style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.card }]}
      />
      {editable ? (
        NUTRIENTS.map((n) => (
          <View key={n} style={{ gap: 4 }}>
            <Text style={{ color: t.text, fontSize: font.body }}>
              {n === 'kcal' ? 'Energy (kcal)' : `${n[0]!.toUpperCase()}${n.slice(1)} (g)`} per 100 g
            </Text>
            <TextInput
              value={vals[n]}
              onChangeText={(v) => setVals((s) => ({ ...s, [n]: v }))}
              keyboardType="decimal-pad"
              style={[
                styles.input,
                { color: t.text, borderColor: t.border, backgroundColor: t.card },
              ]}
            />
          </View>
        ))
      ) : (
        <Text style={{ color: t.muted, fontSize: font.small }}>
          Values come from a shared database and can’t be edited here.
        </Text>
      )}
      {check && <Banner>{check}</Banner>}
      {error && <Banner kind="error">{error}</Banner>}
      <Button title="Save" onPress={save} loading={saving} />
      <Button
        title="Remove from library"
        kind="danger"
        onPress={async () => {
          await deleteProduct(p.id);
          router.back();
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: font.large,
  },
});
