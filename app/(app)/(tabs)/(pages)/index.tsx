import { type Href, useRouter } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EDGES_BELOW_STRIP } from '@/components/StatusStrip';
import { Banner, Button } from '@/components/ui';
import { COLOR, SPACE } from '@/constants/theme';
import { useSession } from '@/contexts/SessionContext';
import { canFieldWork } from '@/data/auth-store';

// Tarefas do lote, na ordem do Início; o path é a parte em português de /lote/<tarefa>.
const TASKS = [
  { path: 'receber', title: 'Receber', icon: 'download-outline' },
  { path: 'transferir', title: 'Transferir', icon: 'swap-horizontal-outline' },
  { path: 'retirar', title: 'Retirar', icon: 'exit-outline' },
  { path: 'ocorrencia', title: 'Ocorrência', icon: 'warning-outline' },
] as const;

/** Início: quatro botões grandes de lote para quem trabalha em campo; supervisor só consulta. */
export default function HomeScreen() {
  const router = useRouter();
  const { user } = useSession();
  const field = !!user && canFieldWork(user.role);

  return (
    <SafeAreaView edges={EDGES_BELOW_STRIP} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {field ? (
          TASKS.map((t) => (
            <Button
              key={t.path}
              title={t.title}
              icon={t.icon}
              large
              onPress={() => router.push(`/lote/${t.path}` as Href)}
            />
          ))
        ) : (
          <Banner tone="info" text="Seu perfil só consulta. Use a aba Consultar." />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.bg },
  content: { padding: SPACE.lg, gap: SPACE.md },
});
