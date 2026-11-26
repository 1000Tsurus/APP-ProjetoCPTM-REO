import { type Href, Redirect, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, ChoiceRow, Field, OptionPicker, Panel } from '@/components/ui';
import { COLOR, FONT_CODE, FONT_SIZE, SPACE } from '@/constants/theme';
import { useSession } from '@/contexts/SessionContext';
import type { LocationRead, OccurrenceKind } from '@/data/api/types';
import { canFieldWork } from '@/data/auth-store';
import { getLocations } from '@/data/catalog-cache';
import { buildOccurrence } from '@/data/forms';
import { OCCURRENCE_KIND } from '@/data/labels';
import { finishAndLeave, saveToQueue } from '@/data/save-record';
import { normalizeTag } from '@/data/tag';
import { uuidv4 } from '@/data/uuid';

const KINDS = (Object.keys(OCCURRENCE_KIND) as OccurrenceKind[]).map((id) => ({ id, label: OCCURRENCE_KIND[id] }));

/**
 * Formulário de ocorrência. Com `tag` vem do dormente; sem tag o operador informa a tag
 * (opcional) e/ou escolhe o local — a API exige pelo menos um dos dois.
 */
export function OccurrenceForm({ tag: fixedTag }: { tag?: string }) {
  const router = useRouter();
  const { user } = useSession();
  // Gerado uma vez ao abrir: toque duplo em "Salvar" não duplica o registro.
  const clientUuid = useRef(uuidv4()).current;
  // Trava síncrona contra toque duplo (o estado `saving` só muda no próximo render).
  const submitting = useRef(false);

  const [locations, setLocations] = useState<LocationRead[]>([]);
  const [typedTag, setTypedTag] = useState('');
  const [locationId, setLocationId] = useState<string | null>(null);
  const [kind, setKind] = useState<OccurrenceKind>('damage');
  const [description, setDescription] = useState('');
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
  // Supervisor só consulta: leva de volta ao dormente (ou ao Início) em vez de tela em branco.
  if (!canFieldWork(user.role)) {
    const back = fixedTag ? `/dormente/${encodeURIComponent(normalizeTag(fixedTag))}` : '/';
    return <Redirect href={back as Href} />;
  }

  const tag = normalizeTag(fixedTag ?? typedTag);
  // Sem tag fixa, volta ao Início (raiz); com tag, à tela do dormente.
  const leaveTo = (fixedTag ? `/dormente/${encodeURIComponent(tag)}` : '/') as Href;

  async function save() {
    if (submitting.current || saving || !user) return;
    const built = buildOccurrence({ tag, locationId, kind, description, clientUuid, now: new Date() });
    if (built.error !== undefined) {
      setError(built.error);
      return;
    }
    setError(null);
    submitting.current = true;
    setSaving(true);
    try {
      const message = await saveToQueue(user.id, {
        type: 'occurrence',
        client_uuid: clientUuid,
        payload: built.payload,
        rfid_tag: built.payload.rfid_tag ?? null,
        summary: built.summary,
      });
      finishAndLeave(router, message, leaveTo);
    } catch {
      setError('Não foi possível gravar no aparelho. Tente de novo.');
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Button title="Voltar" icon="arrow-back" variant="ghost" small onPress={() => router.back()} />
          <Text style={styles.title}>Ocorrência</Text>
          {fixedTag ? <Text style={[styles.tag, { fontFamily: FONT_CODE }]}>{tag}</Text> : null}
          <Panel style={styles.panel}>
            {fixedTag ? null : (
              <>
                <Field
                  label="Tag RFID (opcional)"
                  mono
                  value={typedTag}
                  onChangeText={setTypedTag}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={64}
                />
                <OptionPicker
                  label="Local"
                  options={locations.map((l) => ({ id: l.id, label: l.name }))}
                  value={locationId}
                  onChange={setLocationId}
                  clearable
                  placeholder="Escolher o local"
                  emptyText="Nenhum local no aparelho. Conecte-se para carregar."
                />
              </>
            )}
            <ChoiceRow label="Tipo" options={KINDS} value={kind} onChange={setKind} />
            <Field label="Descrição" value={description} onChangeText={setDescription} multiline maxLength={2000} />
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
