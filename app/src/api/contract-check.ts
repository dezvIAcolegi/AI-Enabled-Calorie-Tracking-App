// Compile-time only: the generated contract types must stay usable with contracts/ts/macros.ts.
import type { MacroItem, Nutrients } from '@contracts/macros';

import type { IngredientItem, Macros } from './types';

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const assertTrue = <T extends true>() => undefined as unknown as T;

export const _macrosMatchNutrients = assertTrue<Same<Macros, Nutrients>>();
export const _itemIsMacroItem = assertTrue<IngredientItem extends MacroItem ? true : false>();
