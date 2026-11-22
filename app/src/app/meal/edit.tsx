// The core screen: edit the AI's ingredient list with live totals, then save.
import { router, Stack } from 'expo-router';
import { useMemo, useReducer, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Chip, Empty, MacroSummary } from '@/components/ui';
import { font, useTheme } from '@/components/theme';
import { mealTypeFor, recordScan, saveMeal, uploadMealPhoto, type MealType } from '@/data/meals';
import { setDraft, useDraft } from '@/features/meal/draft';
import {
  editorReducer,
  initEditor,
  totals,
  warningText,
  type EditorState,
} from '@/features/meal/editor';
import { ItemRow } from '@/features/meal/components/ItemRow';
import { onFoodPicked } from '@/features/meal/pick';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const SCAN_KIND = { photo: 'meal_photo', text: 'meal_text', label: 'label' } as const;

export default function MealEditScreen() {
  const draft = useDraft();
  if (!draft) {
    return (
      <Empty
        title="Nothing to edit"
        body="Scan a meal or describe it first."
        action={{ title: 'Go to Scan', onPress: () => router.replace('/scan') }}
      />
    );
  }
  return <Editor key={draft.id} />;
}

function Editor() {
  const t = useTheme();
  const draft = useDraft()!;
  const [state, dispatch] = useReducer(editorReducer, undefined, (): EditorState =>
    initEditor(draft.result.items, draft.result.warnings),
  );
  const [mealType, setMealType] = useState<MealType>(
    () => draft.existing?.mealType ?? mealTypeFor(new Date()),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = useMemo(() => totals(state), [state]);

  const addFood = () => {
    onFoodPicked((candidate, grams) => dispatch({ type: 'add', candidate, grams }));
    router.push('/meal/search');
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const ex = draft.existing;
      const photoPath = draft.photoUri
        ? await uploadMealPhoto(draft.photoUri)
        : (ex?.photoPath ?? undefined);
      const mealId = await saveMeal({
        id: ex?.id,
        eatenAt: ex ? new Date(ex.eatenAt) : undefined,
        note: ex?.note ?? undefined,
        mealType,
        source: draft.source,
        photoPath,
        items: state.items,
      });
      const kind = SCAN_KIND[draft.source as keyof typeof SCAN_KIND];
      if (kind && draft.raw)
        void recordScan({ kind, raw: draft.raw, corrected: { items: state.items }, mealId });
      // Navigate before clearing the draft: clearing unmounts this screen, and an error
      // thrown after that would vanish with it.
      router.dismissTo('/');
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the meal.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <Stack.Screen options={{ title: draft.existing ? 'Edit meal' : 'Check your meal' }} />
      <FlatList
        data={state.items}
        keyExtractor={(i) => i.key}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 10 }}>
            {state.warnings.map((w) => (
              <Banner key={w}>{warningText(w)}</Banner>
            ))}
            <Text style={{ color: t.muted, fontSize: font.body }}>
              Change grams, switch a match or remove items. Totals update as you type.
            </Text>
          </View>
        }
        renderItem={({ item }) => <ItemRow item={item} dispatch={dispatch} />}
        ListEmptyComponent={
          <Text style={{ color: t.muted, fontSize: font.body, textAlign: 'center', padding: 24 }}>
            No items. Add one with search.
          </Text>
        }
        ListFooterComponent={<Button title="+ Add food" kind="secondary" onPress={addFood} />}
      />
      <View style={[styles.footer, { borderColor: t.border, backgroundColor: t.bg }]}>
        {error && (
          <Banner kind="error" action={{ title: 'Retry', onPress: save }}>
            {error}
          </Banner>
        )}
        <View style={styles.types}>
          {MEAL_TYPES.map((m) => (
            <Chip
              key={m}
              label={m[0]!.toUpperCase() + m.slice(1)}
              selected={m === mealType}
              onPress={() => setMealType(m)}
            />
          ))}
        </View>
        <View style={styles.saveRow}>
          <View style={{ flex: 1 }}>
            <MacroSummary m={total} />
          </View>
          <Button
            title={draft.existing ? 'Save changes' : 'Save meal'}
            onPress={save}
            loading={saving}
            disabled={state.items.length === 0}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 12 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, padding: 16, gap: 12 },
  types: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
