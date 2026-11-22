import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, authRequired, useAuth } from '@/lib/auth';

function RootNavigator() {
  const { session, loading } = useAuth();
  if (loading) return null; // splash stays up until the stored session is read
  const signedIn = !authRequired || session !== null;

  return (
    <Stack>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ title: 'Profile' }} />
        <Stack.Screen name="meal/edit" options={{ title: 'Check your meal' }} />
        <Stack.Screen name="meal/search" options={{ title: 'Add food', presentation: 'modal' }} />
        <Stack.Screen name="meal/text" options={{ title: 'Describe your meal' }} />
        <Stack.Screen name="capture" options={{ headerShown: false }} />
        <Stack.Screen name="label/review" options={{ title: 'Check the label' }} />
        <Stack.Screen name="product/barcode" options={{ title: 'Barcode' }} />
        <Stack.Screen name="product/log" options={{ title: 'Log food' }} />
        <Stack.Screen name="library/add" options={{ headerShown: false }} />
        <Stack.Screen name="library/[id]" options={{ title: 'Edit product' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
      <StatusBar style="auto" />
    </AuthProvider>
  );
}
