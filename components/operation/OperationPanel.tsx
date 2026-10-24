import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PropsWithChildren } from 'react';

export function OperationPanel({ title, visible, onClose, children }: PropsWithChildren<{
  title: string; visible: boolean; onClose: () => void;
}>) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar painel" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={[styles.panel, { paddingBottom: Math.max(24, insets.bottom), marginTop: insets.top + 20 }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose} style={styles.close}>
              <Ionicons name="close" size={23} color="#303636" />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(22,28,29,0.4)', justifyContent: 'flex-end', alignItems: 'center' },
  panel: { backgroundColor: '#f7f8f9', borderTopLeftRadius: 30, borderTopRightRadius: 30, width: '100%', maxWidth: 520, maxHeight: '86%', paddingTop: 10 },
  handle: { backgroundColor: '#d9ddde', height: 4, width: 36, borderRadius: 3, alignSelf: 'center' },
  header: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { fontSize: 22, fontWeight: '700', color: '#262d2e', flex: 1 },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#eceff0', alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 22, paddingBottom: 12 },
});
