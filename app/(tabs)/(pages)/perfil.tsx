import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Label, Panel } from '@/components/ui';
import { COLOR, FONT_CODE, FONT_SIZE, SPACE } from '@/constants/theme';
import { useSession } from '@/contexts/SessionContext';

// Provisório: a Task 8 acrescenta papel, fila e sincronização.
export default function ProfileScreen() {
  const { user, signOut } = useSession();
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Panel style={styles.panel}>
          <Label>Nome</Label>
          <Text style={styles.text}>{user?.name}</Text>
          <Label>Matrícula</Label>
          <Text style={[styles.text, { fontFamily: FONT_CODE }]}>{user?.registration}</Text>
        </Panel>
        <Button title="Sair" variant="ghost" icon="log-out-outline" onPress={() => void signOut()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.bg },
  content: { padding: SPACE.lg, gap: SPACE.md },
  panel: { gap: SPACE.xs },
  text: { fontSize: FONT_SIZE.base, color: COLOR.text, marginBottom: SPACE.sm },
});
