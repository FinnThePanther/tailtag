import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

type NavigationReadyContextValue = {
  isReady: boolean;
  setReady: () => void;
};

const NavigationReadyContext = createContext<NavigationReadyContextValue>({
  isReady: false,
  setReady: () => {},
});

export function NavigationReadyProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const hasSetRef = useRef(false);

  const setReady = useCallback(() => {
    if (hasSetRef.current) return;
    hasSetRef.current = true;
    setIsReady(true);
  }, []);

  const value = useMemo(() => ({ isReady, setReady }), [isReady, setReady]);

  return (
    <NavigationReadyContext.Provider value={value}>{children}</NavigationReadyContext.Provider>
  );
}

export function useNavigationReady(): boolean {
  return useContext(NavigationReadyContext).isReady;
}

export function useSetNavigationReady(): () => void {
  return useContext(NavigationReadyContext).setReady;
}
