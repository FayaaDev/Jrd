import type { FxProvider } from './types';
import { frankfurterFxProvider } from './providers/frankfurterFx';

export function getFxProvider(name: 'frankfurter'): FxProvider {
  switch (name) {
    case 'frankfurter':
      return frankfurterFxProvider;
  }
}
