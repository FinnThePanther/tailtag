import { useEffect, useRef } from 'react';

export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  const prevValue = ref.current;

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return prevValue;
}
