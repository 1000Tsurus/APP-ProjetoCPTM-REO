import { type Href, Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, ChoiceRow, Field, OptionPicker, Panel } from '@/components/ui';
import { COLOR, FONT_CODE, FONT_SIZE, SPACE } from '@/constants/theme';
import { useSession } from '@/contexts/SessionContext';
import type { LocationRead, MovementKind } from '@/data/api/types';
import { canFieldWork } from '@/data/auth-store';
import { getLocations } from '@/data/catalog-cache';
import { buildMovement } from '@/data/forms';
import { MOVEMENT_KIND } from '@/data/labels';
import { finishAndLeave, saveToQueue } from '@/data/save-record';
import { normalizeTag } from '@/data/tag';
import { uuidv4 } from '@/data/uuid';

const KINDS = (Object.keys(MOVEMENT_KIND) as MovementKind[]).map((id) => ({ id, label: MOVEMENT_KIND[id] }));

/** Movimentação (entrada, retirada, transferência) gravada na fila e enviada quando houver rede. */
export default function MoveScreen() {
  const router = useRouter();
  const { user, offline } = useSession();
  const params = useLocalSearchParams<{ tag: string }>();
  const tag = normalizeTag(Array.isArray(params.tag) ? params.tag[0] : (params.tag ?? ''));
  // Gerado uma vez ao abrir: toque duplo em "Salvar" não duplica o registro.
  const clientUuid = useRef(uuidv4()).current;

  const [locations, setLocations] = useState<LocationRead[]>([]);
  const [kind, setKind] = useState<MovementKind>('transfer');
  const [locationId, setLocationId] = useState<string | null>(null);
  const [requisition, setRequisition] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    getLocations()
      .then((l) => {
        if (alive) setLocations(l.items);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (!user) return null;
  if (!canFieldWork(user.role)) return <Redirect href={`/dormente/${encodeURIComponent(tag)}` as Href} />;

  const withdrawal = kind === 'withdrawal';

  async function save() {
    if (saving || !user) return;
    const target = locations.find((l) => l.id === locationId);
    const built = buildMovement({
      tag,
      kind,
      toLocationId: withdrawal ? null : locationId,
      toLocationName: target?.name,
      requisitionNumber: requisition,
      notes,
      clientUuid,
      now: new Date(),
    });
    if (built.error !== undefined) {
      setError(built.error);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const message = await saveToQueue(user.id, {
        type: 'movement',
        client_uuid: clientUuid,
        payload: built.payload,
        rfid_tag: built.payload.rfid_tag ?? tag,
        summary: built.summary,
      });
      finishAndLeave(router, message, `/dormente/${encodeURIComponent(tag)}` as Href);
    } catch {
      setError('Não foi possível gravar no aparelho. Tente de novo.');
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      {offline ? <Banner tone="warn" text="Sem conexão — será enviado depois" /> : null}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Button title="Voltar" icon="arrow-back" variant="ghost" small onPress={() => router.back()} />
          <Text style={styles.title}>Movimentar</Text>
          <Text style={[styles.tag, { fontFamily: FONT_CODE }]}>{tag}</Text>
          <Panel style={styles.panel}>
            <ChoiceRow label="Tipo" options={KINDS} value={kind} onChange={setKind} />
            {withdrawal ? (
              <Field
                label="RM (requisição de material)"
                mono
                value={requisition}
                onChangeText={setRequisition}
                autoCapitalize="characters"
                maxLength={40}
              />
            ) : (
              <OptionPicker
                label={kind === 'entry' ? 'Local de entrada' : 'Local de destino'}
                options={locations.map((l) => ({ id: l.id, label: l.name }))}
                value={locationId}
                onChange={setLocationId}
                emptyText="Nenhum local no aparelho. Conecte-se para carregar."
              />
            )}
            <Field label="Observações (opcional)" value={notes} onChangeText={setNotes} multiline maxLength={2000} />
          </Panel>
          {error ? <Banner tone="warn" text={error} /> : null}
          <Button title={saving ? 'Salvando…' : 'Salvar'} icon="checkmark" disabled={saving} onPress={() => void save()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.bg },
  flex: { flex: 1 },
  content: { padding: SPACE.lg, gap: SPACE.md },
  title: { fontSize: 20, fontWeight: '600', color: COLOR.text },
  tag: { fontSize: FONT_SIZE.base, color: COLOR.textDim },
  panel: { gap: SPACE.md },
});
