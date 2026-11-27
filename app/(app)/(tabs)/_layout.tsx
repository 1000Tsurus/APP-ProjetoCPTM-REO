import { SwipeStack as Stack, swipeStackOptions } from '@/components/navigation/SwipeStack';

/** Abas principais; a faixa de status e a checagem de sessão ficam no layout de `(app)`. */
export default function TabsLayout() {
  return (
    <Stack screenOptions={swipeStackOptions}>
      <Stack.Screen name="(pages)" />
    </Stack>
  );
}
