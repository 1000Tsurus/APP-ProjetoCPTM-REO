import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { InspectionCard } from '@/components/operation/InspectionCard';
import { OperationPanel } from '@/components/operation/OperationPanel';
import { useSession } from '@/contexts/SessionContext';
import {
  analysisCategories, operationalGoal, recentInspections, volumeSummary,
  type AnalysisCategory, type Inspection,
} from '@/data/operational-summary';

type Panel = 'categories' | 'scan' | 'lots' | 'history' | 'calibration' | 'inspection' | 'category' | null;
type Filter = 'all' | 'rejected' | 'lot' | 'dormentes';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Todos' }, { id: 'rejected', label: 'Reprovados' },
  { id: 'lot', label: 'Lote LT-002' }, { id: 'dormentes', label: 'Dormentes' },
];
const formatNumber = (value: number) => value.toLocaleString('pt-BR');

export default function HomeScreen() {
  const router = useRouter();
  const { open, request } = useLocalSearchParams<{ open?: string; request?: string }>();
  const { profile } = useSession();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [panel, setPanel] = useState<Panel>(null);
  const [category, setCategory] = useState<AnalysisCategory>('dormentes');
  const [selectedInspection, setSelectedInspection] = useState<Inspection | null>(null);
  const [selectedLot, setSelectedLot] = useState<string | null>(null);
  useEffect(() => {
    if (open === 'scan' || open === 'history') setPanel(open);
  }, [open, request]);
  const total = volumeSummary.approved + volumeSummary.rejected + volumeSummary.pending;
  const processed = total ? ((total - volumeSummary.pending) / total) * 100 : 0;
  const goalProgress = operationalGoal.target > 0
    ? Math.min(100, Math.round(operationalGoal.completed / operationalGoal.target * 100)) : 0;
  const remaining = Math.max(0, operationalGoal.target - operationalGoal.completed);
  const firstName = profile?.nomeCompleto.trim().split(/\s+/)[0] || 'inspetor';
  const currentCategory = analysisCategories.find((item) => item.id === category)!;
  const filteredInspections = recentInspections.filter((item) =>
    filter === 'rejected' ? item.status === 'rejected'
      : filter === 'lot' ? item.lot === 'LT-002'
        : filter === 'dormentes' ? item.category === 'dormentes' : true);

  function inspect(item: Inspection) {
    setSelectedInspection(item);
    setPanel('inspection');
  }

  function openCategory(id: AnalysisCategory) {
    setCategory(id);
    setPanel('category');
  }

  const panelTitles: Record<Exclude<Panel, null>, string> = {
    categories: 'Categorias de análise', scan: 'Iniciar inspeção', lots: 'Lotes da operação',
    history: 'Histórico de inspeções', calibration: 'Sensor LiDAR',
    inspection: 'Detalhes da inspeção', category: currentCategory.title,
  };

  function categoryGrid() {
    return <View style={styles.categoryGrid}>{analysisCategories.map((item) => (
      <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Analisar ${item.title}`}
        onPress={() => openCategory(item.id)} style={({ pressed }) => [styles.categoryCard, pressed && styles.pressed]}>
        <View style={styles.categoryIcon}><Ionicons name={item.icon} size={23} color="#303636" /></View>
        <View style={styles.categoryCopy}><Text style={styles.categoryTitle}>{item.title}</Text>
          <Text style={styles.categoryDescription}>{item.description}</Text></View>
      </Pressable>
    ))}</View>;
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 130 + insets.bottom }]}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.brandIcon}><Ionicons name="train-outline" size={22} color="#fff" /></View>
            <View style={styles.brandCopy}><Text style={styles.brand}>RAILLOG INSPECT</Text><Text style={styles.pageTitle}>Início</Text></View>
            <View style={styles.demoBadge}><View style={styles.demoDot} /><Text style={styles.demoBadgeText}>Demo</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Abrir meu perfil" onPress={() => router.push('/(tabs)/perfil')} style={styles.avatar}>
              <Ionicons name="person-outline" size={18} color="#fff" />
            </Pressable>
          </View>

          <View style={styles.greetingRow}>
            <View style={styles.greetingCopy}>
              <Text style={styles.greeting}>Olá, {firstName} <Text style={styles.wave}>👋</Text></Text>
              <Text style={styles.subtitle}>{profile?.funcaoOperacional === 'Pátio' ? 'Operador de Campo' : profile?.funcaoOperacional || 'Função não informada'}{profile?.baseLotacao ? ` • ${profile.baseLotacao.split(' • ')[0]}` : ` • ${profile?.matriculaOuEmail || 'CPTM'}`}</Text>
            </View>
            <View style={styles.connectionBadge}><Ionicons name="location-outline" size={12} color="#646a6c" /><Text style={styles.connectionText}>GPS INATIVO</Text></View>
          </View>

          <View style={styles.goalCard}>
            <View style={styles.goalTop}>
              <View style={styles.goalCopy}>
                <Text style={styles.goalOverline}>META OPERACIONAL</Text>
                <View style={styles.goalCountRow}><Text style={styles.goalCount}>{operationalGoal.completed}</Text><Text style={styles.goalCountLabel}>lotes inspecionados</Text></View>
              </View>
              <View accessibilityRole="progressbar" accessibilityLabel="Progresso da meta de trabalho" accessibilityValue={{ min: 0, max: 100, now: goalProgress }} style={styles.progressRing}>
                {Array.from({ length: 72 }, (_, index) => <View key={index} style={[styles.ringSegment, {
                  backgroundColor: index / 72 * 100 < goalProgress ? '#e9252b' : '#515151',
                  transform: [{ rotate: `${index * 5}deg` }, { translateY: -23 }],
                }]} />)}
                <Text style={styles.ringText}>{goalProgress}%</Text>
              </View>
            </View>
            <View style={styles.goalMetaRow}>
              <Text style={styles.goalMeta}>Meta de hoje: <Text style={styles.bold}>{operationalGoal.target} lotes</Text></Text>
              <Text style={styles.goalRemaining}>{remaining ? `Falta${remaining === 1 ? '' : 'm'} apenas ${remaining} lote${remaining === 1 ? '' : 's'}` : 'Meta concluída!'}</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => setPanel('scan')} style={({ pressed }) => [styles.scanButton, pressed && styles.pressed]}>
              <Ionicons name="flash" size={21} color="#fff" /><Text style={styles.scanButtonText}>Iniciar Inspeção Rápida</Text><Ionicons name="arrow-forward" size={21} color="#fff" />
            </Pressable>
            <View style={styles.goalOwner}><Ionicons name="shield-checkmark-outline" size={10} color="#c1c4c4" /><Text style={styles.goalOwnerText}>Definida pela gestão • Somente leitura</Text></View>
          </View>

          <View style={styles.sectionHeading}><Text style={styles.overline}>CATEGORIAS DE ANÁLISE</Text>
            <Pressable accessibilityRole="button" onPress={() => setPanel('categories')} hitSlop={10}><Text style={styles.link}>Ver todas</Text></Pressable></View>
          {categoryGrid()}

          <View style={styles.volumeCard}>
            <View style={styles.volumeHeading}><View><Text style={styles.overline}>RESUMO DE VOLUME</Text><Text style={styles.volumeTitle}>{formatNumber(total)} {volumeSummary.unit}</Text></View>
              <View style={styles.shiftBadge}><Text style={styles.shiftText}>{volumeSummary.shift}</Text></View></View>
            <View accessibilityRole="progressbar" accessibilityLabel="Volume processado" accessibilityValue={{ min: 0, max: 100, now: processed }} style={styles.volumeTrack}>
              <View style={[styles.volumeApproved, { flex: volumeSummary.approved }]} /><View style={[styles.volumeRejected, { flex: volumeSummary.rejected }]} /><View style={[styles.volumePending, { flex: volumeSummary.pending }]} />
            </View>
            <View style={styles.volumeCaption}><Text style={styles.caption}>Evolução do lote consolidado</Text><Text style={styles.processed}>{processed.toFixed(1)}% processado</Text></View>
            <View style={styles.statsRow}>
              {[{ label: 'APROVADOS', value: volumeSummary.approved, red: false }, { label: 'REPROVADOS', value: volumeSummary.rejected, red: true }, { label: 'PENDENTES', value: volumeSummary.pending, red: false }].map((item) => (
                <View key={item.label} style={styles.stat}><View style={styles.statLabelRow}><View style={[styles.statDot, item.red && styles.redBackground]} /><Text style={[styles.statLabel, item.red && styles.redText]}>{item.label}</Text></View>
                  <Text style={[styles.statNumber, item.red && styles.redText]}>{formatNumber(item.value)}</Text></View>
              ))}
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {FILTERS.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: filter === item.id }}
              onPress={() => setFilter(item.id)} style={[styles.filter, filter === item.id && styles.activeFilter]}><Text style={[styles.filterText, filter === item.id && styles.activeFilterText]}>{item.label}</Text></Pressable>)}
          </ScrollView>
          <View style={styles.inspectionsHeading}><Text style={styles.overline}>INSPEÇÕES RECENTES</Text><Text style={styles.caption}>Demonstração</Text></View>
          {filteredInspections.map((item) => <InspectionCard key={item.id} inspection={item} onPress={() => inspect(item)} />)}

          <Pressable accessibilityRole="button" onPress={() => setPanel('calibration')} style={({ pressed }) => [styles.calibration, pressed && styles.pressed]}>
            <Ionicons name="ribbon-outline" size={26} color="#d52931" /><View style={styles.calibrationCopy}><Text style={styles.calibrationTitle}>Calibração LiDAR</Text><Text style={styles.caption}>Conecte o sensor para verificar o estado</Text></View><Ionicons name="chevron-forward" size={17} color="#727879" />
          </Pressable>
          <Text style={styles.demoNote}>AMBIENTE DEMONSTRATIVO • DADOS ILUSTRATIVOS</Text>
        </View>
      </ScrollView>

      <View pointerEvents="box-none" style={[styles.navigationContainer, { bottom: Math.max(14, insets.bottom) }]}>
        <View style={styles.navigation}>
          <Pressable accessibilityRole="button" accessibilityLabel="Início" accessibilityState={{ selected: panel === null }} onPress={() => { setPanel(null); scrollRef.current?.scrollTo({ y: 0, animated: true }); }} style={styles.navItem}><Ionicons name="grid-outline" size={21} color="#fff" /><Text style={styles.navLabel}>Início</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.navigate('/(tabs)/lotes')} style={styles.navItem}><Ionicons name="layers-outline" size={22} color="#c7cdcd" /><Text style={styles.navLabel}>Lotes</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Nova inspeção" onPress={() => setPanel('scan')} style={styles.navScan}><Ionicons name="qr-code-outline" size={28} color="#fff" /></Pressable>
          <Pressable accessibilityRole="button" onPress={() => setPanel('history')} style={styles.navItem}><Ionicons name="time-outline" size={23} color="#c7cdcd" /><Text style={styles.navLabel}>Histórico</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Perfil" onPress={() => router.navigate('/(tabs)/perfil')} style={styles.navItem}><Ionicons name="person-outline" size={23} color="#c7cdcd" /><Text style={styles.navLabel}>Perfil</Text></Pressable>
        </View>
      </View>

      <OperationPanel title={panel ? panelTitles[panel] : ''} visible={panel !== null} onClose={() => setPanel(null)}>
        {(panel === 'categories' || panel === 'scan') && <>
          <Text style={styles.panelDescription}>{panel === 'scan' ? 'Selecione o elemento da via permanente que deseja inspecionar.' : 'Análises da via permanente para a operação CPTM.'}</Text>{categoryGrid()}
          {panel === 'scan' && <Text style={styles.panelHint}>A captura será disponibilizada após a integração do sensor e do serviço de inspeções.</Text>}
        </>}
        {panel === 'category' && <>
          <View style={styles.panelIcon}><Ionicons name={currentCategory.icon} size={30} color="#e52329" /></View>
          <Text style={styles.panelDescription}>{currentCategory.description}</Text><Text style={styles.overline}>INSPEÇÕES NESTA CATEGORIA</Text><View style={styles.panelSpacing} />
          {recentInspections.filter((item) => item.category === category).map((item) => <InspectionCard key={item.id} inspection={item} onPress={() => inspect(item)} />)}
          {!recentInspections.some((item) => item.category === category) && <Text style={styles.empty}>Nenhuma inspeção nesta categoria no demonstrativo.</Text>}
          <Text style={styles.panelHint}>Novas capturas dependem da integração com o sensor e o serviço de inspeções.</Text>
        </>}
        {panel === 'history' && <><Text style={styles.panelDescription}>Registros recentes do demonstrativo, do mais recente ao mais antigo.</Text>{recentInspections.map((item) => <InspectionCard key={item.id} inspection={item} onPress={() => inspect(item)} />)}</>}
        {panel === 'lots' && <>
          <Text style={styles.panelDescription}>Lotes com registros no demonstrativo.</Text>
          {['LT-002', 'LT-001'].map((lot) => <Pressable key={lot} accessibilityRole="button" onPress={() => setSelectedLot(selectedLot === lot ? null : lot)} style={styles.panelRow}><Ionicons name="layers-outline" size={23} color="#42494a" /><View style={styles.flex}><Text style={styles.rowTitle}>{lot}</Text><Text style={styles.caption}>{recentInspections.filter((item) => item.lot === lot).length} inspeções recentes</Text></View><Ionicons name={selectedLot === lot ? 'chevron-up' : 'chevron-down'} size={18} color="#747a7c" /></Pressable>)}
          {selectedLot && recentInspections.filter((item) => item.lot === selectedLot).map((item) => <InspectionCard key={item.id} inspection={item} onPress={() => inspect(item)} />)}
        </>}
        {panel === 'inspection' && selectedInspection && <>
          <View style={styles.detailHero}><Ionicons name={selectedInspection.icon} size={33} color={selectedInspection.status === 'rejected' ? '#e52329' : '#303636'} /><Text style={styles.detailId}>{selectedInspection.id}</Text><Text style={[styles.detailStatus, selectedInspection.status === 'rejected' && styles.redText]}>{selectedInspection.status === 'rejected' ? 'Reprovado' : 'Aprovado'}</Text></View>
          {[['Lote', selectedInspection.lot], ['Categoria', analysisCategories.find((item) => item.id === selectedInspection.category)?.title], ['Resultado', selectedInspection.description], ['Horário do registro', selectedInspection.time]].map(([label, value]) => <View key={label} style={styles.detailRow}><Text style={styles.caption}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>)}
          <Text style={styles.panelHint}>Registro ilustrativo. Fotos, medições e laudos serão fornecidos pelo serviço de inspeções.</Text>
        </>}
        {panel === 'calibration' && <><View style={styles.panelIcon}><Ionicons name="scan-outline" size={36} color="#e52329" /></View><Text style={styles.detailId}>Nenhum sensor conectado</Text><Text style={styles.panelDescription}>Conecte um sensor LiDAR compatível para consultar a calibração, a precisão e a última sincronização.</Text><Text style={styles.panelHint}>A integração com o equipamento ainda não está disponível neste demonstrativo.</Text></>}
      </OperationPanel>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f8f9' },
  scrollContent: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 16 },
  content: { maxWidth: 440, width: '100%' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandIcon: { width: 33, height: 36, borderRadius: 8, backgroundColor: '#303636', alignItems: 'center', justifyContent: 'center' },
  brandCopy: { flex: 1 }, brand: { color: '#616668', fontWeight: '600', fontSize: 10, letterSpacing: 0.65 },
  pageTitle: { fontSize: 19, fontWeight: '600', color: '#252c2d', marginTop: 1 },
  demoBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 7 },
  demoDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#c08d2e' },
  demoBadgeText: { color: '#858987', fontSize: 11 },
  avatar: { backgroundColor: '#be0822', width: 34, height: 34, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  greetingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 23, marginBottom: 23, flexWrap: 'wrap' },
  greetingCopy: { flex: 1, minWidth: 160 },
  greeting: { fontSize: 24, fontWeight: '700', letterSpacing: -0.8, color: '#202727' },
  wave: { fontSize: 20 }, subtitle: { fontSize: 12, color: '#797e80', marginTop: 1, lineHeight: 17 },
  connectionBadge: { backgroundColor: '#eaecee', borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7 },
  connectionText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5, color: '#62696b' },
  goalCard: { backgroundColor: '#303232', borderRadius: 29, paddingHorizontal: 20, paddingTop: 21, paddingBottom: 15, boxShadow: '0 14px 25px rgba(33,37,39,0.13)' },
  goalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  goalCopy: { flex: 1 }, goalOverline: { color: '#b9bdbd', fontSize: 12, fontWeight: '700', letterSpacing: 0.7 },
  goalCountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 9, marginTop: 1, flexWrap: 'wrap' },
  goalCount: { color: '#fff', fontWeight: '700', fontSize: 38, lineHeight: 46 },
  goalCountLabel: { color: '#e0e1e1', fontSize: 12, fontWeight: '600' },
  progressRing: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  ringSegment: { position: 'absolute', width: 4, height: 4, borderRadius: 2, left: 24, top: 24 },
  ringText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  goalMetaRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginTop: 14, marginBottom: 17 },
  goalMeta: { color: '#d2d5d5', fontSize: 12 }, bold: { fontWeight: '700' },
  goalRemaining: { color: '#fff', fontSize: 12 },
  scanButton: { backgroundColor: '#e52329', borderRadius: 30, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 17, gap: 9, boxShadow: '0 8px 22px rgba(229,35,41,0.28)' },
  scanButtonText: { color: '#fff', fontWeight: '700', fontSize: 14, letterSpacing: -0.35 },
  goalOwner: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4, marginTop: 12 },
  goalOwnerText: { color: '#b9bebe', fontSize: 9 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 12 },
  overline: { color: '#64696b', fontSize: 10.5, fontWeight: '600', letterSpacing: 0.55 },
  link: { color: '#d62630', fontSize: 11, fontWeight: '500', paddingVertical: 4 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  categoryCard: { width: '48%', flexGrow: 1, backgroundColor: '#fff', borderRadius: 19, flexDirection: 'row', alignItems: 'center', minHeight: 86, padding: 13, gap: 10, boxShadow: '0 5px 16px rgba(28,38,44,0.025)' },
  categoryIcon: { width: 42, height: 42, backgroundColor: '#eff0f1', borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  categoryCopy: { flex: 1 }, categoryTitle: { color: '#252b2d', fontSize: 13, fontWeight: '500', lineHeight: 18 },
  categoryDescription: { color: '#838788', fontSize: 10.5, lineHeight: 18, marginTop: 1 },
  volumeCard: { backgroundColor: '#fff', borderRadius: 26, padding: 16, marginTop: 21, boxShadow: '0 6px 20px rgba(28,38,44,0.025)' },
  volumeHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  volumeTitle: { color: '#252c2c', fontSize: 19, fontWeight: '600', letterSpacing: -0.55, marginTop: 2 },
  shiftBadge: { backgroundColor: '#f0f1f3', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16 },
  shiftText: { color: '#656b6d', fontSize: 10, fontWeight: '600' },
  volumeTrack: { height: 10, borderRadius: 6, overflow: 'hidden', flexDirection: 'row', marginTop: 15 },
  volumeApproved: { backgroundColor: '#303636' }, volumeRejected: { backgroundColor: '#e52329' }, volumePending: { backgroundColor: '#969d9f' },
  volumeCaption: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4, marginTop: 8 },
  caption: { color: '#818688', fontSize: 10.5, lineHeight: 16 }, processed: { color: '#525a5c', fontSize: 10.5, lineHeight: 16 },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 19 },
  stat: { flex: 1, backgroundColor: '#f3f4f5', borderRadius: 18, paddingHorizontal: 9, paddingTop: 13, paddingBottom: 11 },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#52595b' },
  statLabel: { fontSize: 8.5, color: '#73797b' }, statNumber: { color: '#252c2c', fontSize: 20, fontWeight: '600', marginTop: 5, letterSpacing: -0.5 },
  redText: { color: '#d92530' }, redBackground: { backgroundColor: '#d92530' },
  filters: { gap: 8, paddingTop: 21, paddingBottom: 22 },
  filter: { borderRadius: 22, backgroundColor: '#f0f2f3', paddingHorizontal: 16, paddingVertical: 10 },
  activeFilter: { backgroundColor: '#303636' }, filterText: { color: '#646b6d', fontSize: 12 }, activeFilterText: { color: '#fff', fontWeight: '600' },
  inspectionsHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  calibration: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f2f4', borderRadius: 17, padding: 16, gap: 12, marginTop: 12 },
  calibrationCopy: { flex: 1 }, calibrationTitle: { color: '#2d3435', fontSize: 13, fontWeight: '500', marginBottom: 2 },
  demoNote: { color: '#929899', fontSize: 8, letterSpacing: 0.7, textAlign: 'center', marginTop: 20 },
  navigationContainer: { position: 'absolute', left: 20, right: 20, alignItems: 'center' },
  navigation: { width: '100%', maxWidth: 440, backgroundColor: '#303636', borderRadius: 40, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, minHeight: 70, boxShadow: '0 10px 25px rgba(29,36,38,0.2)' },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, gap: 5, minHeight: 62 },
  navLabel: { color: '#d3d8d8', fontSize: 9 },
  navScan: { backgroundColor: '#e52329', width: 54, height: 54, borderRadius: 28, marginHorizontal: 7, alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 16px rgba(229,35,41,0.4)' },
  pressed: { opacity: 0.7 },
  panelDescription: { fontSize: 14, lineHeight: 22, color: '#727a7c', marginBottom: 20 },
  panelHint: { color: '#838a8c', fontSize: 12, lineHeight: 19, marginTop: 18 },
  panelIcon: { width: 70, height: 70, backgroundColor: '#fff', borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  panelSpacing: { height: 15 }, empty: { backgroundColor: '#fff', padding: 22, borderRadius: 18, color: '#737c7e', fontSize: 13, lineHeight: 20 },
  panelRow: { flexDirection: 'row', gap: 13, padding: 18, backgroundColor: '#fff', borderRadius: 18, marginBottom: 12, alignItems: 'center' },
  flex: { flex: 1 }, rowTitle: { color: '#303636', fontSize: 15, fontWeight: '600', marginBottom: 3 },
  detailHero: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 22, padding: 25, gap: 10, marginBottom: 16 },
  detailId: { color: '#303636', fontSize: 20, fontWeight: '600' }, detailStatus: { color: '#303636', fontSize: 13, fontWeight: '600' },
  detailRow: { borderBottomWidth: 1, borderBottomColor: '#e7ebec', paddingVertical: 14, gap: 5 },
  detailValue: { color: '#303636', fontSize: 14, lineHeight: 20 },
});
