// Compile-time only: fails `tsc` if the temporary types in ./types drift from
// contracts/ts/macros.ts. Delete together with ./types once contracts/ts/api.ts exists.
import type { MacroItem, Nutrients } from '@contracts/macros';

import type { IngredientItem, Macros } from './types';

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const assertTrue = <T extends true>() => undefined as unknown as T;

export const _macrosMatchNutrients = assertTrue<Same<Macros, Nutrients>>();
// An IngredientItem must be usable directly with sumMacros().
export const _itemIsMacroItem = assertTrue<IngredientItem extends MacroItem ? true : false>();
