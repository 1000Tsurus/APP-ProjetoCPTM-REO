import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import type { MaterialTopTabBarProps } from 'expo-router/js-top-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export function BottomNavigation({ state, navigateToTab, insets }: MaterialTopTabBarProps) {
  const router = useRouter();
  const current = state.routes[state.index]?.name;
  function page(name: string) {
    const route = state.routes.find((item) => item.name === name);
    if (route) navigateToTab(route.key);
  }
  function panel(open: 'scan' | 'history' | 'settings') {
    router.navigate({
      pathname: current === 'lotes' ? '/(tabs)/(pages)/lotes' : '/(tabs)/(pages)',
      params: { open, request: String(Date.now()) },
    });
  }
  const lastIsSettings = current === 'lotes';
  return (
    <View style={[styles.container, { paddingBottom: Math.max(14, insets.bottom) }]}>
      <View accessibilityLabel="Navegação principal" style={styles.bar}>
        {item('Início', 'grid-outline', current === 'index', () => page('index'))}
        {item('Lotes', 'layers-outline', current === 'lotes', () => page('lotes'))}
        <Pressable accessibilityRole="button" accessibilityLabel="Ler QR Code ou NFC"
          onPress={() => panel('scan')} style={styles.scan}>
          <Ionicons name="qr-code-outline" size={28} color="#fff" />
        </Pressable>
        {item('Histórico', 'time-outline', false, () => panel('history'))}
        {item(lastIsSettings ? 'Ajustes' : 'Perfil', lastIsSettings ? 'options-outline' : 'person-outline',
          current === 'perfil', () => lastIsSettings ? panel('settings') : page('perfil'))}
      </View>
    </View>
  );
}

function item(label: string, icon: React.ComponentProps<typeof Ionicons>['name'], selected: boolean, onPress: () => void) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} aria-pressed={selected}
    onPress={onPress} style={styles.item}>
    <Ionicons name={icon} size={22} color={selected ? '#ff5964' : '#c7cdcd'} />
    <Text style={styles.label}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, backgroundColor: '#f7f8f9' },
  bar: { width: '100%', maxWidth: 450, minHeight: 74, borderRadius: 40, backgroundColor: '#303636',
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  item: { flex: 1, minHeight: 58, borderRadius: 30, alignItems: 'center', justifyContent: 'center', gap: 4 },
  label: { color: '#fff', fontSize: 11 },
  scan: { width: 56, height: 56, borderRadius: 28, marginHorizontal: 3, backgroundColor: '#e62328',
    alignItems: 'center', justifyContent: 'center' },
});
