// Camera for meal photos, nutrition labels and barcodes. ?mode=meal|label|barcode[&barcode=…]
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError, mealFromPhoto, readLabel } from '@/api';
import { Banner, Button, Loading } from '@/components/ui';
import { font, useTheme } from '@/components/theme';
import { setLabelDraft } from '@/features/label/draft';
import { setDraft } from '@/features/meal/draft';
import { useAiMocks } from '@/lib/env';
import { resizeForUpload } from '@/lib/photo';

type Mode = 'meal' | 'label' | 'barcode';

const COPY: Record<Mode, { title: string; hint: string; busy: string }> = {
  meal: {
    title: 'Meal photo',
    hint: 'Fit the whole plate in the frame, from above if you can.',
    busy: 'Finding the foods…',
  },
  label: {
    title: 'Nutrition label',
    hint: 'Fill the frame with the nutrition table. Avoid glare.',
    busy: 'Reading the label…',
  },
  barcode: {
    title: 'Barcode',
    hint: 'Point at the barcode. It scans by itself.',
    busy: 'Looking it up…',
  },
};

// EAN-13/8 and UPC-A/E cover groceries; the rest just slow scanning down.
const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;

export default function CaptureScreen() {
  const params = useLocalSearchParams<{ mode?: string; barcode?: string }>();
  const mode: Mode = params.mode === 'label' || params.mode === 'barcode' ? params.mode : 'meal';
  const t = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const scanned = useRef(false);
  const abort = useRef<AbortController | null>(null);

  const header = <Stack.Screen options={{ headerShown: true, title: COPY[mode].title }} />;

  if (!permission) return <Loading label="Opening the camera…" />;
  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: t.bg }]}>
        {header}
        <Text
          style={{ color: t.text, fontSize: font.large, fontWeight: '600', textAlign: 'center' }}
        >
          Camera access needed
        </Text>
        <Text style={{ color: t.muted, fontSize: font.body, textAlign: 'center' }}>
          {mode === 'barcode'
            ? 'To scan barcodes, allow the camera. Nothing is recorded.'
            : 'Photos are resized and sent to our server only to read the food. You can delete them later.'}
        </Text>
        {permission.canAskAgain ? (
          <Button title="Allow camera" onPress={requestPermission} />
        ) : (
          <Button title="Open settings" onPress={() => Linking.openSettings()} />
        )}
        {mode === 'meal' && (
          <Button
            title="Describe the meal instead"
            kind="secondary"
            onPress={() => router.replace('/meal/text')}
          />
        )}
      </SafeAreaView>
    );
  }

  const takePhoto = async () => {
    if (!camera.current || busy) return;
    setBusy(true);
    setError(null);
    abort.current = new AbortController();
    try {
      const shot = await camera.current.takePictureAsync({ quality: 0.8, skipProcessing: false });
      if (!shot) throw new ApiError('bad_request', 'No photo was taken.');
      const photo = await resizeForUpload(shot.uri, shot.width, shot.height);
      if (mode === 'meal') {
        const result = await mealFromPhoto(photo, abort.current.signal);
        setDraft({ result, source: 'photo', photoUri: photo.uri, raw: result });
        router.replace('/meal/edit');
      } else {
        const result = await readLabel(photo, abort.current.signal);
        setLabelDraft({ result, barcode: params.barcode });
        router.replace('/label/review');
      }
    } catch (e) {
      if (abort.current?.signal.aborted) return;
      setError(
        e instanceof ApiError ? e : new ApiError('server', 'Something went wrong. Try again.'),
      );
    } finally {
      setBusy(false);
    }
  };

  const onBarcode = (r: BarcodeScanningResult) => {
    if (scanned.current) return;
    scanned.current = true; // the callback fires many times per second
    router.replace({ pathname: '/product/barcode', params: { code: r.data } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {header}
      <CameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={
          mode === 'barcode' ? { barcodeTypes: [...BARCODE_TYPES] } : undefined
        }
        onBarcodeScanned={mode === 'barcode' ? onBarcode : undefined}
      />
      <SafeAreaView edges={['bottom']} style={styles.overlay}>
        <Text style={styles.hint}>{COPY[mode].hint}</Text>
        {useAiMocks && mode !== 'barcode' && (
          <Text style={styles.mock}>Mock mode: any photo returns the sample result.</Text>
        )}
        {error && (
          <Banner
            kind="error"
            action={error.retryable ? { title: 'Retry', onPress: takePhoto } : undefined}
          >
            {error.message}
          </Banner>
        )}
        {mode === 'barcode' ? (
          <Button
            title="Type the barcode instead"
            kind="secondary"
            onPress={() => router.replace('/product/barcode')}
          />
        ) : busy ? (
          <View style={styles.busy}>
            <Text style={styles.hint}>{COPY[mode].busy}</Text>
            <Button
              title="Cancel"
              kind="secondary"
              onPress={() => {
                abort.current?.abort();
                setBusy(false);
              }}
            />
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Take photo"
            onPress={takePhoto}
            style={({ pressed }) => [styles.shutter, { opacity: pressed ? 0.7 : 1 }]}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    gap: 12,
    alignItems: 'center',
  },
  hint: {
    color: '#fff',
    fontSize: font.body,
    textAlign: 'center',
    textShadowColor: '#000',
    textShadowRadius: 4,
  },
  mock: { color: '#ffd8a0', fontSize: font.small },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 5,
    borderColor: '#fff',
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginBottom: 8,
  },
  busy: { alignItems: 'center', gap: 10 },
});
