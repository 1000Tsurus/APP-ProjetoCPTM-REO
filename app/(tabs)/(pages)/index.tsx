import { type Href, useRouter } from 'expo-router';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, type TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Field, Panel, SectionTitle } from '@/components/ui';
import { COLOR, FONT_SIZE, SPACE } from '@/constants/theme';
import { useSession } from '@/contexts/SessionContext';
import { getSyncStatus } from '@/data/api/endpoints';
import { deviceId } from '@/data/sync';
import { isValidTag, normalizeTag } from '@/data/tag';
import { useSync } from '@/data/use-sync';

/** Início: leitura da tag (campo com foco para o leitor em modo teclado), pendências e último sync. */
export default function HomeScreen() {
  const router = useRouter();
  const { offline } = useSession();
  const { pending, syncing, lastResult } = useSync();
  const [tag, setTag] = useState('');
  const [tagError, setTagError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);

  // Último lote recebido pelo servidor; recarrega quando uma sincronização termina.
  useEffect(() => {
    if (offline || syncing) return;
    let alive = true;
    (async () => {
      try {
        const status = await getSyncStatus(await deviceId());
        if (alive) setLastSync(status.last_batch?.received_at ?? null);
      } catch {
        // Sem rede ou erro: mantém o que já está na tela.
      }
    })();
    return () => {
      alive = false;
    };
  }, [offline, syncing, lastResult]);

  function submit(raw: string) {
    const value = normalizeTag(raw);
    if (!isValidTag(value)) {
      setTagError('Tag inválida.');
      // O leitor termina cada leitura com Enter: o foco precisa ficar no campo.
      inputRef.current?.focus();
      return;
    }
    setTagError(null);
    setTag('');
    router.push(`/dormente/${encodeURIComponent(value)}` as Href);
  }

  return (
    <SafeAreaView style={styles.screen}>
      {offline ? <Banner tone="warn" text="Sem conexão" /> : null}
      {pending > 0 ? (
        <Banner
          tone="warn"
          text={pending === 1 ? '1 registro aguardando envio' : `${pending} registros aguardando envio`}
          action={{ title: 'Ver', onPress: () => router.push('/fila' as Href) }}
        />
      ) : null}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Panel>
          <SectionTitle icon="radio-outline" title="Ler tag" sub="Aproxime o leitor ou digite o código" />
          <Field
            ref={inputRef}
            label="Tag RFID"
            mono
            autoFocus
            blurOnSubmit={false}
            autoCapitalize="characters"
            autoCorrect={false}
            value={tag}
            onChangeText={(v) => {
              setTag(v);
              if (tagError) setTagError(null);
            }}
            onSubmitEditing={(e) => submit(e.nativeEvent.text)}
            returnKeyType="search"
          />
          {tagError ? <Text style={styles.error}>{tagError}</Text> : null}
          <View style={styles.action}>
            <Button title="Buscar" icon="search-outline" onPress={() => submit(tag)} />
          </View>
        </Panel>

        <Panel>
          <SectionTitle icon="sync-outline" title="Sincronização" />
          <Text style={styles.text}>
            {lastSync ? `Último envio: ${new Date(lastSync).toLocaleString('pt-BR')}` : 'Nenhum envio registrado'}
          </Text>
        </Panel>

        <Button
          title="Registrar ocorrência sem dormente"
          variant="ghost"
          icon="alert-circle-outline"
          onPress={() => router.push('/ocorrencia' as Href)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.bg },
  content: { padding: SPACE.lg, gap: SPACE.md },
  text: { fontSize: FONT_SIZE.base, color: COLOR.text },
  error: { fontSize: FONT_SIZE.small, color: COLOR.red, marginTop: SPACE.sm },
  action: { marginTop: SPACE.md },
});
