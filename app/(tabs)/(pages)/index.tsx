import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Panel, SectionTitle } from '@/components/ui';
import { COLOR, FONT_SIZE, SPACE } from '@/constants/theme';
import { useSession } from '@/contexts/SessionContext';

// Provisório: a Task 8 substitui por leitura de tag, pendências e atalhos.
export default function HomeScreen() {
  const { user } = useSession();
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Panel>
          <SectionTitle icon="home-outline" title="Início" />
          <Text style={styles.text}>{user?.name}</Text>
        </Panel>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.bg },
  content: { padding: SPACE.lg, gap: SPACE.md },
  text: { fontSize: FONT_SIZE.base, color: COLOR.text },
});
