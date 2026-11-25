import { TopTabs } from 'expo-router/js-top-tabs';
import { useWindowDimensions } from 'react-native';

import { BottomNavigation } from '@/components/navigation/BottomNavigation';

export default function PagesLayout() {
  const { width } = useWindowDimensions();
  return (
    <TopTabs backBehavior="history" initialLayout={{ width }} tabBarPosition="bottom" tabBar={BottomNavigation}
      screenOptions={{ swipeEnabled: true, animationEnabled: true, lazy: true }}>
      <TopTabs.Screen name="index" options={{ title: 'Início' }} />
      <TopTabs.Screen name="dormentes" options={{ title: 'Dormentes' }} />
      <TopTabs.Screen name="perfil" options={{ title: 'Perfil' }} />
    </TopTabs>
  );
}
