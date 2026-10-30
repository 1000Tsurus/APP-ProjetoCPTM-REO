import Ionicons from '@expo/vector-icons/Ionicons';
import Slider from '@react-native-community/slider';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/contexts/SessionContext';
import { completeInspection, diagnosisMissing, getOrCreateCurrentInspection, PHOTO_CATEGORIES, readStore, saveDiagnosis, saveEvidence,
  type Evidence, type Evaluation, type Inspection, type Lot, type Material, type PhotoCategory } from '@/data/inspection-store';
import { persistPhoto, removePhoto, resolvePhoto } from '@/data/photo-storage';

const MATERIALS: Material[] = ['Ipê', 'Aroeira', 'Eucalipto', 'Concreto'];
type Draft = Pick<Inspection, 'material' | 'condition' | 'cracks' | 'humidity' | 'residualYears'>;
const draftOf = (item: Inspection): Draft => ({ material: item.material, condition: item.condition, cracks: item.cracks, humidity: item.humidity, residualYears: item.residualYears });

export default function InspectScreen() {
  const { lotId } = useLocalSearchParams<{ lotId: string }>();
  const router = useRouter();
  const { profile } = useSession();
  const { width } = useWindowDimensions();
  const [lot, setLot] = useState<Lot | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const [photos, setPhotos] = useState<Evidence[]>([]);
  const [photoUris, setPhotoUris] = useState<Partial<Record<PhotoCategory, string>>>({});
  const [step, setStep] = useState<'diagnosis' | 'photos'>('diagnosis');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState<PhotoCategory | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [captureUri, setCaptureUri] = useState<string | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState('');
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disablePrevention = usePreventRemove(!!inspection, ({ repeat }) => {
    flush(step).then(repeat).catch(() => setError('Não foi possível salvar. Tente novamente antes de sair.'));
  });

  const refresh = useCallback(async () => {
    if (!lotId || !profile) return;
    const current = await getOrCreateCurrentInspection(lotId, profile.matriculaOuEmail);
    const store = await readStore();
    setLot(store.lots.find((item) => item.id === lotId) || null);
    setInspection(current);
    if (!current) return;
    const nextDraft = draftOf(current);
    setDraft(nextDraft); draftRef.current = nextDraft;
    setStep(current.step === 'photos' || diagnosisMissing(current).length === 0 ? 'photos' : 'diagnosis');
    const evidence = store.evidence.filter((item) => item.inspectionId === current.id);
    setPhotos(evidence);
    const resolved: Partial<Record<PhotoCategory, string>> = {};
    for (const photo of evidence) {
      const uri = await resolvePhoto(photo.uri);
      if (uri) resolved[photo.category] = uri;
    }
    setPhotoUris(resolved);
  }, [lotId, profile]);

  useEffect(() => { refresh().catch((cause) => setError(cause instanceof Error ? cause.message : 'Não foi possível abrir a inspeção.')); }, [refresh]);
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  function update(changes: Partial<Draft>) {
    if (!draft || !inspection) return;
    const next = { ...draft, ...changes };
    draftRef.current = next; setDraft(next); setError('');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveDiagnosis(inspection.id, next).catch(() => setError('Não foi possível salvar o rascunho.')), 550);
  }

  async function flush(stepOverride?: 'diagnosis' | 'photos') {
    if (!inspection || !draftRef.current) return;
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    await saveDiagnosis(inspection.id, { ...draftRef.current, ...(stepOverride ? { step: stepOverride } : {}) });
  }

  async function leave() {
    try { await flush(step); disablePrevention(); router.replace('/(tabs)/lotes'); }
    catch { setError('Não foi possível salvar. Tente novamente antes de sair.'); }
  }

  async function goPhotos() {
    if (!inspection || !draftRef.current) return;
    const missing = diagnosisMissing({ ...inspection, ...draftRef.current });
    if (missing.length) { setError(`Preencha: ${missing.join(', ')}.`); return; }
    try { await flush('photos'); setStep('photos'); setError(''); }
    catch { setError('Não foi possível salvar o diagnóstico.'); }
  }

  async function openPhoto(target: PhotoCategory) {
    setCategory(target); setCaptureUri(null); setCameraError('');
    if (Platform.OS === 'web') {
      try {
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
        if (!result.canceled && result.assets[0]?.uri) { setCaptureUri(result.assets[0].uri); setCameraOpen(true); }
      } catch { setError('Não foi possível selecionar a imagem neste navegador.'); }
      return;
    }
    try {
      if (!permission?.granted) {
        const result = await requestPermission();
        if (!result.granted) { setError(result.canAskAgain ? 'Permita o acesso à câmera para registrar evidências.' : 'Acesso à câmera negado. Habilite a permissão nos ajustes do dispositivo.'); return; }
      }
      setCameraReady(false); setCameraOpen(true);
    } catch { setError('Não foi possível abrir a câmera.'); }
  }

  async function takePhoto() {
    if (!cameraReady || !camera.current) return;
    setBusy(true);
    try { const picture = await camera.current.takePictureAsync({ quality: 0.85 }); if (picture?.uri) setCaptureUri(picture.uri); }
    catch { setCameraError('Falha ao capturar. Tente novamente.'); }
    finally { setBusy(false); }
  }

  async function usePhoto() {
    if (!captureUri || !category || !inspection || busy) return;
    setBusy(true);
    let uri: string | null = null;
    let committed = false;
    try {
      uri = await persistPhoto(captureUri, inspection.id, category);
      const previous = await saveEvidence(inspection.id, category, uri);
      committed = true;
      if (previous) await removePhoto(previous.uri).catch(() => undefined);
      setCameraOpen(false); setCaptureUri(null); setCategory(null);
      await refresh();
    } catch {
      if (uri && !committed) await removePhoto(uri).catch(() => undefined);
      setCameraError('Não foi possível salvar a fotografia. A imagem anterior foi preservada.');
    } finally { setBusy(false); }
  }

  async function finish() {
    if (!inspection || !draftRef.current || busy) return;
    const missing = diagnosisMissing({ ...inspection, ...draftRef.current });
    if (missing.length) { setStep('diagnosis'); setError(`Preencha: ${missing.join(', ')}.`); return; }
    const absent = PHOTO_CATEGORIES.filter((item) => !photoUris[item.id]);
    if (absent.length) { setStep('photos'); setError(`Fotografias pendentes: ${absent.map((item) => item.label).join(', ')}.`); return; }
    const confirm = async (evaluation: Evaluation) => {
      setBusy(true);
      try {
        await flush('photos');
        await completeInspection(inspection.id, evaluation);
        const store = await readStore();
        const completed = store.inspections.filter((item) => item.lotId === lotId && item.status === 'completed').length;
        if (lot && completed < lot.total) {
          if (Platform.OS === 'web') window.alert('Inspeção concluída. O próximo dormente está disponível.');
          else Alert.alert('Inspeção concluída', 'O próximo dormente está disponível.');
          await refresh();
        } else { disablePrevention(); router.replace('/(tabs)/lotes'); }
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a inspeção.'); }
      finally { setBusy(false); }
    };
    if (Platform.OS === 'web') {
      const answer = window.prompt('Classificação manual: digite A para aprovado, R para reprovado ou deixe vazio para sem classificação. Cancelar mantém o rascunho.');
      if (answer === null) return;
      const value = answer.trim().toUpperCase();
      if (!['', 'A', 'R'].includes(value)) { setError('Use A, R ou deixe vazio para sem classificação.'); return; }
      await confirm(value === 'A' ? 'approved' : value === 'R' ? 'rejected' : 'unclassified');
    } else Alert.alert('Finalizar inspeção', 'Confirme a conclusão e selecione a classificação manual. Não há regra automática de aprovação.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sem classificação', onPress: () => confirm('unclassified') },
      { text: 'Reprovado', onPress: () => confirm('rejected') },
      { text: 'Aprovado', onPress: () => confirm('approved') },
    ]);
  }

  const filled = draft ? [draft.material, draft.condition, draft.cracks, draft.humidity, draft.residualYears].filter((value) => value !== null).length + PHOTO_CATEGORIES.filter((item) => !!photoUris[item.id]).length : 0;
  if (!lot || !inspection || !draft) return <SafeAreaView style={styles.screen}><View style={styles.center}><Text>{error || 'Carregando inspeção...'}</Text><Pressable onPress={() => router.replace('/(tabs)/lotes')}><Text style={styles.link}>Voltar aos lotes</Text></Pressable></View></SafeAreaView>;

  return <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
    <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Voltar e salvar rascunho" onPress={leave} style={styles.back}><Ionicons name="arrow-back" size={23} color="#22272a" /></Pressable><View><Text style={styles.title}>Inspecionar</Text><Text style={styles.subtitle}>{lot.code} · {inspection.sleeperId}</Text></View></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <View style={styles.identity}><View style={styles.rowBetween}><View><Text style={styles.overline}>DORMENTE {inspection.sleeperNumber} DE {lot.total}</Text><Text style={styles.sleeper}>{inspection.sleeperId}</Text></View><View style={styles.badge}><Text style={styles.badgeText}>{step === 'diagnosis' ? 'Diagnóstico' : 'Evidências'}</Text></View></View>
        <Text style={styles.muted}>{lot.line} · {lot.location}</Text><Text style={styles.muted}>Preenchimento: {Math.round(filled / 9 * 100)}%</Text><View style={styles.track}><View style={[styles.fill, { width: `${filled / 9 * 100}%` }]} /></View></View>
      <View style={styles.tabs}><Pressable onPress={() => setStep('diagnosis')} style={[styles.tab, step === 'diagnosis' && styles.tabActive]}><Text style={[styles.tabText, step === 'diagnosis' && styles.tabTextActive]}>1. Diagnóstico</Text></Pressable><Pressable onPress={goPhotos} style={[styles.tab, step === 'photos' && styles.tabActive]}><Text style={[styles.tabText, step === 'photos' && styles.tabTextActive]}>2. Fotografias</Text></Pressable></View>
      {step === 'diagnosis' ? <View style={styles.card}><Text style={styles.cardTitle}>Diagnóstico de Campo</Text><Text style={styles.label}>Tipo de Material *</Text><View style={styles.options}>{MATERIALS.map((value) => <Choice key={value} label={value} selected={draft.material === value} onPress={() => update({ material: value })} />)}</View>
        <Text style={styles.label}>Estado de Conservação *</Text><View style={styles.options}>{(['Bom', 'Regular', 'Ruim'] as const).map((value) => <Choice key={value} label={value} selected={draft.condition === value} onPress={() => update({ condition: value })} />)}</View>
        <Text style={styles.label}>Presença de Rachaduras Estruturais *</Text><View style={styles.options}><Choice label="Não" selected={draft.cracks === false} onPress={() => update({ cracks: false })} /><Choice label="Sim" selected={draft.cracks === true} critical onPress={() => update({ cracks: true })} /></View>{draft.cracks && <Text style={styles.critical}>Atenção Crítica · Ocorrência registrada no diagnóstico.</Text>}
        <Text style={styles.label}>Umidade medida — preenchimento manual *</Text><Text style={styles.value}>{draft.humidity === null ? 'Selecione o valor' : `${draft.humidity}%`}</Text><Slider minimumValue={0} maximumValue={100} step={1} value={draft.humidity ?? 0} minimumTrackTintColor="#e42125" maximumTrackTintColor="#e2e4e5" thumbTintColor="#e42125" onValueChange={(value) => { const next = { ...draftRef.current!, humidity: value }; draftRef.current = next; setDraft(next); }} onSlidingComplete={(value) => update({ humidity: value })} /><Text style={styles.hint}>Faixa visual de referência configurável: 40% a 65%. Informe a medição real.</Text>
        <Text style={styles.label}>Vida Útil Residual (anos) *</Text><View style={styles.numberRow}><Pressable accessibilityRole="button" accessibilityLabel="Diminuir vida útil residual" onPress={() => update({ residualYears: Math.max(0, (draft.residualYears ?? 0) - 1) })} style={styles.numberButton}><Ionicons name="remove" size={22} /></Pressable><TextInput accessibilityLabel="Vida útil residual em anos" value={draft.residualYears === null ? '' : String(draft.residualYears)} onChangeText={(value) => update({ residualYears: value === '' ? null : Number(value.replace(/\D/g, '')) })} keyboardType="number-pad" style={styles.numberInput} /><Pressable accessibilityRole="button" accessibilityLabel="Aumentar vida útil residual" onPress={() => update({ residualYears: (draft.residualYears ?? 0) + 1 })} style={styles.numberButton}><Ionicons name="add" size={22} /></Pressable></View>
        <Pressable onPress={goPhotos} style={styles.primary}><Text style={styles.primaryText}>Salvar e seguir para fotografias</Text><Ionicons name="arrow-forward" size={19} color="#fff" /></Pressable></View> :
        <View style={styles.card}><Text style={styles.cardTitle}>Evidências Fotográficas</Text><Text style={styles.hint}>Registre as quatro imagens obrigatórias deste dormente.</Text><View style={styles.photoGrid}>{PHOTO_CATEGORIES.map((item) => <View key={item.id} style={[styles.photoCard, width < 360 && { width: '100%' }]}><Pressable onPress={() => photoUris[item.id] ? setPreviewUri(photoUris[item.id]!) : openPhoto(item.id)} accessibilityRole="button" accessibilityLabel={`${item.label}: ${photoUris[item.id] ? 'visualizar fotografia' : 'registrar fotografia'}`} style={styles.photoTouch}>{photoUris[item.id] ? <Image source={{ uri: photoUris[item.id] }} style={styles.thumbnail} /> : <Ionicons name="camera-outline" size={30} color="#737a7d" />}<Text style={styles.photoName}>{item.label}</Text><Text style={styles.hint}>{photoUris[item.id] ? '✓ Registrada' : item.help}</Text></Pressable>{photoUris[item.id] && <Pressable onPress={() => openPhoto(item.id)} style={styles.retake}><Text style={styles.retakeText}>Refazer</Text></Pressable>}</View>)}</View><Pressable disabled={busy} onPress={finish} style={styles.primary}><Text style={styles.primaryText}>Finalizar Inspeção</Text></Pressable></View>}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <Pressable onPress={leave} style={styles.saveDraft}><Text style={styles.saveDraftText}>Salvar rascunho e sair</Text></Pressable>
    </ScrollView>
    <Modal visible={cameraOpen} onRequestClose={() => { setCameraOpen(false); setCaptureUri(null); }} animationType="slide"><SafeAreaView style={styles.cameraScreen}><View style={styles.cameraHeader}><Pressable onPress={() => { setCameraOpen(false); setCaptureUri(null); }} style={styles.back}><Ionicons name="close" size={25} /></Pressable><Text style={styles.cameraTitle}>{PHOTO_CATEGORIES.find((item) => item.id === category)?.label}</Text></View>{captureUri ? <Image source={{ uri: captureUri }} style={styles.cameraView} resizeMode="contain" /> : Platform.OS !== 'web' ? <CameraView ref={camera} style={styles.cameraView} facing="back" onCameraReady={() => setCameraReady(true)} onMountError={(event) => setCameraError(event.message)} /> : null}<Text style={styles.cameraMessage}>{cameraError}</Text><View style={styles.cameraActions}>{captureUri ? <><Pressable onPress={() => { setCaptureUri(null); if (Platform.OS === 'web' && category) { setCameraOpen(false); openPhoto(category); } }} style={styles.cameraSecondary}><Text style={styles.cameraActionText}>Refazer</Text></Pressable><Pressable disabled={busy} onPress={usePhoto} style={styles.cameraPrimary}><Text style={styles.cameraActionText}>Usar Foto</Text></Pressable></> : <Pressable disabled={!cameraReady || busy} onPress={takePhoto} style={styles.cameraPrimary}><Text style={styles.cameraActionText}>Capturar Foto</Text></Pressable>}</View></SafeAreaView></Modal>
    <Modal visible={!!previewUri} transparent onRequestClose={() => setPreviewUri(null)}><View style={styles.previewOverlay}><Pressable onPress={() => setPreviewUri(null)} accessibilityLabel="Fechar imagem" style={styles.previewClose}><Ionicons name="close" size={25} color="#fff" /></Pressable>{previewUri && <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="contain" />}</View></Modal>
  </SafeAreaView>;
}

