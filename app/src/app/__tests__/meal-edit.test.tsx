// Drives the ingredient editor like a user: edit grams, switch a match, remove, save.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import mealPhoto from '../../../../contracts/fixtures/meal-photo.response.json';
import type { MealResponse } from '@/api';
import { mealsBetween } from '@/data/meals';
import { setDraft } from '@/features/meal/draft';

import MealEditScreen from '../meal/edit';

// Built inside the factory: jest.mock is hoisted above any const in this file.
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() },
  Stack: { Screen: () => null },
}));
const mockRouter = jest.requireMock<{ router: Record<string, jest.Mock> }>('expo-router').router;

const fixture = mealPhoto as MealResponse;

beforeEach(async () => {
  Object.values(mockRouter).forEach((f) => f.mockReset());
  await act(() =>
    setDraft({ result: JSON.parse(JSON.stringify(fixture)), source: 'photo', raw: fixture }),
  );
});

// 120 g eggs @148 + 30 g toast @293 + 60 g tomatoes @18 = 276.3 kcal
it('shows the AI items with confidence and live totals', async () => {
  await render(<MealEditScreen />);
  expect(screen.getByText('scrambled eggs')).toBeTruthy();
  expect(screen.getByText('toast')).toBeTruthy();
  expect(screen.getByText('cherry tomatoes')).toBeTruthy();
  expect(screen.getByLabelText(/^276 kilocalories/)).toBeTruthy();
  expect(screen.getByLabelText(/AI confidence 72 percent/)).toBeTruthy();
});

it('recalculates while typing grams, accepting a decimal comma', async () => {
  await render(<MealEditScreen />);
  await fireEvent.changeText(screen.getByLabelText('Grams of scrambled eggs'), '220,5');
  // eggs 220.5 g = 326.34 kcal; + 87.9 + 10.8 = 425.04
  expect(screen.getByLabelText(/^425 kilocalories/)).toBeTruthy();
});

it('flags invalid grams without changing totals', async () => {
  await render(<MealEditScreen />);
  await fireEvent.changeText(screen.getByLabelText('Grams of toast'), 'abc');
  expect(screen.getByText('Enter grams between 0.1 and 5000.')).toBeTruthy();
  expect(screen.getByLabelText(/^276 kilocalories/)).toBeTruthy();
});

it('switches to another match and removes an item', async () => {
  await render(<MealEditScreen />);
  await fireEvent.press(screen.getAllByText(/other match/)[0]!);
  await fireEvent.press(screen.getByText('Egg, whole, cooked, fried'));
  // eggs fried 120 g @196 = 235.2; + 87.9 + 10.8 = 333.9
  expect(screen.getByLabelText(/^334 kilocalories/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Remove toast'));
  expect(screen.queryByText('toast')).toBeNull();
  expect(screen.getByLabelText(/^246 kilocalories/)).toBeTruthy();
});

it('applies a common portion', async () => {
  await render(<MealEditScreen />);
  await fireEvent.press(screen.getByText('2 egg'));
  expect(screen.getByLabelText('Grams of scrambled eggs').props.value).toBe('100');
});

it('saves the edited meal (device store in mock mode) and goes home', async () => {
  await render(<MealEditScreen />);
  await fireEvent.press(screen.getByLabelText('Remove cherry tomatoes'));
  await fireEvent.press(screen.getByText('Save meal'));
  await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/'));
  const now = new Date();
  const saved = await mealsBetween(
    new Date(now.getTime() - 60_000),
    new Date(now.getTime() + 60_000),
  );
  expect(saved[0]!.meal_items.map((i) => i.name)).toEqual(['scrambled eggs', 'toast']);
  expect(saved[0]!.source).toBe('photo');
});

it('shows an empty state without a draft', async () => {
  await act(() => setDraft(null));
  await render(<MealEditScreen />);
  expect(screen.getByText('Nothing to edit')).toBeTruthy();
});
