import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Field, OptionPicker, Panel, SectionTitle } from '@/components/ui';
import { COLOR, FONT_SIZE, SPACE } from '@/constants/theme';
import { useSession } from '@/contexts/SessionContext';
import { ApiError, errorMessage, NetworkError } from '@/data/api/client';
import { createSleeper } from '@/data/api/endpoints';
import type { LocationRead, SleeperCreate, SpeciesRead } from '@/data/api/types';
import { getLocations, getSpecies } from '@/data/catalog-cache';
import { fieldFromErrors, parseLength, parseYear, type SleeperFormField } from '@/data/sleeper-form';
import { isValidTag, normalizeTag } from '@/data/tag';
import { uuidv4 } from '@/data/uuid';

type Errors = Partial<Record<SleeperFormField, string>>;

const speciesLabel = (s: SpeciesRead) => s.common_name ?? s.scientific_name ?? s.code;
const orNull = (v: string) => (v.trim() === '' ? null : v.trim());

/** Cadastro de dormente (online): tag pré-preenchida, espécie/local dos catálogos e validação antes de enviar. */
export default function RegisterSleeperScreen() {
  const router = useRouter();
  const { offline } = useSession();
  const params = useLocalSearchParams<{ tag?: string }>();
  const initialTag = normalizeTag(Array.isArray(params.tag) ? params.tag[0] : (params.tag ?? ''));
  // Gerado uma vez ao abrir: toque duplo em "Cadastrar" não cria dois dormentes.
  const clientUuid = useRef(uuidv4()).current;

  const [species, setSpecies] = useState<SpeciesRead[]>([]);
  const [locations, setLocations] = useState<LocationRead[]>([]);
  const [tag, setTag] = useState(initialTag);
  const [speciesId, setSpeciesId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [record, setRecord] = useState('');
  const [woodClass, setWoodClass] = useState('');
  const [length, setLength] = useState('');
  const [treatment, setTreatment] = useState('');
  const [supplier, setSupplier] = useState('');
  const [company, setCompany] = useState('');
  const [year, setYear] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [takenTag, setTakenTag] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([getSpecies(), getLocations()])
      .then(([s, l]) => {
        if (!alive) return;
        setSpecies(s.items);
        setLocations(l.items);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  /** Valida no cliente e devolve o corpo do POST, ou null se houver erro (já exibido). */
  function buildBody(): SleeperCreate | null {
    const next: Errors = {};
    const normalized = normalizeTag(tag);
    if (!isValidTag(normalized)) next.rfid_tag = 'Informe a tag (até 64 caracteres, sem espaços).';
    if (!locationId) next.location_id = 'Escolha o local de entrada.';
    const len = parseLength(length);
    if (len.error) next.length_m = len.error;
    const yr = parseYear(year);
    if (yr.error) next.manufacture_year = yr.error;
    setErrors(next);
    if (Object.keys(next).length > 0 || !locationId) return null;
    return {
      rfid_tag: normalized,
      location_id: locationId,
      species_id: speciesId,
      registration_record: orNull(record),
      wood_class: orNull(woodClass),
      length_m: len.value,
      treatment: orNull(treatment),
      supplier: orNull(supplier),
      inspection_company: orNull(company),
      manufacture_year: yr.value,
      client_uuid: clientUuid,
    };
  }

  async function submit() {
    if (saving) return;
    setMessage(null);
    setTakenTag(null);
    const body = buildBody();
    if (!body) return;
    setSaving(true);
    try {
      const { sleeper } = await createSleeper(body);
      router.replace(`/dormente/${encodeURIComponent(sleeper.rfid_tag)}` as Href);
    } catch (e) {
      if (e instanceof NetworkError) {
        setMessage('Cadastro exige conexão');
      } else if (e instanceof ApiError && e.status === 409 && e.code === 'rfid_tag_taken') {
        setMessage(e.detail);
        setTakenTag(body.rfid_tag);
      } else if (e instanceof ApiError && e.status === 422) {
        setMessage(e.detail);
        const field = fieldFromErrors(e.errors);
        if (field) setErrors({ [field]: e.detail });
      } else {
        setMessage(errorMessage(e));
      }
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      {offline ? <Banner tone="warn" text="Sem conexão — o cadastro exige conexão" /> : null}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Button title="Voltar" icon="arrow-back" variant="ghost" small onPress={() => router.back()} />
          <Panel style={styles.panel}>
            <SectionTitle icon="add-circle-outline" title="Cadastrar dormente" />
            <Field
              label="Tag RFID"
              mono
              value={tag}
              onChangeText={setTag}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            {errors.rfid_tag ? <Text style={styles.error}>{errors.rfid_tag}</Text> : null}
            <OptionPicker
              label="Local de entrada"
              value={locationId}
              onChange={setLocationId}
              options={locations.map((l) => ({ id: l.id, label: l.name }))}
              error={errors.location_id}
              emptyText="Locais indisponíveis sem conexão."
            />
            <OptionPicker
              label="Espécie (opcional)"
              value={speciesId}
              onChange={setSpeciesId}
              clearable
              options={species.map((s) => ({ id: s.id, label: speciesLabel(s) }))}
              error={errors.species_id}
              emptyText="Espécies indisponíveis sem conexão."
            />
            <Field label="Ata" mono value={record} onChangeText={setRecord} autoCapitalize="characters" />
            {errors.registration_record ? <Text style={styles.error}>{errors.registration_record}</Text> : null}
            <Field label="Classe" value={woodClass} onChangeText={setWoodClass} />
            <Field
              label="Comprimento (m)"
              value={length}
              onChangeText={setLength}
              keyboardType="decimal-pad"
              style={errors.length_m ? styles.fieldError : null}
            />
            {errors.length_m ? <Text style={styles.error}>{errors.length_m}</Text> : null}
            <Field label="Tratamento" value={treatment} onChangeText={setTreatment} />
            <Field label="Fornecedor" value={supplier} onChangeText={setSupplier} />
            <Field label="Empresa inspetora" value={company} onChangeText={setCompany} />
            <Field
              label="Ano de fabricação"
              value={year}
              onChangeText={setYear}
              keyboardType="number-pad"
              maxLength={4}
              style={errors.manufacture_year ? styles.fieldError : null}
            />
            {errors.manufacture_year ? <Text style={styles.error}>{errors.manufacture_year}</Text> : null}
          </Panel>

          {message ? <Banner tone="warn" text={message} /> : null}
          {takenTag ? (
            <Button
              title="Abrir o dormente desta tag"
              variant="ghost"
              onPress={() => router.replace(`/dormente/${encodeURIComponent(takenTag)}` as Href)}
            />
          ) : null}
          <View>
            <Button
              title={saving ? 'Cadastrando...' : 'Cadastrar'}
              icon="checkmark-circle-outline"
              disabled={saving || offline}
              onPress={() => void submit()}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.bg },
  flex: { flex: 1 },
  content: { padding: SPACE.lg, gap: SPACE.md },
  panel: { gap: SPACE.md },
  error: { fontSize: FONT_SIZE.caption, color: COLOR.red },
  fieldError: { borderColor: COLOR.red },
});
