import { useCallback, useEffect, useEffectEvent, useSyncExternalStore } from 'react';
import { pool, type Query, type QueryData, type QueryResult } from './pool';

const NONE: QueryResult<never> = { data: undefined, error: '', loading: false };
const noSubscription = () => () => {};

/**
 * A query's data from the pool, drawn at once when it is held; read from the
 * server when it is not, and again behind the page when it is stale (#488).
 * A null query reads nothing. Read through useSyncExternalStore rather than
 * in render, so the React Compiler sees a new value whenever one arrives.
 */
export function usePoolQuery<Q extends Query<any>>(query: Q | null): QueryResult<QueryData<Q>> {
  const key = query?.key ?? null;
  const subscribe = useCallback(
    (onChange: () => void) => (key === null ? noSubscription() : pool.subscribe(key, onChange)),
    [key],
  );
  const snapshot = useCallback(() => (key === null ? NONE : pool.result<QueryData<Q>>(key)), [key]);
  const result = useSyncExternalStore(subscribe, snapshot, snapshot);
  const ensure = useEffectEvent(() => {
    if (query) pool.ensure(query);
  });
  useEffect(() => {
    ensure();
  }, [key]);
  return result;
}

/** What the pool holds under a key, without reading it from the server; for a page that reads its own (Inbox). */
export function usePoolValue<T>(key: string | null): T | undefined {
  const subscribe = useCallback(
    (onChange: () => void) => (key === null ? noSubscription() : pool.subscribe(key, onChange)),
    [key],
  );
  const snapshot = useCallback(() => (key === null ? NONE : pool.result<T>(key)), [key]);
  return useSyncExternalStore(subscribe, snapshot, snapshot).data;
}
