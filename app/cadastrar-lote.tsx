import Ionicons from '@expo/vector-icons/Ionicons';
import { usePreventRemove, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/contexts/SessionContext';
import { createLot, type Material } from '@/data/inspection-store';

const MATERIALS: Material[] = ['Ipê', 'Aroeira', 'Eucalipto', 'Concreto'];
const today = () => new Date().toISOString().slice(0, 10);

export default function CreateLotScreen() {
  const router = useRouter();
  const { profile } = useSession();
  const [line, setLine] = useState('');
  const [location, setLocation] = useState('');
  const [supplier, setSupplier] = useState('');
  const [material, setMaterial] = useState<Material | null>(null);
  const [quantity, setQuantity] = useState('');
  const [receiptDate, setReceiptDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const dirty = !!(line || location || supplier || material || quantity || notes || receiptDate !== today());
  const disablePrevention = usePreventRemove(dirty && !saving, ({ repeat }) => {
    if (Platform.OS === 'web') { if (window.confirm('Descartar os dados preenchidos?')) repeat(); }
    else Alert.alert('Descartar cadastro?', 'Os dados preenchidos serão perdidos.', [
      { text: 'Continuar editando', style: 'cancel' }, { text: 'Descartar', style: 'destructive', onPress: repeat },
    ]);
  });

  function cancel() {
    if (!dirty) { router.back(); return; }
    if (Platform.OS === 'web') {
      if (window.confirm('Descartar os dados preenchidos?')) { disablePrevention(); router.back(); }
      return;
    }
    Alert.alert('Descartar cadastro?', 'Os dados preenchidos serão perdidos.', [
      { text: 'Continuar editando', style: 'cancel' },
      { text: 'Descartar', style: 'destructive', onPress: () => { disablePrevention(); router.back(); } },
    ]);
  }

  async function save(start: boolean) {
    if (saving) return;
    const total = Number(quantity);
    if (!line.trim() || !location.trim() || !supplier.trim() || !material || !Number.isInteger(total) || total <= 0) {
      setError('Preencha linha, trecho, fornecedor, material e uma quantidade inteira maior que zero.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(receiptDate) || Number.isNaN(Date.parse(`${receiptDate}T12:00:00`))) {
      setError('Informe a data no formato AAAA-MM-DD.'); return;
    }
    if (!profile) { setError('Entre novamente para identificar o operador responsável.'); return; }
    setSaving(true); setError('');
    try {
      const lot = await createLot({ line: line.trim(), location: location.trim(), supplier: supplier.trim(), predominantMaterial: material,
        total, receiptDate, notes: notes.trim(), operatorId: profile.matriculaOuEmail, operatorName: profile.nomeCompleto }, start);
      disablePrevention();
      if (start) router.replace({ pathname: '/inspecionar/[lotId]', params: { lotId: lot.id } });
      else router.replace('/(tabs)/lotes');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o lote.'); setSaving(false); }
  }

  return <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
    <View style={styles.header}><Pressable onPress={cancel} accessibilityRole="button" accessibilityLabel="Voltar" style={styles.back}><Ionicons name="arrow-back" size={23} color="#24292c" /></Pressable>
      <View><Text style={styles.title}>Novo Lote</Text><Text style={styles.subtitle}>Cadastro de lote para inspeção</Text></View></View>
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={styles.card}><Text style={styles.cardTitle}>Identificação do lote</Text>
          <Text style={styles.hint}>O código será criado automaticamente ao salvar.</Text>
          <Field label="Linha ferroviária *" value={line} onChangeText={setLine} placeholder="Identificação da linha" />
          <Field label="Trecho ou localização *" value={location} onChangeText={setLocation} placeholder="Trecho operacional" />
          <Field label="Fornecedor *" value={supplier} onChangeText={setSupplier} placeholder="Nome do fornecedor" />
          <Text style={styles.label}>Material predominante *</Text>
          <View style={styles.options}>{MATERIALS.map((option) => <Pressable key={option} onPress={() => setMaterial(option)} accessibilityRole="button" accessibilityState={{ selected: material === option }} style={[styles.option, material === option && styles.selected]}><Text style={[styles.optionText, material === option && styles.selectedText]}>{option}</Text></Pressable>)}</View>
          <Field label="Quantidade de dormentes *" value={quantity} onChangeText={setQuantity} placeholder="Número de unidades" keyboardType="number-pad" />
          <Field label="Data de recebimento *" value={receiptDate} onChangeText={setReceiptDate} placeholder="AAAA-MM-DD" keyboardType="numbers-and-punctuation" />
          <Field label="Observações" value={notes} onChangeText={setNotes} placeholder="Informações adicionais" multiline />
        </View>
        <View style={styles.card}><Text style={styles.cardTitle}>Responsável</Text><Text style={styles.info}>{profile?.nomeCompleto || 'Operador não identificado'}</Text><Text style={styles.hint}>{profile?.matriculaOuEmail || ''}</Text><Text style={styles.hint}>Data e horário de criação registrados ao salvar.</Text></View>
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Pressable disabled={saving} onPress={() => save(true)} style={styles.primary}><Text style={styles.primaryText}>{saving ? 'Salvando...' : 'Salvar e Iniciar Inspeção'}</Text></Pressable>
        <Pressable disabled={saving} onPress={() => save(false)} style={styles.secondary}><Text style={styles.secondaryText}>Salvar Lote</Text></Pressable>
        <Pressable onPress={cancel} style={styles.cancel}><Text style={styles.cancelText}>Cancelar</Text></Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function Field(props: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: 'number-pad' | 'numbers-and-punctuation'; multiline?: boolean }) {
  return <View><Text style={styles.label}>{props.label}</Text><TextInput {...props} accessibilityLabel={props.label} placeholderTextColor="#93999b" style={[styles.input, props.multiline && styles.multiline]} /></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f8f9' }, fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 22, paddingVertical: 17, backgroundColor: '#fff' },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#f1f2f3', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: '#17191b' }, subtitle: { fontSize: 13, color: '#666b70' },
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', padding: 20, paddingBottom: 40, gap: 14 },
  card: { backgroundColor: '#fff', borderRadius: 28, padding: 20 }, cardTitle: { color: '#1a1c1e', fontSize: 19, fontWeight: '700', marginBottom: 5 },
  label: { fontSize: 14, fontWeight: '600', color: '#34393b', marginTop: 16, marginBottom: 7 },
  input: { minHeight: 49, borderRadius: 15, backgroundColor: '#f3f4f5', paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: '#1d2224' },
  multiline: { minHeight: 85, textAlignVertical: 'top' }, hint: { color: '#73797c', fontSize: 13, lineHeight: 19 }, info: { fontSize: 16, fontWeight: '600', color: '#24282b', marginTop: 8 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, option: { borderRadius: 16, paddingHorizontal: 15, minHeight: 43, justifyContent: 'center', backgroundColor: '#f1f2f3' },
  selected: { backgroundColor: '#e52127' }, optionText: { color: '#363b3d', fontWeight: '600' }, selectedText: { color: '#fff' },
  error: { color: '#bc101d', fontSize: 14, lineHeight: 20 }, primary: { backgroundColor: '#e42125', borderRadius: 29, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' }, secondary: { backgroundColor: '#e7e8ea', borderRadius: 29, minHeight: 53, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#222729', fontSize: 16, fontWeight: '700' }, cancel: { minHeight: 44, justifyContent: 'center', alignItems: 'center' }, cancelText: { color: '#5b6265', fontSize: 15 },
});
