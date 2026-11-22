import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Chip } from '@/components/ui';
import { font, useTheme } from '@/components/theme';
import { fmtGrams, fmtKcal, fmtMacro } from '@/lib/format';

import {
  itemMacros,
  LOW_CONFIDENCE,
  parseGrams,
  type EditorAction,
  type EditorItem,
} from '../editor';
import { portionsFor } from '../portions';

type Props = { item: EditorItem; dispatch: (a: EditorAction) => void };

export function ItemRow({ item, dispatch }: Props) {
  const t = useTheme();
  const [text, setText] = useState(fmtGrams(item.grams));
  const [showMatches, setShowMatches] = useState(false);
  const invalid = parseGrams(text) === null;
  const m = itemMacros(item);
  const portions = portionsFor(item.name, item.candidates[0]?.name ?? '');
  const low = !item.manual && item.confidence < LOW_CONFIDENCE;

  // Keep the box in sync when grams change from a portion chip or a step button
  // (state adjusted during render, as React recommends, not in an effect).
  const [seenGrams, setSeenGrams] = useState(item.grams);
  if (seenGrams !== item.grams) {
    setSeenGrams(item.grams);
    if (parseGrams(text) !== item.grams) setText(fmtGrams(item.grams));
  }

  const onChange = (v: string) => {
    setText(v);
    const g = parseGrams(v);
    if (g !== null) dispatch({ type: 'setGrams', key: item.key, grams: g }); // live totals
  };
  const step = (d: number) =>
    dispatch({ type: 'setGrams', key: item.key, grams: Math.max(1, item.grams + d) });

  return (
    <View
      style={[styles.card, { backgroundColor: t.card, borderColor: low ? t.kcal : 'transparent' }]}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontSize: font.large, fontWeight: '600' }}>
            {item.name}
          </Text>
          <Text style={{ color: t.muted, fontSize: font.small }} numberOfLines={1}>
            {item.candidates[0]?.name}
          </Text>
        </View>
        <ConfidenceBadge confidence={item.confidence} manual={item.manual} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${item.name}`}
          onPress={() => dispatch({ type: 'remove', key: item.key })}
          hitSlop={10}
          style={styles.remove}
        >
          <Text style={{ color: t.danger, fontSize: font.large }}>✕</Text>
        </Pressable>
      </View>

      <View style={styles.gramsRow}>
        <StepButton label="−10" onPress={() => step(-10)} a11y={`10 grams less ${item.name}`} />
        <TextInput
          value={text}
          onChangeText={onChange}
          onBlur={() => setText(fmtGrams(item.grams))}
          keyboardType="decimal-pad"
          selectTextOnFocus
          accessibilityLabel={`Grams of ${item.name}`}
          style={[
            styles.grams,
            { color: t.text, borderColor: invalid ? t.danger : t.border, backgroundColor: t.bg },
          ]}
        />
        <Text style={{ color: t.muted, fontSize: font.body }}>g</Text>
        <StepButton label="+10" onPress={() => step(10)} a11y={`10 grams more ${item.name}`} />
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={{ color: t.kcal, fontSize: font.large, fontWeight: '700' }}>
            {fmtKcal(m.kcal)} kcal
          </Text>
          <Text style={{ color: t.muted, fontSize: font.small }}>
            P {fmtMacro(m.protein)} · C {fmtMacro(m.carbs)} · F {fmtMacro(m.fat)}
          </Text>
        </View>
      </View>
      {invalid && (
        <Text style={{ color: t.danger, fontSize: font.small }}>
          Enter grams between 0.1 and 5000.
        </Text>
      )}

      {portions.length > 0 && (
        <View style={styles.chips}>
          {portions.map((p) => (
            <Chip
              key={p.label}
              label={p.label}
              selected={Math.abs(item.grams - p.grams) < 0.05}
              onPress={() => dispatch({ type: 'setGrams', key: item.key, grams: p.grams })}
            />
          ))}
        </View>
      )}

      {item.candidates.length > 1 && (
        <Pressable onPress={() => setShowMatches((s) => !s)} accessibilityRole="button" hitSlop={6}>
          <Text style={{ color: t.primary, fontSize: font.body }}>
            {showMatches
              ? 'Hide other matches'
              : `Not right? ${item.candidates.length - 1} other match${item.candidates.length > 2 ? 'es' : ''}`}
          </Text>
        </Pressable>
      )}
      {showMatches && (
        <View style={{ gap: 6 }}>
          {item.candidates.map((c, n) => (
            <Pressable
              key={c.food_id}
              accessibilityRole="radio"
              accessibilityState={{ checked: n === 0 }}
              onPress={() => {
                dispatch({ type: 'switchCandidate', key: item.key, foodId: c.food_id });
                setShowMatches(false);
              }}
              style={[styles.match, { borderColor: n === 0 ? t.primary : t.border }]}
            >
              <Text style={{ color: t.text, fontSize: font.body, flex: 1 }}>{c.name}</Text>
              <Text style={{ color: t.muted, fontSize: font.small }}>
                {fmtKcal(c.per_100g.kcal)} kcal/100g
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function ConfidenceBadge({ confidence, manual }: { confidence: number; manual: boolean }) {
  const t = useTheme();
  if (manual) return null;
  const pct = Math.round(confidence * 100);
  const low = confidence < LOW_CONFIDENCE;
  const label = low ? `Check · ${pct}%` : `${pct}%`;
  return (
    <View
      accessible
      accessibilityLabel={`AI confidence ${pct} percent${low ? ', please check this item' : ''}`}
      style={[styles.badge, { backgroundColor: low ? t.warnBg : t.bg }]}
    >
      <Text
        style={{
          color: low ? t.warnText : confidence >= 0.8 ? t.ok : t.muted,
          fontSize: font.small,
          fontWeight: '600',
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function StepButton({
  label,
  onPress,
  a11y,
}: {
  label: string;
  onPress: () => void;
  a11y: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      hitSlop={4}
      style={[styles.step, { borderColor: t.border }]}
    >
      <Text style={{ color: t.text, fontSize: font.body }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 14, gap: 10, borderWidth: 1.5 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  remove: { paddingHorizontal: 4 },
  gramsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grams: {
    borderWidth: 1,
    borderRadius: 8,
    minWidth: 72,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: font.large,
    textAlign: 'center',
  },
  step: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  match: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
});
