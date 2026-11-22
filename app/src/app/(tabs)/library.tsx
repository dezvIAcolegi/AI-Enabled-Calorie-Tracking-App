import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Banner, Button, Empty, Loading } from '@/components/ui';
import { font, useTheme } from '@/components/theme';
import {
  deleteProduct,
  listProducts,
  matchesQuery,
  per100,
  productName,
  type Product,
} from '@/data/foods';
import { setActiveFood } from '@/features/product/active';

export default function LibraryScreen() {
  const t = useTheme();
  const [items, setItems] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await listProducts());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your library.');
    }
  }, []);
  useFocusEffect(useCallback(() => void load(), [load]));

  const remove = (p: Product) =>
    Alert.alert('Remove from library?', productName(p), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setItems((all) => all?.filter((x) => x.id !== p.id) ?? null);
          try {
            await deleteProduct(p.id);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not remove it.');
            void load();
          }
        },
      },
    ]);

  if (!items && !error) return <Loading label="Loading your library…" />;
  const shown = (items ?? []).filter((p) => matchesQuery(p, q));

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={styles.top}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search your products"
          placeholderTextColor={t.muted}
          accessibilityLabel="Search your products"
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.card }]}
        />
        <View style={styles.actions}>
          <Button
            title="Scan barcode"
            kind="secondary"
            style={{ flex: 1 }}
            onPress={() => router.push('/capture?mode=barcode')}
          />
          <Button
            title="Add food"
            kind="secondary"
            style={{ flex: 1 }}
            onPress={() => router.push('/library/add')}
          />
        </View>
        {error && (
          <Banner kind="error" action={{ title: 'Retry', onPress: load }}>
            {error}
          </Banner>
        )}
      </View>
      <FlatList
        data={shown}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 8, flexGrow: 1 }}
        ListEmptyComponent={
          items?.length ? (
            <Text style={{ color: t.muted, fontSize: font.body, textAlign: 'center', padding: 24 }}>
              Nothing matches “{q}”.
            </Text>
          ) : (
            <Empty
              title="Your library is empty"
              body="Scan a barcode or photograph a label to keep products you eat often."
            />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Log an amount"
            onPress={() => {
              setActiveFood(item.food);
              router.push({
                pathname: '/product/log',
                params: { productId: item.id, source: 'manual' },
              });
            }}
            onLongPress={() => router.push({ pathname: '/library/[id]', params: { id: item.id } })}
            style={[styles.row, { backgroundColor: t.card }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontSize: font.body, fontWeight: '600' }}>
                {productName(item)}
              </Text>
              <Text style={{ color: t.muted, fontSize: font.small }}>
                {Math.round(per100(item.food).kcal)} kcal / 100 {item.food.basis}
                {item.food.origin === 'label'
                  ? ' · from label'
                  : item.food.origin === 'off'
                    ? ' · Open Food Facts'
                    : ''}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Edit ${productName(item)}`}
              hitSlop={8}
              onPress={() => router.push({ pathname: '/library/[id]', params: { id: item.id } })}
            >
              <Text style={{ color: t.primary, fontSize: font.body }}>Edit</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${productName(item)}`}
              hitSlop={8}
              onPress={() => remove(item)}
            >
              <Text style={{ color: t.danger, fontSize: font.large }}>✕</Text>
            </Pressable>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { padding: 16, gap: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: font.body,
  },
  actions: { flexDirection: 'row', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 10, padding: 14 },
});
