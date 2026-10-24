import { Redirect, Stack } from 'expo-router';
import { useSession } from '@/contexts/SessionContext';

export default function OperationLayout() {
  const { profile } = useSession();
  if (!profile) return <Redirect href="/login" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
