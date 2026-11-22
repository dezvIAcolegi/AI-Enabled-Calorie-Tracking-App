import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError, mealFromText } from '@/api';
import { Banner, Button } from '@/components/ui';
import { font, useTheme } from '@/components/theme';
import { setDraft } from '@/features/meal/draft';

const MAX = 500;

export default function MealTextScreen() {
  const t = useTheme();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const abort = useRef<AbortController | null>(null);

  const submit = async () => {
    const v = text.trim();
    if (!v) return;
    abort.current = new AbortController();
    setLoading(true);
    setError(null);
    try {
      const result = await mealFromText(v, abort.current.signal);
      setDraft({ result, source: 'text', raw: result });
      router.replace('/meal/edit');
    } catch (e) {
      if (abort.current.signal.aborted) return;
      setError(e instanceof ApiError ? e : new ApiError('server', 'Something went wrong.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.body}>
        <Text style={{ color: t.muted, fontSize: font.body }}>
          Write what you ate, with amounts if you know them. Romanian or English is fine.
        </Text>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="e.g. 2 eggs, a slice of toast and some cherry tomatoes"
          placeholderTextColor={t.muted}
          multiline
          maxLength={MAX}
          autoFocus
          accessibilityLabel="Describe your meal"
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.card }]}
        />
        <Text style={{ color: t.muted, fontSize: font.small, alignSelf: 'flex-end' }}>
          {text.length}/{MAX}
        </Text>
        {error && (
          <Banner
            kind="error"
            action={error.retryable ? { title: 'Retry', onPress: submit } : undefined}
          >
            {error.message}
          </Banner>
        )}
        <Button title="Find foods" onPress={submit} loading={loading} disabled={!text.trim()} />
        {loading && (
          <Button
            title="Cancel"
            kind="secondary"
            onPress={() => {
              abort.current?.abort();
              setLoading(false);
            }}
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    minHeight: 140,
    fontSize: font.large,
    textAlignVertical: 'top',
  },
});
