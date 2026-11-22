import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { warmUp } from '@/api';
import { font, useTheme } from '@/components/theme';
import { ScanQuota } from '@/features/scan/ScanQuota';

const OPTIONS = [
  {
    title: 'Photo of a meal',
    body: 'Take a photo; AI lists the foods and grams for you to check.',
    href: '/capture?mode=meal',
  },
  {
    title: 'Describe a meal',
    body: 'Type it, e.g. "two eggs and a slice of toast".',
    href: '/meal/text',
  },
  {
    title: 'Scan a barcode',
    body: 'Packaged food: look it up, log it or keep it in your library.',
    href: '/capture?mode=barcode',
  },
  {
    title: 'Photo of a nutrition label',
    body: 'Read the values from the label and save it as a product.',
    href: '/capture?mode=label',
  },
] as const;

export default function ScanScreen() {
  const t = useTheme();
  useFocusEffect(useCallback(() => warmUp(), []));
  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.list}>
      <ScanQuota />
      {OPTIONS.map((o) => (
        <Pressable
          key={o.title}
          accessibilityRole="button"
          onPress={() => router.push(o.href)}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: t.card, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Text style={{ color: t.text, fontSize: font.large, fontWeight: '600' }}>{o.title}</Text>
          <Text style={{ color: t.muted, fontSize: font.body }}>{o.body}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 12 },
  card: { borderRadius: 12, padding: 16, gap: 4 },
});
