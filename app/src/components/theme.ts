import { useColorScheme } from 'react-native';

const light = {
  bg: '#ffffff',
  card: '#f4f5f7',
  text: '#111418',
  muted: '#5f6b7a',
  border: '#dde1e6',
  primary: '#0a7ea4',
  onPrimary: '#ffffff',
  danger: '#c62828',
  warnBg: '#fff4e5',
  warnText: '#7a4b00',
  ok: '#2e7d32',
  kcal: '#e8590c',
  protein: '#1971c2',
  carbs: '#2f9e44',
  fat: '#ae3ec9',
};
export type Theme = typeof light;

const dark: Theme = {
  bg: '#0f1115',
  card: '#1a1d23',
  text: '#eef1f4',
  muted: '#9aa5b1',
  border: '#2c313a',
  primary: '#4fb3d9',
  onPrimary: '#0f1115',
  danger: '#ef5350',
  warnBg: '#3a2a10',
  warnText: '#ffd8a0',
  ok: '#66bb6a',
  kcal: '#ff8a3d',
  protein: '#5aa9ff',
  carbs: '#69db7c',
  fat: '#da77f2',
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Readable sizes for the UI-polish task; 16 is the floor for body text. */
export const font = { small: 14, body: 16, large: 18, title: 22, huge: 32 } as const;
