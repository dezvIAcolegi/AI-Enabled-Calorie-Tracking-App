// Choose a product from the library (used by the recipe builder).
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';

import { Empty, Loading } from '@/components/ui';
import { font, useTheme } from '@/components/theme';
import { listProducts, matchesQuery, per100, productName, type Product } from '@/data/foods';
import { pickFoodRow } from '@/features/meal/pick';

export default function PickFromLibrary() {
  const t = useTheme();
  const [items, setItems] = useState<Product[] | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    listProducts().then(setItems, () => setItems([]));
  }, []);
  if (!items) return <Loading label="Loading your library…" />;
  const shown = items.filter((p) => matchesQuery(p, q));
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: 'From your library', presentation: 'modal' }} />
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search your products"
        placeholderTextColor={t.muted}
        style={{
          margin: 16,
          borderWidth: 1,
          borderColor: t.border,
          borderRadius: 10,
          padding: 12,
          fontSize: font.body,
          color: t.text,
          backgroundColor: t.card,
        }}
      />
      <FlatList
        data={shown}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, flexGrow: 1 }}
        ListEmptyComponent={
          <Empty title="No products" body="Scan a barcode or a label to fill your library." />
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              pickFoodRow(item.food);
              router.back();
            }}
            style={{ backgroundColor: t.card, borderRadius: 10, padding: 14 }}
          >
            <Text style={{ color: t.text, fontSize: font.body, fontWeight: '600' }}>
              {productName(item)}
            </Text>
            <Text style={{ color: t.muted, fontSize: font.small }}>
              {Math.round(per100(item.food).kcal)} kcal / 100 g
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}
