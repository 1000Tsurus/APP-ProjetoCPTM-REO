import Ionicons from '@expo/vector-icons/Ionicons';
import { usePreventRemove, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@/contexts/SessionContext';

const RED = '#d71d29';

export default function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, updateProfile } = useSession();
  const [name, setName] = useState(profile?.nomeCompleto ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const allowLeave = useRef(false);
  const dirty = name !== (profile?.nomeCompleto ?? '');

  usePreventRemove(dirty && !allowLeave.current, ({ repeat }) => {
    const discard = () => { allowLeave.current = true; repeat(); };
    if (Platform.OS === 'web') {
      if (window.confirm('Descartar as alterações não salvas?')) discard();
    } else Alert.alert('Alterações não salvas', 'Deseja descartar as alterações?', [
      { text: 'Continuar editando', style: 'cancel' },
      { text: 'Descartar', style: 'destructive', onPress: discard },
    ]);
  });

  useEffect(() => {
    if (Platform.OS !== 'web' || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function back() {
    if (router.canGoBack()) router.back();
    else if (!dirty || (Platform.OS === 'web' && window.confirm('Descartar as alterações não salvas?'))) {
      allowLeave.current = true;
      router.replace('/(tabs)/perfil');
    }
    else if (Platform.OS !== 'web') Alert.alert('Alterações não salvas', 'Deseja descartar as alterações?', [
      { text: 'Continuar editando', style: 'cancel' },
      { text: 'Descartar', style: 'destructive', onPress: () => { allowLeave.current = true; router.replace('/(tabs)/perfil'); } },
    ]);
  }

  async function save() {
    if (saving) return;
    const normalized = name.trim().replace(/\s+/g, ' ');
    if (normalized.length < 3) {
      setError('Informe seu nome completo com pelo menos 3 caracteres.');
      return;
    }
    if (!dirty) { back(); return; }
    setError('');
    setSaving(true);
    try {
      await updateProfile({ nomeCompleto: normalized });
      allowLeave.current = true;
      router.dismissTo('/(tabs)/perfil');
    } catch {
      setError('Não foi possível salvar neste dispositivo. Verifique o armazenamento e tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  const managed = [
    { label: 'Matrícula ou e-mail', icon: 'at-outline' as const, value: profile?.matriculaOuEmail },
    { label: 'Função operacional', icon: 'briefcase-outline' as const, value: profile?.funcaoOperacional },
    { label: 'Base de lotação', icon: 'location-outline' as const, value: profile?.baseLotacao },
  ];

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.screen}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: 28 + insets.bottom }]}>
          <View style={styles.content}>
            <View style={styles.header}>
              <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={back} style={styles.back}><Ionicons name="arrow-back" size={23} color="#252c2d" /></Pressable>
              <Text accessibilityRole="header" style={styles.title}>Editar perfil</Text>
            </View>

            <View style={styles.hero}>
              <View style={styles.avatar}><Ionicons name="person-outline" size={36} color="#fff" /></View>
              <Text style={styles.heroName}>{profile?.nomeCompleto || 'Nome não informado'}</Text>
              <Text style={styles.heroRole}>{profile?.funcaoOperacional || 'Função não informada'}</Text>
            </View>

            <Text style={styles.sectionTitle}>DADOS PESSOAIS</Text>
            <View style={styles.card}>
              <View style={styles.labelRow}><Ionicons name="person-outline" size={19} color="#4b5456" /><Text style={styles.label}>Nome completo</Text></View>
              <TextInput accessibilityLabel="Nome completo" autoCapitalize="words" autoComplete="name" textContentType="name" returnKeyType="done" maxLength={120} onChangeText={(value) => { setName(value); if (error) setError(''); }} value={name} style={[styles.input, !!error && styles.inputError]} placeholder="Informe seu nome completo" placeholderTextColor="#747b7d" />
              {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
              <Text style={styles.help}>Este é o nome exibido no aplicativo.</Text>
            </View>

            <Text style={styles.sectionTitle}>DADOS DA ORGANIZAÇÃO</Text>
            <View style={styles.card}>
              <Text style={styles.managedNote}>Gerenciado pela organização</Text>
              {managed.map(({ label, icon, value }) => <View key={label} style={styles.managedField}>
                <View style={styles.labelRow}><Ionicons name={icon} size={19} color="#596163" /><Text style={styles.label}>{label}</Text></View>
                <View style={styles.readOnly}><Text style={styles.readOnlyText}>{value || 'Não informado'}</Text><Ionicons name="lock-closed-outline" size={17} color="#8c9294" /></View>
              </View>)}
            </View>

            <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} onPress={() => void save()} style={({ pressed }) => [styles.save, pressed && styles.pressed]}>
              <Ionicons name={saving ? 'hourglass-outline' : 'checkmark-circle-outline'} size={20} color="#fff" /><Text style={styles.saveText}>{saving ? 'Salvando...' : 'Salvar alterações'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={back} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}><Text style={styles.cancelText}>Cancelar</Text></Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f8f9' }, flex: { flex: 1 },
  scroll: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 14 }, content: { width: '100%', maxWidth: 440 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  back: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#22292b', fontSize: 21, fontWeight: '700' },
  hero: { backgroundColor: '#fff', borderRadius: 28, alignItems: 'center', padding: 24, marginBottom: 24 },
  avatar: { width: 78, height: 78, borderRadius: 39, backgroundColor: RED, alignItems: 'center', justifyContent: 'center' },
  heroName: { color: '#22292b', fontSize: 20, fontWeight: '700', textAlign: 'center', marginTop: 14 },
  heroRole: { color: '#687073', fontSize: 14, textAlign: 'center', marginTop: 4 },
  sectionTitle: { color: '#51595b', fontSize: 13, fontWeight: '700', letterSpacing: 0.7, marginBottom: 11, marginLeft: 4 },
  card: { backgroundColor: '#fff', borderRadius: 27, padding: 20, marginBottom: 24 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 9 },
  label: { color: '#283032', fontSize: 15, fontWeight: '600' },
  input: { minHeight: 49, borderRadius: 14, backgroundColor: '#f1f2f3', color: '#22292b', fontSize: 16, paddingHorizontal: 15, borderWidth: 1, borderColor: 'transparent' },
  inputError: { borderColor: RED },
  error: { color: '#b40b20', fontSize: 13, lineHeight: 19, marginTop: 7 },
  help: { color: '#727a7c', fontSize: 12, marginTop: 9 },
  managedNote: { color: '#71797b', fontSize: 12, fontWeight: '600', marginBottom: 17 },
  managedField: { marginBottom: 17 },
  readOnly: { minHeight: 49, borderRadius: 14, backgroundColor: '#f1f2f3', paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 8 },
  readOnlyText: { color: '#555d60', fontSize: 15, flex: 1 },
  save: { backgroundColor: RED, minHeight: 56, borderRadius: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancel: { minHeight: 54, borderRadius: 27, backgroundColor: '#eceeef', alignItems: 'center', justifyContent: 'center', marginTop: 11 },
  cancelText: { color: '#464e50', fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.75 },
});
