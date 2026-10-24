import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { OperationPanel } from '@/components/operation/OperationPanel';
import { useSession } from '@/contexts/SessionContext';

type LotStatus = 'inspection' | 'finished' | 'waiting';
type Lot = {
  id: string;
  line: string;
  supplier: string;
  status: LotStatus;
  total: number;
  approved: number;
  rejected: number;
  inspector?: string;
  finishedDate?: string;
};
type Filter = 'all' | 'inspection' | 'finished';
type Panel = 'new' | 'inspection' | 'report' | 'export' | 'scan' | 'history' | 'settings' | null;

const INITIAL_LOTS: Lot[] = [
  { id: 'LT-002', line: 'Linha 4', supplier: 'Fornecedor Ipê Tratado', status: 'inspection', total: 300, approved: 180, rejected: 20, inspector: 'Eng. João Silva' },
  { id: 'LT-001', line: 'Linha Principal', supplier: 'Fornecedor A (Madeiras ...', status: 'finished', total: 500, approved: 475, rejected: 25, finishedDate: '23/10' },
  { id: 'LT-003', line: 'Terminal Norte', supplier: 'Fornecedor Eucalipto Real', status: 'waiting', total: 800, approved: 0, rejected: 0 },
];

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'inspection', label: 'Em Inspeção' },
  { key: 'finished', label: 'Finalizados' },
];

