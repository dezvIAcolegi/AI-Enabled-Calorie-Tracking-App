import { Pressable, StyleSheet, Text, View } from 'react-native';

import { font, useTheme } from '@/components/theme';
import { mealTotals, type MealRow } from '@/data/meals';
import { fmtGrams } from '@/lib/format';

export function MealCard({ meal, onLongPress }: { meal: MealRow; onLongPress?: () => void }) {
  const t = useTheme();
  const mt = mealTotals(meal);
  return (
    <Pressable
      onLongPress={onLongPress}
      disabled={!onLongPress}
      accessibilityHint={onLongPress ? 'Long press to delete' : undefined}
      style={[styles.card, { backgroundColor: t.card }]}
    >
      <View style={styles.head}>
        <Text style={{ color: t.text, fontSize: font.large, fontWeight: '700' }}>
          {meal.meal_type[0]!.toUpperCase() + meal.meal_type.slice(1)}
        </Text>
        <Text style={{ color: t.muted, fontSize: font.small }}>
          {new Date(meal.eaten_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
        <Text
          style={{ color: t.kcal, fontSize: font.large, fontWeight: '700', marginLeft: 'auto' }}
        >
          {Math.round(mt.kcal)} kcal
        </Text>
      </View>
      {meal.note && <Text style={{ color: t.muted, fontSize: font.small }}>{meal.note}</Text>}
      {meal.meal_items.map((i) => (
        <View key={i.id} style={styles.item}>
          <Text style={{ color: t.text, fontSize: font.body, flex: 1 }} numberOfLines={1}>
            {i.name}
          </Text>
          <Text style={{ color: t.muted, fontSize: font.body }}>
            {fmtGrams(i.grams)} g · {Math.round(i.kcal)} kcal
          </Text>
        </View>
      ))}
      <Text style={{ color: t.muted, fontSize: font.small }}>
        P {fmtGrams(mt.protein)} g · C {fmtGrams(mt.carbs)} g · F {fmtGrams(mt.fat)} g
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 16, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  item: { flexDirection: 'row', gap: 8 },
});
