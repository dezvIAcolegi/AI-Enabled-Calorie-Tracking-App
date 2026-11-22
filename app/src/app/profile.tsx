// Daily targets, consent to keep scans for evaluation, sign out, delete account.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { Banner, Button, Loading } from '@/components/ui';
import { font, useTheme } from '@/components/theme';
import { deleteAccount } from '@/data/account';
import {
  getProfile,
  suggestMacros,
  TARGET_LIMITS,
  updateProfile,
  withdrawScanConsent,
  type Profile,
  type TargetKey,
} from '@/data/profile';
import { authRequired } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

const LABELS: Record<TargetKey, string> = {
  kcal_target: 'Calories (kcal)',
  protein_target: 'Protein (g)',
  carbs_target: 'Carbs (g)',
  fat_target: 'Fat (g)',
};
const KEYS = Object.keys(LABELS) as TargetKey[];

export default function ProfileScreen() {
  const t = useTheme();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [vals, setVals] = useState<Record<TargetKey, string>>({
    kcal_target: '',
    protein_target: '',
    carbs_target: '',
    fat_target: '',
  });
  const [errors, setErrors] = useState<Partial<Record<TargetKey, string>>>({});
  const [msg, setMsg] = useState<{ kind: 'warn' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getProfile().then(
      (p) => {
        setProfile(p);
        setVals(
          Object.fromEntries(KEYS.map((k) => [k, p[k] == null ? '' : String(p[k])])) as Record<
            TargetKey,
            string
          >,
        );
      },
      (e) =>
        setMsg({
          kind: 'error',
          text: e instanceof Error ? e.message : 'Could not load your profile.',
        }),
    );
  }, []);

  if (!profile)
    return msg ? <Banner kind="error">{msg.text}</Banner> : <Loading label="Loading profile…" />;

  const save = async () => {
    const errs: Partial<Record<TargetKey, string>> = {};
    const patch: Partial<Profile> = {};
    for (const k of KEYS) {
      const raw = vals[k].trim().replace(',', '.');
      if (!raw) {
        patch[k] = null;
        continue;
      }
      const n = Number(raw);
      const [lo, hi] = TARGET_LIMITS[k];
      if (!Number.isFinite(n) || n < lo || n > hi) errs[k] = `Between ${lo} and ${hi}`;
      else patch[k] = k === 'kcal_target' ? Math.round(n) : Math.round(n * 10) / 10;
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await updateProfile(patch);
      setMsg({ kind: 'warn', text: 'Targets saved.' });
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Could not save.' });
    } finally {
      setSaving(false);
    }
  };

  const toggleConsent = async (on: boolean) => {
    setProfile({ ...profile, scan_consent: on });
    try {
      if (on) {
        await updateProfile({ scan_consent: true });
      } else {
        // Backend #36: turns consent off and deletes every kept scan in one call.
        const deleted = await withdrawScanConsent();
        setMsg({
          kind: 'warn',
          text: deleted
            ? `Consent withdrawn. ${deleted} kept scan${deleted === 1 ? '' : 's'} deleted.`
            : 'Consent withdrawn.',
        });
      }
    } catch (e) {
      setProfile({ ...profile, scan_consent: !on });
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Could not change consent.' });
    }
  };

  const confirmDelete = () =>
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your account, meals, products, recipes and photos. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount();
            } catch (e) {
              setMsg({
                kind: 'error',
                text: e instanceof Error ? e.message : 'Could not delete the account.',
              });
            }
          },
        },
      ],
    );

  const kcal = Number(vals.kcal_target);

  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.h, { color: t.text }]}>Daily targets</Text>
      {KEYS.map((k) => (
        <View key={k} style={styles.row}>
          <Text style={{ color: t.text, fontSize: font.body, flex: 1 }}>{LABELS[k]}</Text>
          <View style={{ alignItems: 'flex-end' }}>
            <TextInput
              value={vals[k]}
              onChangeText={(v) => setVals((s) => ({ ...s, [k]: v }))}
              keyboardType="decimal-pad"
              placeholder="—"
              placeholderTextColor={t.muted}
              accessibilityLabel={LABELS[k]}
              style={[
                styles.input,
                {
                  color: t.text,
                  borderColor: errors[k] ? t.danger : t.border,
                  backgroundColor: t.card,
                },
              ]}
            />
            {errors[k] && (
              <Text style={{ color: t.danger, fontSize: font.small }}>{errors[k]}</Text>
            )}
          </View>
        </View>
      ))}
      {kcal >= 800 && (
        <Button
          title="Suggest macros from calories"
          kind="secondary"
          onPress={() =>
            setVals((s) => ({
              ...s,
              ...Object.fromEntries(
                Object.entries(suggestMacros(kcal)).map(([k, v]) => [k, String(v)]),
              ),
            }))
          }
        />
      )}
      <Button title="Save targets" onPress={save} loading={saving} />
      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      <Text style={[styles.h, { color: t.text }]}>Privacy</Text>
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: t.text, fontSize: font.body }}>Help improve the AI</Text>
          <Text style={{ color: t.muted, fontSize: font.small }}>
            Keep the AI’s raw answer and your corrections for our accuracy tests. Off by default;
            turning it off deletes everything kept so far.
          </Text>
        </View>
        <Switch
          value={profile.scan_consent}
          onValueChange={toggleConsent}
          accessibilityLabel="Keep scans for evaluation"
        />
      </View>

      {authRequired && (
        <>
          <Text style={[styles.h, { color: t.text }]}>Account</Text>
          <Button
            title="Sign out"
            kind="secondary"
            onPress={async () => {
              await supabase.auth.signOut();
              router.replace('/');
            }}
          />
          <Button title="Delete account and all data" kind="danger" onPress={confirmDelete} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 12, paddingBottom: 40 },
  h: { fontSize: font.large, fontWeight: '700', marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    minWidth: 100,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: font.large,
    textAlign: 'right',
  },
});
