import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { Banner, Button, Empty, Loading } from '@/components/ui';
import { font, useTheme } from '@/components/theme';
import { listRecipes, perServing, type Recipe } from '@/data/recipes';

export default function RecipesScreen() {
  const t = useTheme();
  const [items, setItems] = useState<Recipe[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await listRecipes());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load recipes.');
    }
  }, []);
  useFocusEffect(useCallback(() => void load(), [load]));

  if (!items && !error) return <Loading label="Loading recipes…" />;
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <FlatList
        data={items ?? []}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: 16, gap: 8, flexGrow: 1 }}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 4 }}>
            {error && (
              <Banner kind="error" action={{ title: 'Retry', onPress: load }}>
                {error}
              </Banner>
            )}
            <Button title="+ New recipe" onPress={() => router.push('/recipe/edit')} />
          </View>
        }
        ListEmptyComponent={
          <Empty
            title="No recipes yet"
            body="Build one from your library and foods, then log a portion in one tap."
          />
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: item.id } })}
            style={{ backgroundColor: t.card, borderRadius: 10, padding: 14, gap: 2 }}
          >
            <Text style={{ color: t.text, fontSize: font.large, fontWeight: '600' }}>
              {item.name}
            </Text>
            <Text style={{ color: t.muted, fontSize: font.small }}>
              {item.items.length} ingredient{item.items.length === 1 ? '' : 's'} · {item.servings}{' '}
              serving{item.servings === 1 ? '' : 's'} · {Math.round(perServing(item).kcal)} kcal per
              serving
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}
