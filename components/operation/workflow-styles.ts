import { StyleSheet } from 'react-native';
export const workflowStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f8f9' },
  content: { width: '100%', maxWidth: 550, alignSelf: 'center', padding: 20, gap: 14, paddingBottom: 45 },
  title: { fontSize: 25, color: '#202727', fontWeight: '700' },
  heading: { fontSize: 18, color: '#252c2d', fontWeight: '700' },
  hint: { fontSize: 14, color: '#656d70', lineHeight: 21 },
  card: { backgroundColor: '#fff', borderRadius: 25, padding: 20, gap: 10 },
  input: { minHeight: 48, backgroundColor: '#f0f2f3', borderRadius: 15, padding: 12, fontSize: 16, color: '#252c2d' },
  primary: { backgroundColor: '#e42125', borderRadius: 28, minHeight: 54, justifyContent: 'center', alignItems: 'center', padding: 14 },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16, textAlign: 'center' },
  secondary: { backgroundColor: '#e9ecee', borderRadius: 22, minHeight: 48, justifyContent: 'center', alignItems: 'center', padding: 12 },
  error: { color: '#b71924', lineHeight: 21, fontSize: 14 },
  notice: { color: '#7b4b18', backgroundColor: '#fff0dc', padding: 15, borderRadius: 16, fontSize: 14, lineHeight: 21 },
  image: { width: '100%', height: 180, borderRadius: 15 },
});
