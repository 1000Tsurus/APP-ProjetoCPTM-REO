import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Inspection } from '@/data/operational-summary';

export function InspectionCard({ inspection, onPress }: { inspection: Inspection; onPress: () => void }) {
  const rejected = inspection.status === 'rejected';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${inspection.id}, ${rejected ? 'reprovado' : 'aprovado'}, ${inspection.lot}. Ver detalhes`}
      onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={[styles.icon, rejected && styles.rejectedIcon]}>
        <Ionicons name={inspection.icon} size={21} color={rejected ? '#ce202b' : '#303535'} />
      </View>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{inspection.id}</Text>
          <View style={styles.lot}><Text style={styles.lotText}>{inspection.lot}</Text></View>
        </View>
        <Text style={styles.description}>{inspection.description} • {inspection.time}</Text>
      </View>
      <View style={[styles.badge, rejected && styles.rejectedBadge]}>
        <Text style={styles.badgeText}>{rejected ? 'Reprovado' : 'Aprovado'}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 19, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, paddingVertical: 16, minHeight: 76, marginBottom: 10, boxShadow: '0 5px 20px rgba(32,38,42,0.025)', flexWrap: 'wrap' },
  pressed: { opacity: 0.65 },
  icon: { width: 41, height: 41, borderRadius: 22, backgroundColor: '#eff0f1', alignItems: 'center', justifyContent: 'center' },
  rejectedIcon: { backgroundColor: '#ffdddd' },
  copy: { flex: 1, minWidth: 144 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  title: { fontSize: 14, fontWeight: '700', color: '#262c2c', letterSpacing: -0.3 },
  lot: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 12, backgroundColor: '#f2f3f3' },
  lotText: { color: '#747979', fontSize: 9 },
  description: { fontSize: 10.5, lineHeight: 16, color: '#7b7f80', marginTop: 3 },
  badge: { backgroundColor: '#303636', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  rejectedBadge: { backgroundColor: '#e52329', boxShadow: '0 3px 8px rgba(229,35,41,0.18)' },
  badgeText: { fontSize: 10, color: '#fff', fontWeight: '700' },
});
