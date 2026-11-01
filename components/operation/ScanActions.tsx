import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

export function ScanActions({ onChoose }: { onChoose?: () => void }) {
  const router = useRouter();
  return <>
    <Text style={styles.hint}>Localize um dormente ou lote existente. A leitura não altera registros.</Text>
    {([{ mode: 'qr', label: 'Ler QR Code', icon: 'qr-code-outline' }, { mode: 'nfc', label: 'Ler NFC', icon: 'radio-outline' }] as const).map((item) =>
      <Pressable key={item.mode} accessibilityRole="button" onPress={() => { onChoose?.(); router.push({ pathname: '/ler-etiqueta', params: { mode: item.mode } }); }} style={styles.action}>
        <Ionicons name={item.icon} size={27} color="#e42125" /><Text style={styles.label}>{item.label}</Text><Ionicons name="chevron-forward" size={20} color="#666" />
      </Pressable>)}
    <Text style={styles.hint}>NFC exige aparelho compatível e development build. Não está disponível no Expo Go nem na web. QR continua disponível com permissão da câmera.</Text>
  </>;
}
const styles = StyleSheet.create({
  action: { flexDirection: 'row', alignItems: 'center', gap: 15, backgroundColor: '#fff', borderRadius: 22, padding: 20, marginVertical: 7, minHeight: 70 },
  label: { flex: 1, fontSize: 18, fontWeight: '700', color: '#252c2d' }, hint: { color: '#687073', fontSize: 14, lineHeight: 21, marginVertical: 10 },
});
