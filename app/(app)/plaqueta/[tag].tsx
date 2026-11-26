import { type Href, Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SleeperPlateForm, type PlateValues } from '@/components/SleeperPlateForm';
import { EDGES_BELOW_STRIP } from '@/components/StatusStrip';
import { Banner, Button } from '@/components/ui';
import { COLOR, FONT_CODE, SPACE } from '@/constants/theme';
import { useSession } from '@/contexts/SessionContext';
import { ApiError, errorMessage, NetworkError } from '@/data/api/client';
import { updateSleeper } from '@/data/api/endpoints';
import type { SleeperRead, SpeciesRead } from '@/data/api/types';
import { canEditSpecies, canFieldWork } from '@/data/auth-store';
import { getSpecies, lookupSleeper } from '@/data/catalog-cache';
import { removeIncomplete } from '@/data/incomplete';
import { buildPlateUpdate, fieldFromErrors, type SleeperFormField } from '@/data/sleeper-form';
import { normalizeTag } from '@/data/tag';

const EMPTY: PlateValues = {
  registration_record: '', wood_class: '', length_m: '', treatment: '',
  supplier: '', inspection_company: '', manufacture_year: '', species_id: '',
};

/** Valores atuais do dormente como texto do formulário (comprimento com vírgula, como o operador digita). */
function toValues(s: SleeperRead): PlateValues {
  const hasLength = s.length_m !== null && s.length_m !== undefined && s.length_m !== '';
  return {
    registration_record: s.registration_record ?? '',
    wood_class: s.wood_class ?? '',
    length_m: hasLength ? String(Number(s.length_m)).replace('.', ',') : '',
    treatment: s.treatment ?? '',
    supplier: s.supplier ?? '',
    inspection_company: s.inspection_company ?? '',
    manufacture_year: s.manufacture_year === null ? '' : String(s.manufacture_year),
    species_id: s.species?.id ?? '',
  };
}

/** Plaqueta do dormente: completa ou corrige os dados da ficha (PATCH, exige conexão). */
export default function PlateScreen() {
  const router = useRouter();
  const { user } = useSession();
  const params = useLocalSearchParams<{ tag: string }>();
  const tag = normalizeTag(Array.isArray(params.tag) ? params.tag[0] : (params.tag ?? ''));
  // Trava síncrona contra toque duplo (o estado `saving` só muda no próximo render).
  const submitting = useRef(false);

  const [sleeper, setSleeper] = useState<SleeperRead | null>(null);
  const [values, setValues] = useState<PlateValues>(EMPTY);
  const [species, setSpecies] = useState<SpeciesRead[]>([]);
  const [errors, setErrors] = useState<Partial<Record<SleeperFormField, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    lookupSleeper(tag)
      .then((r) => {
        if (!alive) return;
        if ('sleeper' in r) {
          setSleeper(r.sleeper);
          setValues(toValues(r.sleeper));
        } else {
          setMessage('notFound' in r ? 'Nenhum dormente usa esta tag.' : 'Sem conexão — não foi possível abrir esta tag.');
        }
      })
      .catch((e) => {
        if (alive) setMessage(errorMessage(e));
      });
    getSpecies()
      .then((s) => {
        if (alive) setSpecies(s.items);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [tag]);

  if (!user) return null;
  // Supervisor só consulta: volta para a ficha.
  if (!canFieldWork(user.role)) return <Redirect href={`/dormente/${encodeURIComponent(tag)}` as Href} />;
  const userId = user.id;
  const mayEditSpecies = canEditSpecies(user.role);

  async function save() {
    if (submitting.current || saving || !sleeper) return;
    setMessage(null);
    const built = buildPlateUpdate(values, mayEditSpecies);
    if ('error' in built) {
      setErrors({ [built.field]: built.error });
      return;
    }
    setErrors({});
    submitting.current = true;
    setSaving(true);
    try {
      await updateSleeper(sleeper.id, built.payload);
      try {
        await removeIncomplete(userId, tag);
      } catch {
        // A plaqueta já foi salva; a pendência local some na próxima conferência.
      }
      Alert.alert('Plaqueta salva.');
      router.back();
    } catch (e) {
      if (e instanceof NetworkError) {
        setMessage('A plaqueta precisa de conexão.');
      } else if (e instanceof ApiError && e.status === 422) {
        setMessage(e.detail);
        const field = fieldFromErrors(e.errors);
        if (field) setErrors({ [field]: e.detail });
      } else {
        setMessage(errorMessage(e));
      }
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <SafeAreaView edges={EDGES_BELOW_STRIP} style={styles.screen}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Button title="Voltar" icon="arrow-back" variant="ghost" small onPress={() => router.back()} />
          <Text style={styles.title}>Completar plaqueta</Text>
          <Text style={styles.tag}>{tag}</Text>
          {message ? <Banner tone="warn" text={message} /> : null}
          {sleeper ? (
            <>
              <SleeperPlateForm
                values={values}
                onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
                errors={errors}
                species={species}
                canEditSpecies={mayEditSpecies}
              />
              <View>
                <Button
                  title={saving ? 'Salvando...' : 'Salvar plaqueta'}
                  icon="checkmark-circle-outline"
                  disabled={saving}
                  onPress={() => void save()}
                />
              </View>
            </>
          ) : message ? null : (
            <ActivityIndicator color={COLOR.red} />
          )}
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
  tag: { fontSize: 14, color: COLOR.textDim, fontFamily: FONT_CODE },
});
