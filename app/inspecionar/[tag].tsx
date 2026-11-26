import { type Href, Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, ChoiceRow, Field, OptionPicker, Panel } from '@/components/ui';
import { COLOR, FONT_CODE, FONT_SIZE, SPACE } from '@/constants/theme';
import { useSession } from '@/contexts/SessionContext';
import type { ConservationState, InspectionResult, MoistureLevel, SpeciesRead } from '@/data/api/types';
import { canInspect } from '@/data/auth-store';
import { getSpecies } from '@/data/catalog-cache';
import { buildInspection } from '@/data/forms';
import { CONSERVATION, INSPECTION_RESULT, MOISTURE, speciesLabel } from '@/data/labels';
import { finishAndLeave, saveToQueue } from '@/data/save-record';
import { normalizeTag } from '@/data/tag';
import { uuidv4 } from '@/data/uuid';

type YesNo = 'yes' | 'no';
const YES_NO = [
  { id: 'yes' as const, label: 'Sim' },
  { id: 'no' as const, label: 'Não' },
];
const CONSERVATION_OPTIONS = (Object.keys(CONSERVATION) as ConservationState[]).map((id) => ({ id, label: CONSERVATION[id] }));
const MOISTURE_OPTIONS = (Object.keys(MOISTURE) as MoistureLevel[]).map((id) => ({ id, label: MOISTURE[id] }));
const RESULT_OPTIONS = (Object.keys(INSPECTION_RESULT) as InspectionResult[]).map((id) => ({
  id,
  label: INSPECTION_RESULT[id].label,
}));
const SPECIES_OPTIONS = [
  { id: 'yes' as const, label: 'Confirmada' },
  { id: 'no' as const, label: 'Corrigir' },
];


/** Checklist de inspeção (técnico, especialista, admin) gravado na fila; mede o tempo desde a abertura. */
export default function InspectScreen() {
  const router = useRouter();
  const { user, offline } = useSession();
  const params = useLocalSearchParams<{ tag: string }>();
  const tag = normalizeTag(Array.isArray(params.tag) ? params.tag[0] : (params.tag ?? ''));
  // Gerados uma vez ao abrir: o cronômetro vira duration_seconds e o UUID evita duplicar no toque duplo.
  const clientUuid = useRef(uuidv4()).current;
  // Trava síncrona contra toque duplo (o estado `saving` só muda no próximo render).
  const submitting = useRef(false);
  const startedAt = useRef(new Date()).current;

  const [species, setSpecies] = useState<SpeciesRead[]>([]);
  const [conservation, setConservation] = useState<ConservationState | null>(null);
  const [cracks, setCracks] = useState<YesNo | null>(null);
  const [biological, setBiological] = useState<YesNo | null>(null);
  const [moisture, setMoisture] = useState<MoistureLevel | null>(null);
  const [life, setLife] = useState('');
  const [speciesCheck, setSpeciesCheck] = useState<YesNo | null>(null);
  const [correctedId, setCorrectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<InspectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    getSpecies()
      .then((s) => {
        if (alive) setSpecies(s.items);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (!user) return null;
  if (!canInspect(user.role)) return <Redirect href={`/dormente/${encodeURIComponent(tag)}` as Href} />;

  async function save() {
    if (submitting.current || saving || !user) return;
    if (!conservation || !cracks || !biological || !moisture || !result) {
      setError('Preencha conservação, rachaduras, ataque biológico, umidade e resultado.');
      return;
    }
    const lifeText = life.trim();
    const built = buildInspection({
      tag,
      startedAt,
      now: new Date(),
      conservation,
      hasCracks: cracks === 'yes',
      biologicalAttack: biological === 'yes',
      moisture,
      estimatedLifeYears: lifeText === '' ? undefined : Number(lifeText),
      speciesConfirmed: speciesCheck === null ? undefined : speciesCheck === 'yes',
      speciesCorrectedId: correctedId,
      notes,
      result,
      clientUuid,
    });
    if (built.error !== undefined) {
      setError(built.error);
      return;
    }
    setError(null);
    submitting.current = true;
    setSaving(true);
    try {
      const message = await saveToQueue(user.id, {
        type: 'inspection',
        client_uuid: clientUuid,
        payload: built.payload,
        rfid_tag: built.payload.rfid_tag ?? tag,
        summary: built.summary,
      });
      finishAndLeave(router, message, `/dormente/${encodeURIComponent(tag)}` as Href);
    } catch {
      setError('Não foi possível gravar no aparelho. Tente de novo.');
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      {offline ? <Banner tone="warn" text="Sem conexão — será enviado depois" /> : null}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Button title="Voltar" icon="arrow-back" variant="ghost" small onPress={() => router.back()} />
          <Text style={styles.title}>Inspecionar</Text>
          <Text style={[styles.tag, { fontFamily: FONT_CODE }]}>{tag}</Text>
          <Panel style={styles.panel}>
            <ChoiceRow label="Conservação" options={CONSERVATION_OPTIONS} value={conservation} onChange={setConservation} />
            <ChoiceRow label="Rachaduras" options={YES_NO} value={cracks} onChange={setCracks} />
            <ChoiceRow label="Ataque biológico" options={YES_NO} value={biological} onChange={setBiological} />
            <ChoiceRow label="Umidade" options={MOISTURE_OPTIONS} value={moisture} onChange={setMoisture} />
            <Field
              label="Vida útil estimada (anos, opcional)"
              value={life}
              onChangeText={setLife}
              keyboardType="number-pad"
              maxLength={3}
            />
            <ChoiceRow label="Espécie" options={SPECIES_OPTIONS} value={speciesCheck} onChange={setSpeciesCheck} />
            {speciesCheck === 'no' ? (
              <OptionPicker
                label="Espécie correta"
                options={species.map((s) => ({ id: s.id, label: speciesLabel(s) }))}
                value={correctedId}
                onChange={setCorrectedId}
                emptyText="Nenhuma espécie no aparelho. Conecte-se para carregar."
              />
            ) : null}
            <Field label="Observações (opcional)" value={notes} onChangeText={setNotes} multiline maxLength={4000} />
            <ChoiceRow label="Resultado" options={RESULT_OPTIONS} value={result} onChange={setResult} />
          </Panel>
          {result === 'rejected' ? (
            <Banner tone="info" text="Reprovar coloca o dormente em quarentena quando o envio for aceito." />
          ) : null}
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