export default function LotsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 420;
  const { profile } = useSession();
  const [lots, setLots] = useState(INITIAL_LOTS);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [panel, setPanel] = useState<Panel>(null);
  const [selectedId, setSelectedId] = useState('LT-002');
  const [newLine, setNewLine] = useState('');
  const [newSupplier, setNewSupplier] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [formError, setFormError] = useState('');

  const selectedLot = lots.find((lot) => lot.id === selectedId);
  const totalUnits = lots.reduce((sum, lot) => sum + lot.total, 0);
  const counts = {
    all: lots.length,
    inspection: lots.filter((lot) => lot.status === 'inspection').length,
    finished: lots.filter((lot) => lot.status === 'finished').length,
  };
  const query = search.trim().toLocaleLowerCase('pt-BR');
  const visibleLots = lots.filter((lot) =>
    (filter === 'all' || lot.status === filter) &&
    (!query || `${lot.id} ${lot.line} ${lot.supplier}`.toLocaleLowerCase('pt-BR').includes(query))
  );

  function openLot(lot: Lot, nextPanel: Exclude<Panel, null>) {
    setSelectedId(lot.id);
    setPanel(nextPanel);
  }

  function createLot() {
    const quantity = Number(newQuantity);
    if (!newLine.trim() || !newSupplier.trim() || !Number.isInteger(quantity) || quantity <= 0) {
      setFormError('Informe a linha, o fornecedor e uma quantidade inteira maior que zero.');
      return;
    }
    const nextNumber = Math.max(...lots.map((lot) => Number(lot.id.split('-')[1]) || 0)) + 1;
    const id = `LT-${String(nextNumber).padStart(3, '0')}`;
    setLots((current) => [...current, {
      id, line: newLine.trim(), supplier: newSupplier.trim(), status: 'waiting',
      total: quantity, approved: 0, rejected: 0,
    }]);
    setNewLine('');
    setNewSupplier('');
    setNewQuantity('');
    setFormError('');
    setFilter('all');
    setSearch('');
    setPanel(null);
  }

  function startInspection(lot: Lot) {
    setLots((current) => current.map((item) => item.id === lot.id
      ? { ...item, status: 'inspection', inspector: item.inspector || profile?.nomeCompleto || 'Inspetor CPTM' }
      : item));
    openLot(lot, 'inspection');
  }

  function registerApproval() {
    if (!selectedLot) return;
    setLots((current) => current.map((lot) => {
      if (lot.id !== selectedLot.id) return lot;
      const approved = Math.min(lot.total - lot.rejected, lot.approved + 1);
      return { ...lot, approved, status: approved + lot.rejected >= lot.total ? 'finished' : 'inspection' };
    }));
  }

  const panelTitles: Record<Exclude<Panel, null>, string> = {
    new: 'Novo Lote', inspection: selectedLot ? `Inspeção ${selectedLot.id}` : 'Inspeção',
    report: 'Relatório Final', export: 'Exportar PDF', scan: 'Selecionar lote',
    history: 'Histórico de lotes', settings: 'Ajustes',
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.headerShell}>
        <View style={styles.header}>
          <View style={styles.brandIcon}><MaterialCommunityIcons name="train" size={25} color="#fff" /></View>
          <View style={styles.brandCopy}><Text style={styles.brand}>RAILLOG INSPECT</Text><Text style={styles.pageTitle}>Lotes</Text></View>
          <View style={styles.online}><View style={styles.onlineDot} /><Text style={styles.onlineText}>Online</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Abrir perfil" onPress={() => router.push('/(tabs)/perfil')} style={styles.avatar}>
            <Ionicons name="person-outline" size={19} color="#fff" />
          </Pressable>
        </View>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 130 + insets.bottom }]}>
        <View style={styles.content}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryTop}>
              <View style={styles.summaryHeading}><Text style={[styles.overline, compact && styles.overlineCompact]}>PAINEL OPERACIONAL</Text><Text style={[styles.summaryTitle, compact && styles.summaryTitleCompact]}>Gestão de Lotes</Text></View>
              <Pressable accessibilityRole="button" accessibilityLabel="Criar novo lote" onPress={() => { setFormError(''); setPanel('new'); }}
                style={({ pressed }) => [styles.newButton, compact && styles.newButtonCompact, pressed && styles.pressed]}>
                <Ionicons name="add" size={compact ? 19 : 23} color="#fff" /><Text style={[styles.newButtonText, compact && styles.newButtonTextCompact]}>Novo Lote</Text>
              </Pressable>
            </View>
            <View style={styles.metrics}>
              <View style={styles.metric}><View style={styles.metricIcon}><MaterialCommunityIcons name="cube-scan" size={24} color="#17191b" /></View>
                <View style={styles.metricCopy}><Text style={styles.metricValue}>{totalUnits.toLocaleString('pt-BR')}</Text><Text numberOfLines={1} style={styles.metricLabel}>Dormentes totais</Text></View></View>
              <View style={styles.metric}><View style={[styles.metricIcon, styles.metricIconRed]}><MaterialCommunityIcons name="check-decagram-outline" size={24} color="#27272a" /></View>
                <View style={styles.metricCopy}><Text style={styles.metricValue}>91.2%</Text><Text numberOfLines={1} style={styles.metricLabel}>Conformidade geral</Text></View></View>
            </View>
          </View>

          <View style={styles.searchBox}><Ionicons name="search" size={22} color="#55595e" />
            <TextInput accessibilityLabel="Buscar lote ou fornecedor" autoCorrect={false} clearButtonMode="while-editing"
              onChangeText={setSearch} placeholder="Buscar lote ou fornecedor..." placeholderTextColor="#595b60"
              returnKeyType="search" style={styles.searchInput} value={search} />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {FILTERS.map((item) => <Pressable key={item.key} accessibilityRole="button" accessibilityState={{ selected: filter === item.key }}
              onPress={() => setFilter(item.key)} style={[styles.filter, filter === item.key && styles.activeFilter]}>
              <Text style={[styles.filterText, filter === item.key && styles.activeFilterText]}>{item.label} ({counts[item.key]})</Text>
            </Pressable>)}
          </ScrollView>

          <View style={styles.lotList}>
            {visibleLots.length === 0 && <View style={styles.emptyCard}><Ionicons name="search-outline" size={28} color="#8d9395" />
              <Text style={styles.emptyText}>Nenhum lote encontrado.</Text></View>}
            {visibleLots.map((lot) => {
              const processed = lot.approved + lot.rejected;
              const pending = Math.max(0, lot.total - processed);
              const progress = lot.total ? Math.round(processed / lot.total * 100) : 0;
              return <View key={lot.id} style={styles.lotCard}>
                <View style={styles.lotHeading}>
                  <View style={styles.lotIdentity}><View style={styles.lotTitleRow}><Text style={styles.lotId}>{lot.id}</Text><View style={[styles.lineDot, lot.status === 'inspection' && styles.lineDotRed]} /><Text numberOfLines={1} style={styles.lineName}>{lot.line}</Text></View>
                    <Text numberOfLines={1} style={styles.supplier}>{lot.supplier}</Text></View>
                  <View style={[styles.statusBadge, lot.status === 'inspection' ? styles.statusActive : styles.statusMuted]}>
                    {lot.status === 'finished' && <MaterialCommunityIcons name="check-all" size={15} color="#55595c" />}
                    <Text style={[styles.statusText, lot.status === 'inspection' && styles.statusTextActive]}>
                      {lot.status === 'inspection' ? 'EM INSPEÇÃO' : lot.status === 'finished' ? `Concluído ${lot.finishedDate || ''}` : 'Aguardando'}
                    </Text>
                  </View>
                </View>

                {lot.status === 'inspection' && <>
                  <View style={styles.inspectorPill}><MaterialCommunityIcons name="account-hard-hat-outline" size={17} color="#4f5459" /><Text style={styles.inspectorName}>{lot.inspector}</Text></View>
                  <View style={styles.progressHeading}><Text style={styles.mutedText}>Progresso de Auditoria</Text><Text style={styles.progressCount}>{processed} / {lot.total} <Text style={styles.mutedText}>({progress}%)</Text></Text></View>
                  <View accessibilityRole="progressbar" accessibilityLabel={`Progresso do lote ${lot.id}`} accessibilityValue={{ min: 0, max: 100, now: progress }} style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${progress}%` }]} />
                  </View>
                  <View style={styles.statsWrap}>
                    <View style={styles.statPill}><Ionicons name="checkmark-circle-outline" size={17} color="#25292c" /><Text style={styles.statNumber}>{lot.approved}</Text><Text style={styles.statLabel}>Aprovados</Text></View>
                    <View style={styles.statPill}><Ionicons name="close-circle-outline" size={17} color="#ed2027" /><Text style={styles.statNumberRed}>{lot.rejected}</Text><Text style={styles.statLabel}>Reprovados</Text></View>
                    <View style={styles.statPill}><Ionicons name="hourglass-outline" size={17} color="#5d6366" /><Text style={styles.statNumber}>{pending}</Text><Text style={styles.statLabel}>Pendentes</Text></View>
                  </View>
                  <Pressable accessibilityRole="button" onPress={() => openLot(lot, 'inspection')} style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}>
                    <Text style={styles.primaryActionText}>Continuar Inspeção</Text><Ionicons name="arrow-forward" size={23} color="#fff" />
                  </Pressable>
                </>}

                {lot.status === 'finished' && <>
                  <View style={styles.completedMetrics}><View><Text style={styles.mutedText}>Auditoria Completa</Text><Text style={styles.completedValue}>{lot.total} / {lot.total}<Text style={styles.unit}> unid.</Text></Text></View>
                    <View style={styles.completedRight}><Text style={styles.mutedText}>Conformidade</Text><Text style={styles.completedValue}>{Math.round(lot.approved / lot.total * 100)}% Aprov.</Text></View></View>
                  <View style={styles.actionRow}>
                    <Pressable accessibilityRole="button" onPress={() => openLot(lot, 'report')} style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}><MaterialCommunityIcons name="chart-box-outline" size={21} color="#212527" /><Text style={styles.secondaryActionText}>Relatório Final</Text></Pressable>
                    <Pressable accessibilityRole="button" onPress={() => openLot(lot, 'export')} style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}><MaterialCommunityIcons name="file-pdf-box" size={21} color="#212527" /><Text style={styles.secondaryActionText}>Exportar PDF</Text></Pressable>
                  </View>
                </>}

                {lot.status === 'waiting' && <>
                  <View style={styles.waitingInfo}><View style={styles.waitingIcon}><MaterialCommunityIcons name="clipboard-clock-outline" size={22} color="#62676b" /></View>
                    <View><Text style={styles.waitingQuantity}>{lot.total} unidades</Text><Text style={styles.mutedText}>Aguardando início de inspeção</Text></View></View>
                  <Pressable accessibilityRole="button" onPress={() => startInspection(lot)} style={({ pressed }) => [styles.darkAction, pressed && styles.pressed]}>
                    <Ionicons name="play-outline" size={21} color="#fff" /><Text style={styles.darkActionText}>Iniciar Lote</Text>
                  </Pressable>
                </>}
              </View>;
            })}
          </View>
        </View>
      </ScrollView>

      <View pointerEvents="box-none" style={[styles.navigationContainer, { bottom: Math.max(16, insets.bottom) }]}>
        <View style={styles.navigation}>
          <Pressable accessibilityRole="button" accessibilityLabel="Início" onPress={() => router.navigate('/(tabs)')} style={styles.navItem}><Ionicons name="grid-outline" size={24} color="#d8dcdc" /><Text style={styles.navLabel}>Início</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Lotes" accessibilityState={{ selected: true }} style={[styles.navItem, styles.navSelected]}><Ionicons name="layers-outline" size={24} color="#fff" /><Text style={styles.navLabelSelected}>Lotes</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Selecionar lote para inspeção" onPress={() => setPanel('scan')} style={styles.navScan}><Ionicons name="qr-code-outline" size={29} color="#fff" /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Histórico" onPress={() => setPanel('history')} style={styles.navItem}><Ionicons name="time-outline" size={25} color="#d8dcdc" /><Text style={styles.navLabel}>Histórico</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Ajustes" onPress={() => setPanel('settings')} style={styles.navItem}><Ionicons name="options-outline" size={25} color="#d8dcdc" /><Text style={styles.navLabel}>Ajustes</Text></Pressable>
        </View>
      </View>

      <OperationPanel title={panel ? panelTitles[panel] : ''} visible={panel !== null} onClose={() => setPanel(null)}>
        {panel === 'new' && <>
          <Text style={styles.panelDescription}>Cadastre um lote para acompanhar a inspeção.</Text>
          <Text style={styles.fieldLabel}>Linha ou local</Text><TextInput value={newLine} onChangeText={setNewLine} placeholder="Ex.: Linha 4" placeholderTextColor="#93999b" style={styles.formInput} />
          <Text style={styles.fieldLabel}>Fornecedor</Text><TextInput value={newSupplier} onChangeText={setNewSupplier} placeholder="Nome do fornecedor" placeholderTextColor="#93999b" style={styles.formInput} />
          <Text style={styles.fieldLabel}>Quantidade de unidades</Text><TextInput value={newQuantity} onChangeText={setNewQuantity} keyboardType="number-pad" placeholder="Ex.: 300" placeholderTextColor="#93999b" style={styles.formInput} />
          {!!formError && <Text accessibilityRole="alert" style={styles.formError}>{formError}</Text>}
          <Pressable accessibilityRole="button" onPress={createLot} style={styles.panelButton}><Text style={styles.panelButtonText}>Criar lote</Text></Pressable>
        </>}
        {panel === 'inspection' && selectedLot && <>
          <Text style={styles.panelDescription}>{selectedLot.line} • {selectedLot.supplier}</Text>
          <View style={styles.panelStat}><Text style={styles.panelStatNumber}>{selectedLot.approved + selectedLot.rejected} / {selectedLot.total}</Text><Text style={styles.mutedText}>unidades auditadas</Text></View>
          <Text style={styles.panelDescription}>Aprovados: {selectedLot.approved}  •  Reprovados: {selectedLot.rejected}  •  Pendentes: {Math.max(0, selectedLot.total - selectedLot.approved - selectedLot.rejected)}</Text>
          {selectedLot.status !== 'finished' && <Pressable accessibilityRole="button" onPress={registerApproval} style={styles.panelButton}><Text style={styles.panelButtonText}>Simular aprovação de 1 unidade</Text></Pressable>}
          <Text style={styles.panelHint}>Esta ação atualiza apenas os dados locais desta demonstração.</Text>
        </>}
        {panel === 'report' && selectedLot && <>
          <View style={styles.panelStat}><Text style={styles.panelStatNumber}>{selectedLot.id}</Text><Text style={styles.mutedText}>{selectedLot.line}</Text></View>
          <Text style={styles.panelDescription}>Auditoria completa: {selectedLot.total} unidades.</Text>
          <Text style={styles.panelDescription}>Aprovados: {selectedLot.approved}  •  Reprovados: {selectedLot.rejected}</Text>
          <Text style={styles.panelDescription}>Conformidade: {Math.round(selectedLot.approved / selectedLot.total * 100)}%.</Text>
        </>}
        {panel === 'export' && selectedLot && <><Text style={styles.panelDescription}>O relatório de {selectedLot.id} está pronto para consulta nesta tela.</Text><Text style={styles.panelHint}>A geração do arquivo PDF depende da integração com o serviço de relatórios.</Text></>}
        {panel === 'scan' && <><Text style={styles.panelDescription}>Selecione um lote para iniciar ou continuar a inspeção.</Text>
          {lots.filter((lot) => lot.status !== 'finished').map((lot) => <Pressable key={lot.id} accessibilityRole="button" onPress={() => lot.status === 'waiting' ? startInspection(lot) : openLot(lot, 'inspection')} style={styles.panelListItem}>
            <Ionicons name="layers-outline" size={23} color="#303636" /><View style={styles.panelListCopy}><Text style={styles.panelListTitle}>{lot.id}</Text><Text style={styles.mutedText}>{lot.line}</Text></View><Ionicons name="chevron-forward" size={18} color="#64696b" /></Pressable>)}
        </>}
        {panel === 'history' && <><Text style={styles.panelDescription}>Lotes concluídos e em andamento neste dispositivo.</Text>{lots.filter((lot) => lot.status !== 'waiting').map((lot) => <Pressable key={lot.id} accessibilityRole="button" onPress={() => openLot(lot, lot.status === 'finished' ? 'report' : 'inspection')} style={styles.panelListItem}><Ionicons name={lot.status === 'finished' ? 'checkmark-circle-outline' : 'time-outline'} size={23} color="#303636" /><View style={styles.panelListCopy}><Text style={styles.panelListTitle}>{lot.id}</Text><Text style={styles.mutedText}>{lot.status === 'finished' ? 'Concluído' : 'Em inspeção'}</Text></View><Ionicons name="chevron-forward" size={18} color="#64696b" /></Pressable>)}</>}
        {panel === 'settings' && <><Text style={styles.panelDescription}>RailLog Inspect</Text><View style={styles.panelListItem}><Ionicons name="cloud-done-outline" size={23} color="#09b983" /><View style={styles.panelListCopy}><Text style={styles.panelListTitle}>Conexão online</Text><Text style={styles.mutedText}>Dados demonstrativos locais</Text></View></View></>}
      </OperationPanel>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f8f9' },
  headerShell: { backgroundColor: '#f8f9fa', paddingHorizontal: 25 },
  header: { width: '100%', maxWidth: 450, alignSelf: 'center', height: 80, flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandIcon: { width: 40, height: 40, borderRadius: 9, backgroundColor: '#20272f', justifyContent: 'center', alignItems: 'center' },
  brandCopy: { flex: 1 }, brand: { color: '#565960', fontSize: 14, fontWeight: '600', letterSpacing: 0.5 },
  pageTitle: { color: '#101113', fontSize: 24, fontWeight: '500', lineHeight: 27 },
  online: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f6f7f8', borderRadius: 18, paddingHorizontal: 9, paddingVertical: 7 },
  onlineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#08b983' }, onlineText: { color: '#61636a', fontSize: 14 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#bc0019', alignItems: 'center', justifyContent: 'center' },
  scrollContent: { alignItems: 'center', paddingHorizontal: 25 }, content: { width: '100%', maxWidth: 450 },
  summaryCard: { backgroundColor: '#fff', borderRadius: 38, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20, shadowColor: '#a9adb0', shadowOffset: { width: 0, height: 9 }, shadowOpacity: 0.07, shadowRadius: 24, elevation: 2 },
  summaryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, summaryHeading: { flex: 1 },
  overline: { color: '#575a60', fontWeight: '700', fontSize: 14, letterSpacing: 0.2 },
  overlineCompact: { fontSize: 11 },
  summaryTitle: { color: '#090a0b', fontSize: 27, fontWeight: '600', letterSpacing: -1.1, marginTop: 2 },
  summaryTitleCompact: { fontSize: 21, letterSpacing: -0.6 },
  newButton: { height: 55, borderRadius: 29, backgroundColor: '#e31f23', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 19, gap: 7, shadowColor: '#e31f23', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.22, shadowRadius: 15, elevation: 7 },
  newButtonCompact: { height: 48, paddingHorizontal: 12, gap: 4 },
  newButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  newButtonTextCompact: { fontSize: 13 },
  metrics: { flexDirection: 'row', gap: 10, marginTop: 25 }, metric: { flex: 1, minWidth: 0, height: 70, backgroundColor: '#f2f3f4', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 10 },
  metricIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#e0e2e3', alignItems: 'center', justifyContent: 'center' },
  metricIconRed: { backgroundColor: '#ffdddb' }, metricCopy: { minWidth: 0, flex: 1 }, metricValue: { color: '#0c0e10', fontSize: 23, fontWeight: '600', letterSpacing: -0.5 },
  metricLabel: { color: '#5e6066', fontSize: 13 },
  searchBox: { height: 66, borderRadius: 35, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 22, marginTop: 20, shadowColor: '#b8bec0', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.05, shadowRadius: 14, elevation: 1 },
  searchInput: { flex: 1, color: '#24272b', fontSize: 17, paddingVertical: 0 },
  filters: { flexDirection: 'row', gap: 6, paddingTop: 15, paddingBottom: 24 },
  filter: { height: 45, borderRadius: 23, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, shadowColor: '#b9bfc1', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 1 },
  activeFilter: { backgroundColor: '#2c3030', borderColor: '#111', borderWidth: 1 }, filterText: { color: '#4b4e53', fontSize: 15, fontWeight: '500' }, activeFilterText: { color: '#fff', fontWeight: '700' },
  lotList: { gap: 20 }, lotCard: { backgroundColor: '#fff', borderRadius: 38, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 21, shadowColor: '#b9bec1', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 22, elevation: 2 },
  lotHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 7 }, lotIdentity: { flex: 1, minWidth: 0 },
  lotTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, lotId: { color: '#0a0b0d', fontSize: 24, fontWeight: '500', letterSpacing: 0.1 },
  lineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#5b6065' }, lineDotRed: { backgroundColor: '#e42227' }, lineName: { color: '#55585e', fontSize: 13, fontWeight: '700', flexShrink: 1 },
  supplier: { color: '#191b1e', fontSize: 17, marginTop: 4 },
  statusBadge: { minHeight: 28, borderRadius: 17, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  statusActive: { backgroundColor: '#292d2e' }, statusMuted: { backgroundColor: '#e8e9eb' }, statusText: { color: '#4d5055', fontSize: 13, fontWeight: '700' }, statusTextActive: { color: '#fff' },
  inspectorPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#f2f3f4', borderRadius: 22, paddingHorizontal: 16, height: 40, marginTop: 22 },
  inspectorName: { color: '#16191b', fontSize: 13, fontWeight: '700' },
  progressHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 23, gap: 8 },
  mutedText: { color: '#606269', fontSize: 14 }, progressCount: { color: '#141618', fontSize: 17, fontWeight: '500' },
  progressTrack: { height: 11, backgroundColor: '#e7e8ea', borderRadius: 6, marginTop: 7, overflow: 'hidden' }, progressFill: { height: 11, borderRadius: 6, backgroundColor: '#e62126' },
  statsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 25 },
  statPill: { minHeight: 36, borderRadius: 20, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#f2f3f4' },
  statNumber: { color: '#17191b', fontSize: 14 }, statNumberRed: { color: '#e52229', fontSize: 14 }, statLabel: { color: '#63666c', fontSize: 14 },
  primaryAction: { height: 65, borderRadius: 34, backgroundColor: '#e42125', marginTop: 25, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 13, shadowColor: '#df272b', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.22, shadowRadius: 18, elevation: 7 },
  primaryActionText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  completedMetrics: { backgroundColor: '#f2f3f4', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 15, paddingVertical: 14, marginTop: 21, gap: 8 },
  completedRight: { alignItems: 'flex-end' }, completedValue: { color: '#0b0d0f', fontSize: 22, fontWeight: '600' }, unit: { color: '#5b6063', fontSize: 14, fontWeight: '400' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 25 }, secondaryAction: { flex: 1, height: 55, borderRadius: 29, backgroundColor: '#e7e8ea', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }, secondaryActionText: { color: '#151719', fontSize: 15, fontWeight: '500' },
  waitingInfo: { backgroundColor: '#f2f3f4', flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 15, height: 75, marginTop: 21 },
  waitingIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e1e3e4' }, waitingQuantity: { color: '#191b1d', fontSize: 16, fontWeight: '500' },
  darkAction: { height: 55, borderRadius: 28, backgroundColor: '#2b3031', marginTop: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }, darkActionText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  emptyCard: { backgroundColor: '#fff', padding: 32, borderRadius: 28, alignItems: 'center', gap: 10 }, emptyText: { color: '#62686a', fontSize: 15 },
  navigationContainer: { position: 'absolute', left: 25, right: 25, alignItems: 'center' },
  navigation: { width: '100%', maxWidth: 450, minHeight: 80, borderRadius: 42, backgroundColor: '#383c3d', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, shadowColor: '#1a1e1f', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 24, elevation: 8 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 60, borderRadius: 34 }, navSelected: { backgroundColor: '#2c3031' },
  navLabel: { color: '#d3d7d7', fontSize: 12 }, navLabelSelected: { color: '#fff', fontSize: 12 },
  navScan: { width: 60, height: 60, borderRadius: 30, marginHorizontal: 7, backgroundColor: '#e62328', alignItems: 'center', justifyContent: 'center', shadowColor: '#e62328', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.4, shadowRadius: 14, elevation: 8 },
  pressed: { opacity: 0.75 },
  panelDescription: { color: '#555d60', fontSize: 15, lineHeight: 22, marginBottom: 16 }, panelHint: { color: '#81888a', fontSize: 12, lineHeight: 18, marginTop: 15 },
  fieldLabel: { color: '#343a3c', fontWeight: '700', fontSize: 13, marginTop: 12, marginBottom: 6 },
  formInput: { backgroundColor: '#fff', borderRadius: 16, height: 50, paddingHorizontal: 15, fontSize: 15, color: '#202629' },
  formError: { color: '#bd1020', fontSize: 13, lineHeight: 19, marginTop: 12 },
  panelButton: { backgroundColor: '#e32126', borderRadius: 25, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 25 }, panelButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  panelStat: { backgroundColor: '#fff', borderRadius: 22, padding: 24, alignItems: 'center', gap: 6, marginBottom: 18 }, panelStatNumber: { fontSize: 23, fontWeight: '700', color: '#252b2c' },
  panelListItem: { backgroundColor: '#fff', borderRadius: 18, padding: 17, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }, panelListCopy: { flex: 1 }, panelListTitle: { color: '#262c2e', fontSize: 16, fontWeight: '600' },
});
