import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@/contexts/SessionContext';

const RED = '#c80e28';

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, profileUpdated, clearProfileUpdated, endSession } = useSession();
  const [leaving, setLeaving] = useState(false);

  async function signOut() {
    if (leaving) return;
    setLeaving(true);
    await endSession();
    router.replace('/login');
  }

  const fields = [
    { title: 'Identificação', icon: 'id-card-outline' as const, label: 'Matrícula ou e-mail', value: profile?.matriculaOuEmail },
    { title: 'Função', icon: 'briefcase-outline' as const, label: 'Função operacional', value: profile?.funcaoOperacional },
    { title: 'Base de lotação', icon: 'location-outline' as const, label: 'Unidade ou local de trabalho', value: profile?.baseLotacao },
  ];

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: 125 + insets.bottom }]}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={styles.back}>
              <Ionicons name="arrow-back" size={23} color="#252c2d" />
            </Pressable>
            <Text accessibilityRole="header" style={styles.title}>Meu Perfil</Text>
            <View style={styles.sessionBadge}><View style={styles.sessionDot} /><Text style={styles.sessionText}>Sessão ativa</Text></View>
          </View>

          {profileUpdated && <View accessibilityRole="alert" style={styles.success}><Ionicons name="checkmark-circle-outline" size={18} color="#237451" /><Text style={styles.successText}>Perfil atualizado neste dispositivo.</Text></View>}

          <View style={styles.identityCard}>
            <View style={styles.identityTop}>
              <View style={styles.avatar}><Ionicons name="person-outline" size={38} color="#fff" /></View>
              <Pressable accessibilityRole="button" onPress={() => { clearProfileUpdated(); router.push('/(tabs)/editar-perfil'); }} style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}>
                <Ionicons name="pencil-outline" size={17} color={RED} /><Text style={styles.editText}>Editar perfil</Text>
              </Pressable>
            </View>
            <Text style={styles.name}>{profile?.nomeCompleto || 'Nome não informado'}</Text>
            <Text style={styles.role}>{profile?.funcaoOperacional || 'Função não informada'}</Text>
            {!!profile?.matriculaOuEmail && <Text style={styles.identifier}>{profile.matriculaOuEmail}</Text>}
          </View>

          {fields.map(({ title, icon, label, value }) => <View key={title} style={styles.fieldCard}>
            <View style={styles.fieldIcon}><Ionicons name={icon} size={22} color="#4d5557" /></View>
            <View style={styles.fieldCopy}><Text style={styles.fieldTitle}>{title}</Text><Text style={styles.fieldLabel}>{label}</Text><Text style={styles.fieldValue}>{value || 'Não informado'}</Text></View>
          </View>)}

          <Pressable accessibilityRole="button" accessibilityLabel="Sair da conta" accessibilityState={{ disabled: leaving }} disabled={leaving} onPress={() => void signOut()} style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}>
            <Ionicons name="log-out-outline" size={21} color={RED} /><Text style={styles.signOutText}>{leaving ? 'Saindo...' : 'Sair da conta'}</Text>
          </Pressable>
        </View>
      </ScrollView>

      <View pointerEvents="box-none" style={[styles.navigationContainer, { bottom: Math.max(14, insets.bottom) }]}>
        <View style={styles.navigation}>
          <Pressable accessibilityRole="button" accessibilityLabel="Início" onPress={() => router.navigate('/(tabs)')} style={styles.navItem}><Ionicons name="grid-outline" size={21} color="#c7cdcd" /><Text style={styles.navLabel}>Início</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Lotes" onPress={() => router.navigate('/(tabs)/lotes')} style={styles.navItem}><Ionicons name="layers-outline" size={22} color="#c7cdcd" /><Text style={styles.navLabel}>Lotes</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Nova inspeção" onPress={() => router.navigate({ pathname: '/(tabs)', params: { open: 'scan', request: String(Date.now()) } })} style={styles.navScan}><Ionicons name="qr-code-outline" size={27} color="#fff" /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Histórico" onPress={() => router.navigate({ pathname: '/(tabs)', params: { open: 'history', request: String(Date.now()) } })} style={styles.navItem}><Ionicons name="time-outline" size={22} color="#c7cdcd" /><Text style={styles.navLabel}>Histórico</Text></Pressable>
          <View accessibilityRole="tab" accessibilityState={{ selected: true }} style={[styles.navItem, styles.navSelected]}><Ionicons name="person-outline" size={22} color="#fff" /><Text style={styles.navSelectedText}>Perfil</Text></View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f8f9' },
  scroll: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 14 },
  content: { width: '100%', maxWidth: 440 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 22 },
  back: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 21, fontWeight: '700', color: '#22292b' },
  sessionBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 18, backgroundColor: '#e9ebec', paddingHorizontal: 9, minHeight: 30 },
  sessionDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: RED },
  sessionText: { color: '#4d5557', fontSize: 11, fontWeight: '600' },
  success: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#e7f4eb', borderRadius: 14, padding: 13, marginBottom: 14 },
  successText: { color: '#24563b', fontSize: 13, flex: 1 },
  identityCard: { backgroundColor: '#fff', borderRadius: 28, padding: 22, marginBottom: 15 },
  identityTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  avatar: { width: 78, height: 78, borderRadius: 39, backgroundColor: RED, alignItems: 'center', justifyContent: 'center' },
  editButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#fcecee', borderRadius: 22, paddingHorizontal: 13, minHeight: 44 },
  editText: { fontSize: 13, fontWeight: '700', color: RED },
  name: { fontSize: 23, fontWeight: '700', color: '#22292b', marginTop: 17 },
  role: { fontSize: 15, color: '#596163', marginTop: 3 },
  identifier: { fontSize: 13, color: '#727a7c', marginTop: 10 },
  fieldCard: { flexDirection: 'row', gap: 14, backgroundColor: '#fff', borderRadius: 23, padding: 18, marginBottom: 12 },
  fieldIcon: { width: 43, height: 43, borderRadius: 22, backgroundColor: '#f0f2f3', alignItems: 'center', justifyContent: 'center' },
  fieldCopy: { flex: 1 },
  fieldTitle: { color: '#262d2e', fontSize: 16, fontWeight: '700' },
  fieldLabel: { color: '#777f81', fontSize: 12, marginTop: 2 },
  fieldValue: { color: '#32393a', fontSize: 15, marginTop: 8 },
  signOut: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 27, backgroundColor: '#fce9ec', marginTop: 12 },
  signOutText: { color: RED, fontWeight: '700', fontSize: 15 },
  pressed: { opacity: 0.72 },
  navigationContainer: { position: 'absolute', left: 20, right: 20, alignItems: 'center' },
  navigation: { width: '100%', maxWidth: 450, minHeight: 74, borderRadius: 40, backgroundColor: '#383c3d', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, shadowColor: '#1a1e1f', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 24, elevation: 8 },
  navItem: { flex: 1, minHeight: 58, borderRadius: 30, alignItems: 'center', justifyContent: 'center', gap: 2 },
  navSelected: { backgroundColor: '#c80e28' },
  navLabel: { color: '#d3d7d7', fontSize: 11 },
  navSelectedText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  navScan: { width: 56, height: 56, borderRadius: 28, marginHorizontal: 3, backgroundColor: '#e62328', alignItems: 'center', justifyContent: 'center' },
});
