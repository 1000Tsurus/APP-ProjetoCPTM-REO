import { Redirect } from 'expo-router';

import { SwipeStack as Stack, swipeStackOptions } from '@/components/navigation/SwipeStack';
import { useSession } from '@/contexts/SessionContext';

/** Área logada: sem sessão, volta para o login. */
export default function OperationLayout() {
  const { user } = useSession();
  if (!user) return <Redirect href="/login" />;
  return (
    <Stack screenOptions={swipeStackOptions}>
      <Stack.Screen name="(pages)" />
    </Stack>
  );
}
