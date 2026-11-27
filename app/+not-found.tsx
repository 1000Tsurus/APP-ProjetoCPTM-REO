import { Stack, useRouter } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { COLOR, FONT_SIZE, SPACE } from '@/constants/theme';

/** Rota inexistente: avisa e leva de volta ao início. */
export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ title: 'Não encontrada' }} />
      <SafeAreaView style={styles.screen}>
        <Text style={styles.title}>Tela não encontrada</Text>
        <Text style={styles.text}>O endereço aberto não existe neste aplicativo.</Text>
        <Button title="Ir para o início" icon="home-outline" onPress={() => router.replace('/')} />
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.bg, padding: SPACE.lg, gap: SPACE.md, justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '600', color: COLOR.text },
  text: { fontSize: FONT_SIZE.base, color: COLOR.textDim },
});
