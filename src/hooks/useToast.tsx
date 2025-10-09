import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TOAST_DURATION = 5000;
const TAB_BAR_HEIGHT = 64;

type ToastMessage = {
  id: number;
  message: string;
};

type ToastContextValue = {
  showToast: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const insets = useSafeAreaInsets();
  const containerBottom = useMemo(() => insets.bottom + TAB_BAR_HEIGHT, [insets.bottom]);

  const showToast = useCallback((message: string) => {
    setToasts((current) => {
      const next = [...current, { id: Date.now(), message }];
      return next.slice(-3);
    });
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View pointerEvents="none" style={[styles.container, { bottom: containerBottom }] }>
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            message={toast.message}
            onFinish={() => {
              setToasts((current) => current.filter((item) => item.id !== toast.id));
            }}
          />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

type ToastItemProps = {
  message: string;
  onFinish: () => void;
};

function ToastItem({ message, onFinish }: ToastItemProps) {
  const opacity = useMemo(() => new Animated.Value(0), []);
  const translateY = useMemo(() => new Animated.Value(40), []);
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const onFinishRef = useRef(onFinish);

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    animationRef.current?.stop();

    opacity.setValue(0);
    translateY.setValue(40);

    const sequence = Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]),
      Animated.delay(TOAST_DURATION - 400),
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]);

    animationRef.current = sequence;

    sequence.start(({ finished }) => {
      if (finished) {
        onFinishRef.current?.();
      }
    });

    return () => {
      animationRef.current?.stop();
    };
  }, [opacity, translateY]);

  return (
    <Animated.View style={[styles.toast, { opacity, transform: [{ translateY }] }]}> 
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 999,
  },
  toast: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 8,
    maxWidth: '90%',
  },
  text: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },
});
