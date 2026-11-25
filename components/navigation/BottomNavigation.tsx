import Ionicons from '@expo/vector-icons/Ionicons';
import type { MaterialTopTabBarProps } from 'expo-router/js-top-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLOR, FONT_SIZE, MIN_TOUCH } from '@/constants/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Ícone de cada aba; o rótulo vem do `title` definido no layout.
const ICONS: Record<string, IconName> = {
  index: 'home-outline',
  dormentes: 'layers-outline',
  perfil: 'person-outline',
};

/** Barra de abas de baixo (Início, Dormentes, Perfil); aba ativa em vermelho. */
export function BottomNavigation({ state, descriptors, navigateToTab, insets }: MaterialTopTabBarProps) {
  return (
    <View style={[styles.container, { paddingBottom: Math.max(6, insets.bottom) }]}>
      <View accessibilityRole="tablist" accessibilityLabel="Navegação principal" style={styles.bar}>
        {state.routes.map((route, i) => {
          const selected = state.index === i;
          const label = descriptors[route.key]?.options.title ?? route.name;
          const color = selected ? COLOR.red : COLOR.textDim;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              onPress={() => navigateToTab(route.key)}
              style={styles.item}
            >
              <Ionicons name={ICONS[route.name] ?? 'ellipse-outline'} size={22} color={color} />
              <Text style={[styles.label, { color }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: COLOR.panel, borderTopWidth: 1, borderTopColor: COLOR.line },
  bar: { flexDirection: 'row' },
  item: { flex: 1, minHeight: MIN_TOUCH + 8, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: FONT_SIZE.caption, fontWeight: '500' },
});
