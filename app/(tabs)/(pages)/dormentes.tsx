import { type Href, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge, Banner, EmptyState, Field } from '@/components/ui';
import { COLOR, FONT_CODE, FONT_SIZE, MIN_TOUCH, RADIUS, SPACE, type Tone } from '@/constants/theme';
import { errorMessage, NetworkError } from '@/data/api/client';
import { listSleepers } from '@/data/api/endpoints';
import type { SleeperRead, SleeperStatus } from '@/data/api/types';
import { SLEEPER_STATUS, speciesLabel } from '@/data/labels';

const PAGE_SIZE = 50;
const STATUSES = Object.keys(SLEEPER_STATUS) as SleeperStatus[];

/** Lista paginada de dormentes com busca (tag/ata) e filtro de status; toque abre o dormente. */
export default function SleepersScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<SleeperStatus | null>(null);
  const [items, setItems] = useState<SleeperRead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Descarta respostas de buscas antigas (digitação rápida / troca de filtro).
  const requestId = useRef(0);

  // Debounce de 300 ms na busca por texto.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(
    async (offset: number, mode: 'replace' | 'append') => {
      const id = ++requestId.current;
      setLoading(true);
      try {
        const page = await listSleepers({
          q: query || undefined,
          status: status ?? undefined,
          limit: PAGE_SIZE,
          offset,
        });
        if (id !== requestId.current) return;
        setItems((prev) => (mode === 'append' ? [...prev, ...page.items] : page.items));
        setTotal(page.total);
        setError(null);
      } catch (e) {
        if (id !== requestId.current) return;
        setError(e instanceof NetworkError ? 'Lista indisponível sem conexão' : errorMessage(e));
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [query, status],
  );

  useEffect(() => {
    void load(0, 'replace');
  }, [load]);

  function loadMore() {
    // `loading` cobre a página em andamento; com erro não insiste, para não repetir em loop offline.
    if (loading || error || items.length === 0 || items.length >= total) return;
    void load(items.length, 'append');
  }

  return (
    <SafeAreaView style={styles.screen}>
      {error ? <Banner tone="warn" text={error} /> : null}
      <FlatList
        data={items}
        keyExtractor={(s) => s.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          void load(0, 'replace');
        }}
        ListHeaderComponent={
          <View style={styles.header}>
            <Field
              label="Buscar por tag ou ata"
              mono
              autoCapitalize="characters"
              autoCorrect={false}
              value={search}
              onChangeText={setSearch}
              maxLength={64}
              returnKeyType="search"
            />
            <View style={styles.chips}>
              <Chip text="Todos" selected={status === null} onPress={() => setStatus(null)} />
              {STATUSES.map((s) => (
                <Chip
                  key={s}
                  text={SLEEPER_STATUS[s].label}
                  tone={SLEEPER_STATUS[s].tone}
                  selected={status === s}
                  onPress={() => setStatus(s)}
                />
              ))}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/dormente/${encodeURIComponent(item.rfid_tag)}` as Href)}
            style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
          >
            <View style={styles.rowText}>
              <Text style={styles.tag}>{item.rfid_tag}</Text>
              <Text style={styles.sub}>
                {[speciesLabel(item.species) || undefined, item.current_location?.name]
                  .filter(Boolean)
                  .join(' · ') || 'Sem espécie/local'}
              </Text>
            </View>
            <Badge
              text={SLEEPER_STATUS[item.status]?.label ?? item.status}
              tone={SLEEPER_STATUS[item.status]?.tone ?? 'neutro'}
            />
          </Pressable>
        )}
        ListEmptyComponent={loading || error ? undefined : <EmptyState text="Nenhum dormente encontrado." />}
        ListFooterComponent={
          loading && !refreshing ? <ActivityIndicator color={COLOR.red} style={styles.spinner} /> : undefined
        }
      />
    </SafeAreaView>
  );
}

/** Chip de filtro: selecionado usa o tom do status e borda vermelha. */
function Chip({
  text,
  tone,
  selected,
  onPress,
}: {
  text: string;
  tone?: Tone;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected ? styles.chipSelected : null]}
    >
      <Badge text={text} tone={selected ? (tone ?? 'neutro') : 'neutro'} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.bg },
  content: { padding: SPACE.lg, gap: SPACE.sm },
  header: { gap: SPACE.md, marginBottom: SPACE.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  chip: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    paddingHorizontal: SPACE.xs,
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: RADIUS.field,
  },
  chipSelected: { borderColor: COLOR.red },
  row: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.md,
    padding: SPACE.md,
    backgroundColor: COLOR.panel,
    borderWidth: 1,
    borderColor: COLOR.line,
    borderRadius: RADIUS.panel,
  },
  pressed: { opacity: 0.85 },
  rowText: { flex: 1, gap: 2 },
  tag: { fontFamily: FONT_CODE, fontSize: FONT_SIZE.base, color: COLOR.text, fontWeight: '600' },
  sub: { fontSize: FONT_SIZE.small, color: COLOR.textDim },
  spinner: { paddingVertical: SPACE.lg },
});
