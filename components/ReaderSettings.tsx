import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Panel, SectionTitle } from '@/components/ui';
import { COLOR, FONT_CODE, FONT_SIZE, SPACE } from '@/constants/theme';
import { useReader, useReaderSettings, type ReaderHandle } from '@/contexts/ReaderContext';
import { useReaderStatus } from '@/contexts/useReaderStatus';
import { sortBonded } from '@/data/reader/bonded';
import { isAvailable, listBonded, requestPermissions, type BondedDevice } from '@/modules/reo-bluetooth';

/** Motivo da última falha de conexão do leitor (vazio no teclado ou depois de conectar). */
function useLastError(reader: ReaderHandle): string | null {
  const [reason, setReason] = useState<string | null>(reader.lastError?.() ?? null);
  useEffect(() => {
    setReason(reader.lastError?.() ?? null);
    const offError = reader.onReaderError?.(() => setReason(reader.lastError?.() ?? null));
    // Ao conectar o motivo some; o status avisa a mudança.
    const offStatus = reader.subscribe(
      () => {},
      () => setReason(reader.lastError?.() ?? null),
    );
    return () => {
      offError?.();
      offStatus();
    };
  }, [reader]);
  return reason;
}

/** Seção "Leitor" do Perfil: status, escolha do leitor Bluetooth pareado e esquecer o leitor. */
export function ReaderSettings() {
  const { text } = useReaderStatus();
  const reader = useReader();
  const reason = useLastError(reader);
  const { saved, choose, forget } = useReaderSettings();
  const [devices, setDevices] = useState<BondedDevice[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const available = isAvailable();

  const pick = async () => {
    setMessage(null);
    try {
      if (!(await requestPermissions())) {
        setMessage('Permita o Bluetooth para usar o leitor.');
        return;
      }
      const list = sortBonded(await listBonded());
      setDevices(list);
      if (list.length === 0) setMessage('Pareie o REO-Leitor nas configurações de Bluetooth do Android.');
    } catch (e) {
      // O módulo nativo já manda o motivo em português (ex.: Bluetooth desligado).
      setMessage(e instanceof Error && e.message ? e.message : 'Não foi possível listar os aparelhos pareados.');
    }
  };

  return (
    <Panel style={styles.panel}>
      <SectionTitle icon="radio-outline" title="Leitor" />
      <Text style={styles.text}>{text}</Text>
      {reason ? <Text style={styles.text}>{reason}</Text> : null}
      {saved ? (
        <Text style={styles.text}>
          {saved.name} <Text style={styles.code}>{saved.address}</Text>
        </Text>
      ) : null}
      {!available ? (
        <Text style={styles.text}>Leitor Bluetooth disponível só no app instalado (não no Expo Go).</Text>
      ) : (
        <>
          <Button title="Escolher leitor" variant="ghost" small onPress={() => void pick()} />
          {saved ? (
            <Button
              title="Esquecer leitor"
              variant="ghost"
              small
              onPress={() => {
                setDevices(null);
                setMessage(null);
                forget().catch(() => setMessage('Não foi possível salvar o leitor.'));
              }}
            />
          ) : null}
        </>
      )}
      {message ? <Text style={styles.text}>{message}</Text> : null}
      {devices?.map((d) => (
        <View key={d.address} style={styles.row}>
          <View style={styles.flex}>
            <Text style={styles.name}>{d.name}</Text>
            <Text style={[styles.code, styles.text]}>{d.address}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Usar ${d.name}`}
            onPress={() => {
              setDevices(null);
              choose({ address: d.address, name: d.name }).catch(() => setMessage('Não foi possível salvar o leitor.'));
            }}
          >
            <Text style={styles.use}>Usar este</Text>
          </Pressable>
        </View>
      ))}
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: { gap: SPACE.xs },
  text: { fontSize: FONT_SIZE.base, color: COLOR.text, marginBottom: SPACE.sm },
  code: { fontFamily: FONT_CODE },
  name: { fontSize: FONT_SIZE.base, color: COLOR.text, fontWeight: '600' },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.sm },
  use: { fontSize: FONT_SIZE.base, color: COLOR.blue, fontWeight: '600', padding: SPACE.sm },
});
