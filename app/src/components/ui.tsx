import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import type { Nutrients } from '@contracts/macros';
import { fmtKcal, fmtMacro } from '@/lib/format';

import { font, useTheme } from './theme';

type ButtonProps = {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
};

export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
  loading,
  style,
  accessibilityHint,
}: ButtonProps) {
  const t = useTheme();
  const bg = kind === 'primary' ? t.primary : kind === 'danger' ? t.danger : t.card;
  const fg = kind === 'secondary' ? t.text : t.onPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        kind === 'secondary' && { borderWidth: 1, borderColor: t.border },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  onPress,
  selected,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={6}
      style={[
        styles.chip,
        {
          borderColor: selected ? t.primary : t.border,
          backgroundColor: selected ? t.primary : 'transparent',
        },
      ]}
    >
      <Text style={{ color: selected ? t.onPrimary : t.text, fontSize: font.small }}>{label}</Text>
    </Pressable>
  );
}

/** kcal big, then P / C / F. */
export function MacroSummary({ m, size = 'normal' }: { m: Nutrients; size?: 'normal' | 'large' }) {
  const t = useTheme();
  const big = size === 'large';
  return (
    <View style={styles.macroRow} accessible accessibilityLabel={macroLabel(m)}>
      <Text style={{ color: t.kcal, fontSize: big ? font.huge : font.large, fontWeight: '700' }}>
        {fmtKcal(m.kcal)} <Text style={{ fontSize: font.small, fontWeight: '400' }}>kcal</Text>
      </Text>
      <View style={styles.macroParts}>
        <MacroPart label="P" value={m.protein} color={t.protein} />
        <MacroPart label="C" value={m.carbs} color={t.carbs} />
        <MacroPart label="F" value={m.fat} color={t.fat} />
      </View>
    </View>
  );
}

function MacroPart({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Text style={{ color, fontSize: font.body, fontWeight: '600' }}>
      {label} {fmtMacro(value)}g
    </Text>
  );
}

export const macroLabel = (m: Nutrients) =>
  `${fmtKcal(m.kcal)} kilocalories, protein ${fmtMacro(m.protein)} grams, carbs ${fmtMacro(m.carbs)} grams, fat ${fmtMacro(m.fat)} grams`;

/** Progress against a target; turns red when over. */
export function ProgressBar({
  value,
  target,
  color,
  label,
}: {
  value: number;
  target: number | null;
  color: string;
  label: string;
}) {
  const t = useTheme();
  const pct = target ? Math.min(1, value / target) : 0;
  const over = target !== null && value > target;
  return (
    <View
      style={{ gap: 4 }}
      accessible
      accessibilityLabel={`${label}: ${Math.round(value)}${target ? ` of ${Math.round(target)}` : ''}`}
    >
      <View style={styles.progressLabels}>
        <Text style={{ color: t.text, fontSize: font.body }}>{label}</Text>
        <Text style={{ color: over ? t.danger : t.muted, fontSize: font.body }}>
          {Math.round(value)}
          {target ? ` / ${Math.round(target)}` : ''}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: t.card }]}>
        <View
          style={{
            width: `${pct * 100}%`,
            backgroundColor: over ? t.danger : color,
            height: '100%',
            borderRadius: 4,
          }}
        />
      </View>
    </View>
  );
}

export function Banner({
  children,
  kind = 'warn',
  action,
}: {
  children: ReactNode;
  kind?: 'warn' | 'error';
  action?: { title: string; onPress: () => void };
}) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="alert"
      style={[styles.banner, { backgroundColor: kind === 'error' ? t.danger : t.warnBg }]}
    >
      <Text style={{ color: kind === 'error' ? '#fff' : t.warnText, fontSize: font.body, flex: 1 }}>
        {children}
      </Text>
      {action && (
        <Pressable accessibilityRole="button" onPress={action.onPress} hitSlop={8}>
          <Text
            style={{
              color: kind === 'error' ? '#fff' : t.warnText,
              fontWeight: '700',
              fontSize: font.body,
            }}
          >
            {action.title}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export function Loading({ label }: { label: string }) {
  const t = useTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={t.primary} />
      <Text style={{ color: t.muted, fontSize: font.body, marginTop: 12 }}>{label}</Text>
    </View>
  );
}

export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: { title: string; onPress: () => void };
}) {
  const t = useTheme();
  return (
    <View style={[styles.center, { gap: 8 }]}>
      <Text style={{ color: t.text, fontSize: font.large, fontWeight: '600', textAlign: 'center' }}>
        {title}
      </Text>
      {body && (
        <Text style={{ color: t.muted, fontSize: font.body, textAlign: 'center' }}>{body}</Text>
      )}
      {action && <Button title={action.title} onPress={action.onPress} style={{ marginTop: 8 }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: font.body, fontWeight: '600' },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  macroRow: { gap: 4 },
  macroParts: { flexDirection: 'row', gap: 14 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
