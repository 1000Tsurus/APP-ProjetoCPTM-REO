import { useFonts } from 'expo-font';
import { DefaultTheme, ThemeProvider } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SwipeStack as Stack, swipeStackOptions } from '@/components/navigation/SwipeStack';
import * as SplashScreen from 'expo-splash-screen';
import { Fragment, useEffect, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { COLOR } from '@/constants/theme';
import { SessionProvider, useSession } from '@/contexts/SessionContext';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Recarregar numa tela interna mantém o botão de voltar, partindo do login/início.
  initialRouteName: 'index',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Tema só claro, com o fundo do app (o site gerencial não tem modo escuro).
const APP_THEME = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: COLOR.bg } };

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

/** Mantém o splash até a sessão salva ser restaurada; a navegação só monta depois disso. */
function SessionGate({ children }: PropsWithChildren) {
  const { ready } = useSession();
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);
  return ready ? <>{children}</> : null;
}

function RootLayoutNav() {
  // SDK 58 uses CSS safe-area insets on web; keep the native provider on Android/iOS.
  const SafeAreaRoot = Platform.OS === 'web' ? Fragment : SafeAreaProvider;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaRoot>
        <SessionProvider>
          <SessionGate>
          <ThemeProvider value={APP_THEME}>
            <Stack screenOptions={swipeStackOptions}>
              <Stack.Screen name="index" />
              <Stack.Screen name="login" />
              <Stack.Screen name="(tabs)" />
            </Stack>
          </ThemeProvider>
          </SessionGate>
        </SessionProvider>
      </SafeAreaRoot>
    </GestureHandlerRootView>
  );
}
