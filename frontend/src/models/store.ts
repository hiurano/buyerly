import { useCallback, useSyncExternalStore } from 'react';
import { compareShallow, isObservableProp, makeAutoObservable, reaction } from 'mobx';

/**
 * UI state lives in MobX stores next to the model pool, as Linear's (#510):
 * one class per area, its fields observable, its methods actions. Fields
 * hold values that are replaced, never edited in place (`deep: false`), for
 * the same reason the pool replaces its records: the React Compiler memoizes
 * by identity. Methods are bound, so `const { open } = store` works.
 */
export function makeStore<T extends object>(store: T): void {
  makeAutoObservable(store, {}, { deep: false, autoBind: true });
}

const fieldsOf = new WeakMap<object, string[]>();

function fields(store: object): string[] {
  let keys = fieldsOf.get(store);
  if (!keys) {
    keys = Object.getOwnPropertyNames(store).filter((key) => isObservableProp(store, key));
    fieldsOf.set(store, keys);
  }
  return keys;
}

/** Calls back once after any action that changed one of the store's fields. */
export function subscribeStore(store: object, onChange: () => void): () => void {
  const keys = fields(store);
  const record = store as Record<string, unknown>;
  return reaction(() => keys.map((key) => record[key]), onChange, { equals: compareShallow });
}

/**
 * What a component reads from a store. Read through useSyncExternalStore
 * rather than by `observer` reading fields in render: the React Compiler
 * would keep a field read off a module's store as a constant, while a hook's
 * answer is a value it watches. `select` returns a field, or anything else
 * that stays the same object while the store is unchanged.
 */
export function useStore<S extends object, T>(store: S, select: (store: S) => T): T {
  const subscribe = useCallback((onChange: () => void) => subscribeStore(store, onChange), [store]);
  const snapshot = () => select(store);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