function Choice({ label, selected, onPress, critical }: { label: string; selected: boolean; onPress: () => void; critical?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.choice, selected && styles.choiceSelected, selected && critical && styles.choiceCritical]}><Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f8f9' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 15 }, link: { color: '#d71920' },
  header: { backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', gap: 12 }, back: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#f0f1f2', alignItems: 'center', justifyContent: 'center' }, title: { fontSize: 23, fontWeight: '700', color: '#16191b' }, subtitle: { fontSize: 13, color: '#62686b' },
  content: { width: '100%', maxWidth: 550, alignSelf: 'center', padding: 20, paddingBottom: 45, gap: 15 }, identity: { backgroundColor: '#fff', borderRadius: 27, padding: 20 }, rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, overline: { color: '#777e81', fontSize: 12, fontWeight: '700' }, sleeper: { color: '#15181a', fontSize: 22, fontWeight: '700', marginTop: 3 }, badge: { backgroundColor: '#fde4e4', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 }, badgeText: { color: '#c01c22', fontSize: 12, fontWeight: '700' }, muted: { color: '#666d70', marginTop: 9 }, track: { height: 8, borderRadius: 5, backgroundColor: '#e6e8e9', overflow: 'hidden', marginTop: 9 }, fill: { height: 8, backgroundColor: '#e42125' },
  tabs: { flexDirection: 'row', backgroundColor: '#e9ebec', borderRadius: 22, padding: 4 }, tab: { flex: 1, minHeight: 42, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }, tabActive: { backgroundColor: '#292d2e' }, tabText: { color: '#51585b', fontWeight: '600' }, tabTextActive: { color: '#fff' },
  card: { backgroundColor: '#fff', borderRadius: 28, padding: 20 }, cardTitle: { color: '#181b1d', fontSize: 19, fontWeight: '700' }, label: { fontSize: 14, fontWeight: '700', color: '#303538', marginTop: 22, marginBottom: 9 }, options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { backgroundColor: '#f0f1f2', minHeight: 44, borderRadius: 15, paddingHorizontal: 17, alignItems: 'center', justifyContent: 'center' }, choiceSelected: { backgroundColor: '#292d2e' }, choiceCritical: { backgroundColor: '#e42125' }, choiceText: { color: '#34393c', fontWeight: '600' }, choiceTextSelected: { color: '#fff' }, critical: { color: '#b91820', backgroundColor: '#fde9e9', padding: 12, borderRadius: 12, marginTop: 10, fontWeight: '600' }, value: { fontSize: 20, fontWeight: '700', color: '#e42125', marginBottom: 6 }, hint: { color: '#73797c', fontSize: 13, lineHeight: 19 },
  numberRow: { flexDirection: 'row', gap: 10, alignItems: 'center' }, numberButton: { width: 47, height: 47, borderRadius: 15, backgroundColor: '#eceeef', alignItems: 'center', justifyContent: 'center' }, numberInput: { minWidth: 75, height: 47, borderRadius: 14, backgroundColor: '#f3f4f5', color: '#1d2224', fontSize: 18, textAlign: 'center' },
  primary: { minHeight: 57, borderRadius: 29, marginTop: 24, backgroundColor: '#e42125', flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }, primaryText: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' }, error: { color: '#b91620', fontSize: 14, lineHeight: 20 }, saveDraft: { minHeight: 45, alignItems: 'center', justifyContent: 'center' }, saveDraftText: { color: '#565d60', fontWeight: '600' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 }, photoCard: { width: '48%', minHeight: 160, borderRadius: 18, backgroundColor: '#f2f3f4', overflow: 'hidden' }, photoTouch: { minHeight: 130, padding: 12, alignItems: 'center', justifyContent: 'center' }, thumbnail: { width: '100%', height: 84, borderRadius: 10, marginBottom: 6 }, photoName: { fontWeight: '700', color: '#252a2c', textAlign: 'center', marginTop: 5 }, retake: { minHeight: 38, alignItems: 'center', justifyContent: 'center' }, retakeText: { color: '#c91d23', fontWeight: '700' },
  cameraScreen: { flex: 1, backgroundColor: '#111' }, cameraHeader: { flexDirection: 'row', alignItems: 'center', gap: 15, padding: 15, backgroundColor: '#fff' }, cameraTitle: { fontSize: 18, fontWeight: '700' }, cameraView: { flex: 1 }, cameraMessage: { color: '#fff', textAlign: 'center', padding: 10 }, cameraActions: { flexDirection: 'row', gap: 10, padding: 18 }, cameraPrimary: { flex: 1, backgroundColor: '#e42125', borderRadius: 28, minHeight: 54, justifyContent: 'center', alignItems: 'center' }, cameraSecondary: { flex: 1, backgroundColor: '#4b5255', borderRadius: 28, minHeight: 54, justifyContent: 'center', alignItems: 'center' }, cameraActionText: { color: '#fff', fontWeight: '700', fontSize: 16 }, previewOverlay: { flex: 1, backgroundColor: '#111', justifyContent: 'center' }, previewClose: { position: 'absolute', right: 20, top: 50, zIndex: 2, padding: 10 }, previewImage: { width: '100%', height: '90%' },
});
