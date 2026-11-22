// Seven kcal bars, each split into protein / carbs / fat energy, with the target line.
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { font, useTheme } from '@/components/theme';

import { macroShares, type DayTotals } from './days';

const H = 160;

export function WeekChart({
  days,
  target,
  onDay,
}: {
  days: DayTotals[];
  target: number | null;
  onDay: (key: string) => void;
}) {
  const t = useTheme();
  const max = Math.max(target ?? 0, ...days.map((d) => d.totals.kcal), 1) * 1.1;
  const targetY = target ? (target / max) * H : null;
  return (
    <View>
      <View style={[styles.plot, { height: H, borderColor: t.border }]}>
        {targetY !== null && (
          <View
            style={[styles.target, { bottom: targetY, borderColor: t.muted }]}
            accessibilityElementsHidden
          >
            <Text
              style={{ color: t.muted, fontSize: 12, position: 'absolute', right: 0, top: -16 }}
            >
              target {Math.round(target!)}
            </Text>
          </View>
        )}
        {days.map((d) => {
          const h = (d.totals.kcal / max) * H;
          const s = macroShares(d.totals);
          const over = target !== null && d.totals.kcal > target;
          return (
            <Pressable
              key={d.key}
              onPress={() => onDay(d.key)}
              accessibilityRole="button"
              accessibilityLabel={`${d.date.toLocaleDateString([], { weekday: 'long' })}: ${Math.round(d.totals.kcal)} kilocalories${over ? ', over target' : ''}`}
              style={styles.col}
            >
              <View
                style={{
                  height: h,
                  width: '70%',
                  borderRadius: 4,
                  overflow: 'hidden',
                  justifyContent: 'flex-end',
                }}
              >
                <View style={{ flex: s.fat || 0, backgroundColor: t.fat }} />
                <View style={{ flex: s.carbs || 0, backgroundColor: t.carbs }} />
                <View style={{ flex: s.protein || 0, backgroundColor: t.protein }} />
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.labels}>
        {days.map((d) => (
          <Text key={d.key} style={{ flex: 1, textAlign: 'center', color: t.muted, fontSize: 12 }}>
            {d.date.toLocaleDateString([], { weekday: 'short' }).slice(0, 2)}
          </Text>
        ))}
      </View>
      <View style={styles.legend}>
        {[
          ['Protein', t.protein],
          ['Carbs', t.carbs],
          ['Fat', t.fat],
        ].map(([l, c]) => (
          <View key={l} style={styles.legendItem}>
            <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: c }} />
            <Text style={{ color: t.muted, fontSize: font.small }}>{l}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plot: { flexDirection: 'row', alignItems: 'flex-end', borderBottomWidth: 1 },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  target: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderStyle: 'dashed' },
  labels: { flexDirection: 'row', marginTop: 4 },
  legend: { flexDirection: 'row', gap: 16, marginTop: 8, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
