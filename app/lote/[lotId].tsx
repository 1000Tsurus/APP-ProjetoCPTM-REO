import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { workflowStyles as styles } from '@/components/operation/workflow-styles';
import { useSession } from '@/contexts/SessionContext';
import { authorizeLot } from '@/data/access-service';
import { loadOperationalStore, lotMetrics, type Store } from '@/data/inspection-store';

export default function LotDetailsScreen() {
  const { lotId } = useLocalSearchParams<{ lotId: string }>();
  const { profile } = useSession();
  const router = useRouter();
  const [store, setStore] = useState<Store | null>(null);
  const [error, setError] = useState('');
  useFocusEffect(useCallback(() => {
    let alive = true; setStore(null); setError('');
    if (!profile) return;
    (async () => { await authorizeLot(lotId, 'read'); const value = await loadOperationalStore(); if (!value.lots.some((item) => item.id === lotId)) throw new Error('Lote não encontrado ou não autorizado.'); if (alive) setStore(value); })().catch((cause) => { if (alive) setError(cause instanceof Error ? cause.message : 'Falha ao carregar o lote.'); });
    return () => { alive = false; };
  }, [lotId, profile]));
  if (!profile) return <Redirect href="/login" />;
  const lot = store?.lots.find((item) => item.id === lotId);
  return <SafeAreaView style={styles.screen}><FlatList contentContainerStyle={styles.content}
    data={lot ? Array.from({ length: lot.total }, (_, index) => `${lot.code}-D${String(index + 1).padStart(4, '0')}`) : []}
    keyExtractor={(id) => id} ListHeaderComponent={<View style={{ gap: 14 }}>
      <Pressable accessibilityRole="button" onPress={() => router.replace('/(tabs)/(pages)/lotes')} style={styles.secondary}><Text>Voltar aos lotes</Text></Pressable>
      <Text style={styles.title}>{lot?.code || 'Lote'}</Text>{!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {lot && store && <><View style={styles.card}><Text style={styles.heading}>{lot.line} · {lot.location}</Text><Text style={styles.hint}>Fornecedor: {lot.supplier} · Material: {lot.predominantMaterial}</Text><Text style={styles.hint}>{lot.total} dormentes · {lotMetrics(store, lot).completed} inspecionados · {lot.status === 'finished' ? 'Finalizado' : 'Em operação'}</Text><Text style={styles.hint}>Recebimento: {lot.receiptDate}</Text>{!!lot.notes && <Text style={styles.hint}>{lot.notes}</Text>}</View><Text style={styles.heading}>Dormentes do lote de origem</Text><Text style={styles.hint}>Abra um dormente para consultar seu histórico ou registrar uma nova avaria, inclusive em lotes finalizados.</Text></>}
    </View>}
    renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/dormente/[sleeperId]', params: { sleeperId: item } })} style={styles.card}><Text style={styles.heading}>{item}</Text><Text style={styles.hint}>{store?.inspections.filter((event) => event.sleeperId === item).length || 0} registro(s) · Consultar dormente →</Text></Pressable>} />
  </SafeAreaView>;
}
