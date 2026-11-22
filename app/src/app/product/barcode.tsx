// barcode-lookup result. ?code=… from the scanner; without it the user types the barcode.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Banner, Button, Loading, MacroSummary } from '@/components/ui';
import { font, useTheme } from '@/components/theme';
import { foodLabel, lookupBarcode, offerLabel, per100, type BarcodeResult } from '@/data/foods';
import { setActiveFood } from '@/features/product/active';

export default function BarcodeScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(params.code ?? '');
  const [result, setResult] = useState<BarcodeResult | null>(null);
  const [loading, setLoading] = useState(!!params.code);

  const lookup = useCallback(async (c: string) => {
    setLoading(true);
    setResult(null);
    setResult(await lookupBarcode(c.trim()));
    setLoading(false);
  }, []);

  // Scanned code: look it up once on arrival (state set only after the await).
  useEffect(() => {
    if (!params.code) return;
    let live = true;
    lookupBarcode(params.code.trim()).then((r) => {
      if (!live) return;
      setResult(r);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [params.code]);

  const food = result?.ok ? result.food : null;

  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: 'Barcode' }} />
      {!params.code && (
        <View style={{ gap: 8 }}>
          <TextInput
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={14}
            placeholder="8–14 digits under the barcode"
            placeholderTextColor={t.muted}
            accessibilityLabel="Barcode number"
            style={[
              styles.input,
              { color: t.text, borderColor: t.border, backgroundColor: t.card },
            ]}
          />
          <Button
            title="Look up"
            onPress={() => lookup(code)}
            disabled={!/^\d{8,14}$/.test(code.trim())}
          />
        </View>
      )}
      {loading && <Loading label="Looking it up…" />}
      {result && !result.ok && (
        <View style={{ gap: 12 }}>
          <Banner kind={offerLabel(result.error) ? 'warn' : 'error'}>{result.message}</Banner>
          {offerLabel(result.error) && (
            <Button
              title="Photograph the nutrition label"
              onPress={() =>
                router.replace({
                  pathname: '/capture',
                  params: { mode: 'label', barcode: code.trim() },
                })
              }
            />
          )}
          {(result.error === 'off_unavailable' ||
            result.error === 'network' ||
            result.error === 'db_error') && (
            <Button title="Try again" onPress={() => lookup(code)} />
          )}
          <Button
            title="Search foods instead"
            kind="secondary"
            onPress={() => router.replace('/library/add')}
          />
        </View>
      )}
      {food && (
        <View style={[styles.card, { backgroundColor: t.card }]}>
          <Text style={{ color: t.text, fontSize: font.title, fontWeight: '700' }}>
            {foodLabel(food)}
          </Text>
          <Text style={{ color: t.muted, fontSize: font.body }}>Per 100 {food.basis}</Text>
          <MacroSummary m={per100(food)} />
          {food.serving_name && (
            <Text style={{ color: t.muted, fontSize: font.body }}>
              Serving: {food.serving_name}
            </Text>
          )}
          {food.missing_fields.length > 0 && (
            <Banner>Not on file: {food.missing_fields.join(', ')} (shown as 0).</Banner>
          )}
          {food.kcal_estimated && (
            <Text style={{ color: t.muted, fontSize: font.small }}>
              Calories estimated from protein, carbs and fat.
            </Text>
          )}
          <Button
            title="Log it"
            onPress={() => {
              setActiveFood(food);
              router.push('/product/log?source=barcode');
            }}
          />
          <Button
            title="Add to my library"
            kind="secondary"
            onPress={() => {
              setActiveFood(food);
              router.push('/product/log?source=barcode&library=1');
            }}
          />
          <Text style={{ color: t.muted, fontSize: font.small }}>
            Data from Open Food Facts (ODbL).
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: font.large,
    letterSpacing: 2,
  },
  card: { borderRadius: 12, padding: 16, gap: 10 },
});
