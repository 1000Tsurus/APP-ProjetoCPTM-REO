import { CameraView, useCameraPermissions } from 'expo-camera';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '@/contexts/SessionContext';
import { resolveIdentifier } from '@/data/inspection-store';
import { cancelNfcRead, readNfcIdentifier } from '@/data/nfc-reader';
import { workflowStyles as styles } from '@/components/operation/workflow-styles';

export default function ReadTagScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const source = mode === 'nfc' ? 'nfc' : 'qr';
  const router = useRouter();
  const { profile } = useSession();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState('');
  const reading = useRef(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  useEffect(() => {
    mounted.current = true;
    const listener = AppState.addEventListener('change', (state) => {
      if (state !== 'active') { generation.current++; setCameraOpen(false); void cancelNfcRead(); }
    });
    return () => { mounted.current = false; generation.current++; listener.remove(); void cancelNfcRead(); };
  }, []);

  async function resolve(raw: string, inputSource: 'qr' | 'nfc' = source, request = generation.current) {
    const result = await resolveIdentifier(raw, inputSource);
    if (!mounted.current || generation.current !== request) return;
    setCameraOpen(false);
    if (result.sleeper) router.replace({ pathname: '/dormente/[sleeperId]', params: { sleeperId: result.sleeper.id } });
    else router.replace({ pathname: '/lote/[lotId]', params: { lotId: result.lot.id } });
  }
  async function lookup(raw: string) {
    if (reading.current) return;
    reading.current = true; setBusy(true); setCameraOpen(false); setError('');
    try { await resolve(raw, 'qr'); }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : 'Falha ao localizar a etiqueta.'); }
    finally { reading.current = false; if (mounted.current) setBusy(false); }
  }
  async function start() {
    if (reading.current) return;
    setError('');
    if (source === 'qr') {
      try {
        const result = permission?.granted ? permission : await requestPermission();
        if (!mounted.current) return;
        if (!result.granted) { setError(result.canAskAgain ? 'Permita o acesso à câmera para ler QR Codes.' : 'Permissão da câmera negada. Habilite-a nos ajustes do aparelho ou nas permissões deste site.'); return; }
        setCameraOpen(true);
      } catch { setError('Não foi possível abrir a câmera. Verifique as permissões e tente novamente.'); }
      return;
    }
    reading.current = true; setBusy(true);
    const request = generation.current;
    try { const id = await readNfcIdentifier(); if (generation.current === request) await resolve(id, 'nfc', request); }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : 'Falha de leitura NFC.'); }
    finally { reading.current = false; if (mounted.current) setBusy(false); }
  }
  if (!profile) return <Redirect href="/login" />;
  return <SafeAreaView style={styles.screen}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.secondary}><Text>Voltar</Text></Pressable>
      <Text style={styles.title}>{source === 'qr' ? 'Ler QR Code' : 'Ler NFC'}</Text>
      <Text style={styles.hint}>{source === 'qr' ? 'Aponte a câmera para o identificador de um lote ou dormente RailLog.' : 'Aproxime a etiqueta do dormente após iniciar a leitura. NFC exige aparelho compatível e development build; indisponível no Expo Go e na web.'}</Text>
      {cameraOpen && <CameraView style={{ height: 300, width: '100%', borderRadius: 20 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => void lookup(data)} onMountError={() => { setCameraOpen(false); setError('Falha ao iniciar a câmera. Verifique se ela está disponível e tente novamente.'); }} />}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!cameraOpen && <Pressable accessibilityRole="button" disabled={busy} onPress={start} style={styles.primary}><Text style={styles.primaryText}>{busy ? 'Aproxime a etiqueta...' : source === 'qr' ? 'Abrir câmera / Tentar novamente' : 'Iniciar leitura NFC'}</Text></Pressable>}
      {(busy || cameraOpen) && <Pressable accessibilityRole="button" onPress={() => { generation.current++; setCameraOpen(false); void cancelNfcRead(); }} style={styles.secondary}><Text>Cancelar leitura</Text></Pressable>}
      {source === 'nfc' && <Pressable accessibilityRole="button" disabled={busy} onPress={() => router.replace({ pathname: '/ler-etiqueta', params: { mode: 'qr' } })} style={styles.secondary}><Text>Ler QR Code</Text></Pressable>}
      {Platform.OS !== 'web' && !!error && <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings().catch(() => setError('Abra os ajustes do aplicativo manualmente.'))} style={styles.secondary}><Text>Abrir ajustes do aplicativo</Text></Pressable>}
      {source === 'qr' && <View style={styles.card}><Text style={styles.hint}>Alternativa: digite o código impresso na etiqueta.</Text><TextInput accessibilityLabel="Identificador do lote ou dormente" autoCapitalize="characters" autoCorrect={false} value={manual} onChangeText={setManual} placeholder="LT-001-D0001 ou LT-001" style={styles.input} /><Pressable accessibilityRole="button" disabled={busy || !manual.trim()} onPress={() => void lookup(manual)} style={styles.secondary}><Text>Localizar registro</Text></Pressable></View>}
    </ScrollView>
  </SafeAreaView>;
}
