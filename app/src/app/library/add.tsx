// Add a food to the library from search (reuses the food search screen's picker).
import { Redirect, router } from 'expo-router';
import { useEffect } from 'react';

import { addProduct, foodForCandidate } from '@/data/foods';
import { onFoodPicked } from '@/features/meal/pick';

export default function AddToLibrary() {
  useEffect(() => {
    onFoodPicked(async (c) => {
      try {
        await addProduct(await foodForCandidate(c));
      } finally {
        router.replace('/library');
      }
    });
  }, []);
  return <Redirect href="/meal/search" />;
}
