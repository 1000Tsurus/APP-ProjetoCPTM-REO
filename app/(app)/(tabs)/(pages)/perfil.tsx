import { type Href, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ReaderSettings } from '@/components/ReaderSettings';
import { EDGES_BELOW_STRIP } from '@/components/StatusStrip';

import { Badge, Button, Label, Panel, SectionTitle } from '@/components/ui';
import { COLOR, FONT_CODE, FONT_SIZE, SPACE } from '@/constants/theme';
import { useSession } from '@/contexts/SessionContext';
import { label, ROLE_LABEL } from '@/data/labels';
import { useSync } from '@/data/use-sync';

/** Perfil: dados do usuário, leitor, situação da fila, sincronização manual e saída. */
export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useSession();
  const { pending, rejected, syncing, syncNow } = useSync();

  return (
    <SafeAreaView edges={EDGES_BELOW_STRIP} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Panel style={styles.panel}>
          <Label>Nome</Label>
          <Text style={styles.text}>{user?.name}</Text>
          <Label>Matrícula</Label>
          <Text style={[styles.text, { fontFamily: FONT_CODE }]}>{user?.registration}</Text>
          <Label>Papel</Label>
          {user ? <Badge text={label(ROLE_LABEL, user.role)} tone="info" /> : null}
        </Panel>

        <ReaderSettings />

        <Panel style={styles.panel}>
          <SectionTitle icon="cloud-upload-outline" title="Fila de envio" />
          <Text style={styles.text}>Pendentes: {pending}</Text>
          <Text style={styles.text}>Rejeitados: {rejected}</Text>
          <Button title="Ver fila" variant="ghost" small onPress={() => router.push('/fila' as Href)} />
        </Panel>

        <Button
          title={syncing ? 'Sincronizando...' : 'Sincronizar agora'}
          icon="sync-outline"
          disabled={syncing}
          onPress={() => void syncNow()}
        />
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
