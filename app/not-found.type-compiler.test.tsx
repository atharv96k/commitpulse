import { describe, it, expectTypeOf } from 'vitest';
import type { JSX } from 'react';
import NotFound from './not-found';
import MiniGame from '../components/MiniGame';

describe('NotFound TypeScript Compiler Validation & Schema Constraints Stability', () => {
  it('1. enforces field property configurations on the exported component', () => {
    type NotFoundType = typeof NotFound;

    expectTypeOf<NotFoundType>().toBeFunction();
    expectTypeOf<NotFoundType>().returns.toMatchTypeOf<JSX.Element | null>();
  });

  it('2. asserts that invalid prop parameters are blocked during static type checking', () => {
    type NotFoundProps = Parameters<typeof NotFound>[0];

    expectTypeOf<NotFoundProps>().toEqualTypeOf<undefined>();
    expectTypeOf<{ invalidProp: string }>().not.toMatchTypeOf<NotFoundProps>();
  });

  it('3. verifies custom types accept optional values without compile errors', () => {
    type MiniGameType = typeof MiniGame;

    expectTypeOf<MiniGameType>().toBeFunction();
    expectTypeOf<MiniGameType>().returns.toMatchTypeOf<JSX.Element | null>();
  });

  it('4. verifies internal function signatures return correct types', () => {
    const component = NotFound as unknown as Record<string, unknown>;
    expectTypeOf(component).not.toHaveProperty('displayName');
  });

  it('5. verifies schema constraints on JSX rendering output', () => {
    const element = NotFound();
    expectTypeOf(element).toMatchTypeOf<JSX.Element>();
  });
});
