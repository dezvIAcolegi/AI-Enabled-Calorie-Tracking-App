// Email + password with Supabase Auth: sign in, create an account, reset the password.
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button } from '@/components/ui';
import { font, useTheme } from '@/components/theme';
import { authMessage } from '@/lib/authMessage';
import { supabase } from '@/lib/supabase';

type Mode = 'signIn' | 'signUp' | 'reset';

export default function SignIn() {
  const t = useTheme();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'warn' | 'error'; text: string } | null>(null);

  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const canSubmit = emailOk && (mode === 'reset' || password.length >= 6);

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    const e = email.trim().toLowerCase();
    try {
      if (mode === 'signIn') {
        const { error } = await supabase.auth.signInWithPassword({ email: e, password });
        if (error) throw error;
        // AuthProvider sees the session and the gate opens Today.
      } else if (mode === 'signUp') {
        const { data, error } = await supabase.auth.signUp({ email: e, password });
        if (error) throw error;
        if (!data.session)
          setMsg({
            kind: 'warn',
            text: 'Check your email and tap the link to confirm, then sign in.',
          });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(e);
        if (error) throw error;
        setMsg({ kind: 'warn', text: 'If that email has an account, a reset link is on its way.' });
      }
    } catch (err) {
      setMsg({
        kind: 'error',
        text: authMessage(err instanceof Error ? err.message : String(err)),
      });
    } finally {
      setBusy(false);
    }
  };

  const title =
    mode === 'signIn' ? 'Sign in' : mode === 'signUp' ? 'Create account' : 'Reset password';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.body}
      >
        <Text style={{ color: t.text, fontSize: font.huge, fontWeight: '800' }}>
          Calorie Tracker
        </Text>
        <Text style={{ color: t.muted, fontSize: font.body }}>
          Photograph a meal, check the list, done.
        </Text>
        <Text style={{ color: t.text, fontSize: font.title, fontWeight: '600', marginTop: 16 }}>
          {title}
        </Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={t.muted}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          accessibilityLabel="Email"
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.card }]}
        />
        {mode !== 'reset' && (
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password (6+ characters)"
            placeholderTextColor={t.muted}
            secureTextEntry
            autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
            textContentType={mode === 'signUp' ? 'newPassword' : 'password'}
            accessibilityLabel="Password"
            onSubmitEditing={canSubmit ? submit : undefined}
            style={[
              styles.input,
              { color: t.text, borderColor: t.border, backgroundColor: t.card },
            ]}
          />
        )}
        {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}
        <Button title={title} onPress={submit} loading={busy} disabled={!canSubmit} />
        <View style={styles.links}>
          {mode !== 'signIn' && (
            <Link
              label="I have an account"
              onPress={() => {
                setMode('signIn');
                setMsg(null);
              }}
            />
          )}
          {mode !== 'signUp' && (
            <Link
              label="Create an account"
              onPress={() => {
                setMode('signUp');
                setMsg(null);
              }}
            />
          )}
          {mode === 'signIn' && (
            <Link
              label="Forgot password?"
              onPress={() => {
                setMode('reset');
                setMsg(null);
              }}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Link({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={8}>
      <Text style={{ color: t.primary, fontSize: font.body }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, padding: 24, gap: 12, justifyContent: 'center' },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: font.large,
  },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, marginTop: 4 },
});
