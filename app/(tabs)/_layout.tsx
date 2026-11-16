import { Redirect } from 'expo-router';
import { SwipeStack as Stack, swipeStackOptions } from '@/components/navigation/SwipeStack';
import { useSession } from '@/contexts/SessionContext';

export default function OperationLayout() {
  const { profile } = useSession();
  if (!profile) return <Redirect href="/login" />;
  return (
    <Stack screenOptions={swipeStackOptions}>
      <Stack.Screen name="(pages)" />
      <Stack.Screen name="editar-perfil" />
      <Stack.Screen name="two" />
    </Stack>
  );
}
