// Food search (GET /foods/search), used to add an item to a meal, recipe or the library.
import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError, SEARCH_MAX, searchFoods, type Candidate } from '@/api';
import { Banner, Button, Chip } from '@/components/ui';
import { font, useTheme } from '@/components/theme';
import { parseGrams } from '@/features/meal/editor';
import { pickFood } from '@/features/meal/pick';
import { portionsFor } from '@/features/meal/portions';
import { fmtKcal, fmtMacro } from '@/lib/format';

export default function FoodSearchScreen() {
  const t = useTheme();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Candidate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Candidate | null>(null);
  const [grams, setGrams] = useState('100');
  const [retry, setRetry] = useState(0);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return;
    const timer = setTimeout(async () => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      setLoading(true);
      setError(null);
      try {
        const r = await searchFoods(query, ctrl.signal);
        if (!ctrl.signal.aborted) setResults(r);
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setError(e instanceof ApiError ? e.message : 'Search failed.');
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 300); // debounce: one request per pause in typing
    return () => clearTimeout(timer);
  }, [q, retry]);

  useEffect(() => () => abort.current?.abort(), []);

  const short = q.trim().length < 2;
  const shown = short ? null : results;
  const g = parseGrams(grams);
  const add = () => {
    if (!chosen || g === null) return;
    pickFood(chosen, g);
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: 'Add food', presentation: 'modal' }} />
      <View style={styles.top}>
        <TextInput
          value={q}
          onChangeText={(v) => {
            setQ(v);
            setChosen(null);
          }}
          placeholder="Search foods, e.g. rice, iaurt"
          placeholderTextColor={t.muted}
          autoFocus
          maxLength={SEARCH_MAX}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search foods"
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.card }]}
        />
        {error && !short && (
          <Banner kind="error" action={{ title: 'Retry', onPress: () => setRetry((n) => n + 1) }}>
            {error}
          </Banner>
        )}
      </View>
      <FlatList
        data={shown ?? []}
        keyExtractor={(c) => c.food_id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 16 }}
        ListEmptyComponent={
          <Text style={{ color: t.muted, fontSize: font.body, textAlign: 'center', padding: 24 }}>
            {short
              ? 'Type at least 2 letters.'
              : loading
                ? 'Searching…'
                : 'No foods found. Try another word.'}
          </Text>
        }
        renderItem={({ item }) => {
          const sel = chosen?.food_id === item.food_id;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: sel }}
              onPress={() => {
                setChosen(item);
                const p = portionsFor(item.name)[1];
                setGrams(String(p?.grams ?? 100));
              }}
              style={[
                styles.row,
                { backgroundColor: t.card, borderColor: sel ? t.primary : 'transparent' },
              ]}
            >
              <Text style={{ color: t.text, fontSize: font.body }}>{item.name}</Text>
              <Text style={{ color: t.muted, fontSize: font.small }}>
                per 100 g: {fmtKcal(item.per_100g.kcal)} kcal · P {fmtMacro(item.per_100g.protein)}{' '}
                · C {fmtMacro(item.per_100g.carbs)} · F {fmtMacro(item.per_100g.fat)}
              </Text>
            </Pressable>
          );
        }}
      />
      {chosen && (
        <View style={[styles.bottom, { borderColor: t.border }]}>
          <Text style={{ color: t.text, fontSize: font.body, fontWeight: '600' }} numberOfLines={1}>
            {chosen.name}
          </Text>
          <View style={styles.gramsRow}>
            <TextInput
              value={grams}
              onChangeText={setGrams}
              keyboardType="decimal-pad"
              selectTextOnFocus
              accessibilityLabel="Grams"
              style={[
                styles.grams,
                { color: t.text, borderColor: g === null ? t.danger : t.border },
              ]}
            />
            <Text style={{ color: t.muted, fontSize: font.body }}>g</Text>
            {portionsFor(chosen.name).map((p) => (
              <Chip key={p.label} label={p.label} onPress={() => setGrams(String(p.grams))} />
            ))}
          </View>
          <Button title="Add" onPress={add} disabled={g === null} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { padding: 16, gap: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: font.large,
  },
  row: { borderRadius: 10, padding: 12, gap: 4, borderWidth: 1.5 },
  bottom: { borderTopWidth: StyleSheet.hairlineWidth, padding: 16, gap: 10 },
  gramsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  grams: {
    borderWidth: 1,
    borderRadius: 8,
    minWidth: 72,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: font.large,
    textAlign: 'center',
  },
});
