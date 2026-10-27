import React, { Suspense } from 'react';
import { useBuyerlyChunk, type BuyerlyChunk } from '@/components/layout/BuyerlyPageChunks';

/**
 * A component from a chunk (#494): `fallback` while its code downloads, then
 * the component itself, in the same frame once the chunk is in.
 */
export function buyerlyLazy<M, K extends keyof M>(chunk: BuyerlyChunk<M>, name: K, fallback: React.ReactNode = null) {
  type Props = M[K] extends React.ComponentType<infer P> ? P : never;
  const Loaded: React.FC<{ props: Props }> = ({ props }) => {
    const Component = useBuyerlyChunk(chunk)[name] as React.ComponentType<Props>;
    return <Component {...(props as Props & React.JSX.IntrinsicAttributes)} />;
  };
  const Lazy: React.FC<Props> = (props) => (
    <Suspense fallback={fallback}>
      <Loaded props={props} />
    </Suspense>
  );
  return Lazy;
}
