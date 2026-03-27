import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { ensureSeedData } from './seed';
import { markPerformance, measurePerformance } from './perf';

export type AppBootStatus = 'pending' | 'ready' | 'degraded';

interface AppBootState {
  status: AppBootStatus;
  message?: string;
}

const AppBootContext = createContext<AppBootState>({
  status: 'pending',
});

interface AppBootProviderProps extends PropsWithChildren {
  bootTask?: () => Promise<void>;
}

export function AppBootProvider({
  children,
  bootTask = ensureSeedData,
}: AppBootProviderProps) {
  const [state, setState] = useState<AppBootState>({ status: 'pending' });

  useEffect(() => {
    let cancelled = false;

    markPerformance('app-mounted');

    void bootTask()
      .then(() => {
        if (cancelled) {
          return;
        }
        markPerformance('boot-ready');
        measurePerformance('boot-duration', 'app-mounted', 'boot-ready');
        setState({ status: 'ready' });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        markPerformance('boot-ready');
        measurePerformance('boot-duration', 'app-mounted', 'boot-ready');
        setState({
          status: 'degraded',
          message: error instanceof Error
            ? error.message
            : 'Storage is limited right now. The yard is still available with reduced persistence.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [bootTask]);

  const value = useMemo(() => state, [state]);

  return (
    <AppBootContext.Provider value={value}>
      {children}
    </AppBootContext.Provider>
  );
}

export function useAppBoot() {
  return useContext(AppBootContext);
}
