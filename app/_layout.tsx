import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SwipeStack as Stack, swipeStackOptions } from '@/components/navigation/SwipeStack';
import * as SplashScreen from 'expo-splash-screen';
import { Fragment, useEffect } from 'react';
import { Platform } from 'react-native';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useColorScheme } from '@/components/useColorScheme';
import { SessionProvider } from '@/contexts/SessionContext';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: 'index',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  // SDK 58 uses CSS safe-area insets on web; keep the native provider on Android/iOS.
  const SafeAreaRoot = Platform.OS === 'web' ? Fragment : SafeAreaProvider;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaRoot>
        <SessionProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <Stack screenOptions={swipeStackOptions}>
              <Stack.Screen name="index" />
              <Stack.Screen name="login" />
              <Stack.Screen name="cadastro" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="cadastrar-lote" />
              <Stack.Screen name="inspecionar/[lotId]" />
              <Stack.Screen name="ler-etiqueta" />
              <Stack.Screen name="dormente/[sleeperId]" />
              <Stack.Screen name="lote/[lotId]" />
              <Stack.Screen name="operadores" />
              <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
            </Stack>
          </ThemeProvider>
        </SessionProvider>
      </SafeAreaRoot>
    </GestureHandlerRootView>
  );
}
