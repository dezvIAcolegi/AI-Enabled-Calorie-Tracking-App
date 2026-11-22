// Label review: a flagged value starts empty, blocks saving until filled, then saves a product.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { listProducts } from '@/data/foods';
import { setLabelDraft } from '@/features/label/draft';
import { getActiveFood } from '@/features/product/active';

import LabelReviewScreen from '../label/review';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() },
  Stack: { Screen: () => null },
}));
const mockRouter = jest.requireMock<{ router: Record<string, jest.Mock> }>('expo-router').router;

beforeEach(async () => {
  Object.values(mockRouter).forEach((f) => f.mockReset());
  await act(() =>
    setLabelDraft({
      // LabelMacros (PR #23): fat unreadable -> null and flagged
      result: {
        per_100g: { kcal: 389, protein: 13, carbs: 66, fat: null },
        per_serving: null,
        serving_grams: 40,
        flagged: ['per_100g.fat'],
      },
      barcode: '5941234567890',
    }),
  );
});

it('highlights the unreadable field and requires it', async () => {
  await render(<LabelReviewScreen />);
  expect(screen.getByText(/1 value couldn’t be read/)).toBeTruthy();
  const fat = screen.getByLabelText(/Fat \(g\), could not be read/);
  expect(fat.props.value).toBe('');
  expect(screen.getByLabelText('Energy (kcal)').props.value).toBe('389');

  await fireEvent.changeText(screen.getByPlaceholderText('e.g. Fulgi de ovăz'), 'Fulgi de ovăz');
  await fireEvent.press(screen.getByText('Save product'));
  expect(screen.getByText('Required')).toBeTruthy();
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

it('saves once the user fills it in, keeping the barcode', async () => {
  await render(<LabelReviewScreen />);
  await fireEvent.changeText(screen.getByPlaceholderText('e.g. Fulgi de ovăz'), 'Fulgi de ovăz');
  await fireEvent.changeText(screen.getByLabelText(/Fat \(g\)/), '7');
  expect(screen.queryByText(/⚠ check this/)).toBeNull();
  await fireEvent.press(screen.getByText('Save product'));
  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/product/log?saved=1'));
  const food = getActiveFood()!;
  expect(food).toMatchObject({
    origin: 'label',
    name: 'Fulgi de ovăz',
    barcode: '5941234567890',
    fat: 7,
    kcal: 389,
    serving_grams: 40,
  });
  expect(food.id).toMatch(/^label:/);
  expect((await listProducts()).some((p) => p.food_id === food.id)).toBe(true);
});

it('warns once when calories do not add up, then saves anyway', async () => {
  await render(<LabelReviewScreen />);
  await fireEvent.changeText(screen.getByPlaceholderText('e.g. Fulgi de ovăz'), 'X');
  await fireEvent.changeText(screen.getByLabelText(/Fat \(g\)/), '7');
  await fireEvent.changeText(screen.getByLabelText('Energy (kcal)'), '100');
  await fireEvent.press(screen.getByText('Save product'));
  expect(screen.getByText(/don't match/)).toBeTruthy();
  expect(mockRouter.replace).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Save anyway'));
  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalled());
});
