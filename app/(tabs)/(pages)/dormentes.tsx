import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/ui';
import { COLOR, SPACE } from '@/constants/theme';

// Provisório: a Task 8 traz a lista paginada com busca.
export default function SleepersScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <EmptyState text="Em breve" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.bg, padding: SPACE.lg },
});
