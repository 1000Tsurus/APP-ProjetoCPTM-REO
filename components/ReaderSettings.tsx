import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Panel, SectionTitle } from '@/components/ui';
import { COLOR, FONT_CODE, FONT_SIZE, SPACE } from '@/constants/theme';
import { useReaderSettings } from '@/contexts/ReaderContext';
import { useReaderStatus } from '@/contexts/useReaderStatus';
import { sortBonded } from '@/data/reader/bonded';
import { isAvailable, listBonded, requestPermissions, type BondedDevice } from '@/modules/reo-bluetooth';

/** Seção "Leitor" do Perfil: status, escolha do leitor Bluetooth pareado e esquecer o leitor. */
export function ReaderSettings() {
  const { text } = useReaderStatus();
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
    } catch {
      setMessage('Não foi possível listar os aparelhos pareados.');
    }
  };

  return (
    <Panel style={styles.panel}>
      <SectionTitle icon="radio-outline" title="Leitor" />
      <Text style={styles.text}>{text}</Text>
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
                void forget();
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
              void choose({ address: d.address, name: d.name });
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
