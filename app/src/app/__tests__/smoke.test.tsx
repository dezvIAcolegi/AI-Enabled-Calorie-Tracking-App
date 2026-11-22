// Every screen renders in mock mode without throwing and settles on real content.
import { render, screen } from '@testing-library/react-native';
import type { ComponentType } from 'react';

import Today from '../(tabs)/index';
import Scan from '../(tabs)/scan';
import Library from '../(tabs)/library';
import Recipes from '../(tabs)/recipes';
import History from '../(tabs)/history';
import Profile from '../profile';
import SignIn from '../(auth)/sign-in';
import MealText from '../meal/text';
import FoodSearch from '../meal/search';
import Barcode from '../product/barcode';
import RecipeEdit from '../recipe/edit';

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() },
    Stack: { Screen: () => null },
    Link: ({ children }: { children: unknown }) => children,
    Redirect: () => null,
    useLocalSearchParams: () => ({}),
    // Run focus effects once on mount, like a screen gaining focus.
    useFocusEffect: (cb: () => void | (() => void)) => useEffect(cb, [cb]),
  };
});

const cases: [string, ComponentType, RegExp][] = [
  ['Today', Today, /Nothing logged yet today/],
  ['Scan', Scan, /Photo of a meal/],
  ['Library', Library, /Your library is empty/],
  ['Recipes', Recipes, /No recipes yet/],
  ['History', History, /Last 7 days/],
  ['Profile', Profile, /Daily targets/],
  ['Sign in', SignIn, /Calorie Tracker/],
  ['Meal text', MealText, /Write what you ate/],
  ['Food search', FoodSearch, /Type at least 2 letters/],
  ['Barcode (typed)', Barcode, /Look up/],
  ['Recipe builder', RecipeEdit, /Ingredients/],
];

it.each(cases)('%s renders', async (_name, Screen, expected) => {
  await render(<Screen />);
  expect(await screen.findByText(expected)).toBeTruthy();
});
