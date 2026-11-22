// Review what POST /label/read found, fix flagged fields, save as a product.
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Banner, Button, Empty } from '@/components/ui';
import { font, useTheme } from '@/components/theme';
import { addProduct, createFood } from '@/data/foods';
import { recordScan } from '@/data/meals';
import { setLabelDraft, useLabelDraft } from '@/features/label/draft';
import {
  ALL_FIELDS,
  fieldLabel,
  formFromLabel,
  setField,
  validate,
  type FieldName,
  type LabelForm,
} from '@/features/label/form';
import { setActiveFood } from '@/features/product/active';

export default function LabelReviewScreen() {
  const draft = useLabelDraft();
  if (!draft) {
    return (
      <Empty
        title="No label to review"
        action={{
          title: 'Photograph a label',
          onPress: () => router.replace('/capture?mode=label'),
        }}
      />
    );
  }
  return <Review />;
}

function Review() {
  const t = useTheme();
  const draft = useLabelDraft()!;
  const [form, setForm] = useState<LabelForm>(() => formFromLabel(draft.result));
  const [errors, setErrors] = useState<Partial<Record<FieldName | 'name', string>>>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const flaggedCount = form.flagged.size;

  const save = async () => {
    const v = validate(form);
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    setErrors({});
    // The 4/4/9 check doesn't block saving, but the user has to see it once.
    if (v.warnings.length && !confirmed) {
      setWarnings(v.warnings);
      setConfirmed(true);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const food = await createFood({
        origin: 'label',
        name: form.name,
        brand: form.brand,
        barcode: draft.barcode,
        per_100g: v.per_100g,
        serving_grams: v.serving_grams,
        serving_name: v.serving_grams ? `${v.serving_grams} g` : undefined,
      });
      await addProduct(food);
      void recordScan({
        kind: 'label',
        raw: draft.result,
        corrected: { per_100g: v.per_100g, serving_grams: v.serving_grams },
      });
      setActiveFood(food);
      router.replace('/product/log?saved=1');
      setLabelDraft(null); // after navigating: clearing unmounts this screen
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save the product.');
    } finally {
      setSaving(false);
    }
  };

  const input = (field: FieldName) => {
    const flagged = form.flagged.has(field);
    const err = errors[field];
    return (
      <View key={field} style={styles.field}>
        <Text
          style={{
            color: flagged ? t.warnText : t.text,
            fontSize: font.body,
            fontWeight: flagged ? '700' : '400',
          }}
        >
          {fieldLabel[field]}
          {flagged ? '  ⚠ check this' : ''}
        </Text>
        <TextInput
          value={form.values[field]}
          onChangeText={(v) => {
            setForm((f) => setField(f, field, v));
            setConfirmed(false);
            setWarnings([]);
          }}
          keyboardType="decimal-pad"
          placeholder={flagged ? 'Couldn’t read: type it from the label' : ''}
          placeholderTextColor={t.muted}
          accessibilityLabel={`${fieldLabel[field]}${flagged ? ', could not be read, please check' : ''}`}
          style={[
            styles.input,
            {
              color: t.text,
              backgroundColor: flagged ? t.warnBg : t.card,
              borderColor: err ? t.danger : flagged ? t.kcal : t.border,
            },
          ]}
        />
        {err && <Text style={{ color: t.danger, fontSize: font.small }}>{err}</Text>}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <Stack.Screen options={{ title: 'Check the label' }} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {flaggedCount > 0 ? (
          <Banner>
            {flaggedCount === 1 ? '1 value' : `${flaggedCount} values`} couldn’t be read or didn’t
            add up. Check the highlighted fields against the label.
          </Banner>
        ) : (
          <Text style={{ color: t.muted, fontSize: font.body }}>
            Compare with the label, then name the product.
          </Text>
        )}
        <View style={styles.field}>
          <Text style={{ color: t.text, fontSize: font.body }}>Product name</Text>
          <TextInput
            value={form.name}
            onChangeText={(name) => setForm((f) => ({ ...f, name }))}
            placeholder="e.g. Fulgi de ovăz"
            placeholderTextColor={t.muted}
            style={[
              styles.input,
              {
                color: t.text,
                backgroundColor: t.card,
                borderColor: errors.name ? t.danger : t.border,
              },
            ]}
          />
          {errors.name && (
            <Text style={{ color: t.danger, fontSize: font.small }}>{errors.name}</Text>
          )}
        </View>
        <View style={styles.field}>
          <Text style={{ color: t.text, fontSize: font.body }}>Brand (optional)</Text>
          <TextInput
            value={form.brand}
            onChangeText={(brand) => setForm((f) => ({ ...f, brand }))}
            style={[
              styles.input,
              { color: t.text, backgroundColor: t.card, borderColor: t.border },
            ]}
          />
        </View>
        <Text style={{ color: t.text, fontSize: font.large, fontWeight: '600', marginTop: 8 }}>
          Per 100 g
        </Text>
        {ALL_FIELDS.filter((f) => f !== 'serving_grams').map(input)}
        {input('serving_grams')}
        {draft.barcode && (
          <Text style={{ color: t.muted, fontSize: font.small }}>
            Barcode {draft.barcode} will be saved with it.
          </Text>
        )}
        {warnings.map((w) => (
          <Banner key={w}>{w} Tap Save again to keep them.</Banner>
        ))}
        {saveError && (
          <Banner kind="error" action={{ title: 'Retry', onPress: save }}>
            {saveError}
          </Banner>
        )}
        <Button
          title={warnings.length ? 'Save anyway' : 'Save product'}
          onPress={save}
          loading={saving}
        />
        <Button
          title="Retake photo"
          kind="secondary"
          onPress={() =>
            router.replace({
              pathname: '/capture',
              params: { mode: 'label', barcode: draft.barcode },
            })
          }
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 12, paddingBottom: 40 },
  field: { gap: 4 },
  input: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: font.large,
  },
});
