import { Link, Tabs } from 'expo-router';
import { Text } from 'react-native';

export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          headerRight: () => (
            <Link href="/profile" style={{ marginRight: 16 }}>
              <Text style={{ fontSize: 16, color: '#0a7ea4' }}>Profile</Text>
            </Link>
          ),
        }}
      />
      <Tabs.Screen name="scan" options={{ title: 'Scan' }} />
      <Tabs.Screen name="library" options={{ title: 'Library' }} />
      <Tabs.Screen name="recipes" options={{ title: 'Recipes' }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
    </Tabs>
  );
}
