import { StyleSheet, Text, View } from 'react-native';

/** Stand-in body for screens that are routed but not built yet. */
export function Placeholder({ title, todo }: { title: string; todo: string }) {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.todo}>{todo}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  title: { fontSize: 22, fontWeight: '600' },
  todo: { fontSize: 16, color: '#666', textAlign: 'center' },
});
