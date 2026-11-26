import { useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { Banner, Button, ChoiceRow, Field, OptionPicker, Panel } from '@/components/ui';
import { SPACE } from '@/constants/theme';
import type { LocationRead, OccurrenceKind } from '@/data/api/types';
import type { BatchTask } from '@/data/batch';
import { getLocations } from '@/data/catalog-cache';
import { OCCURRENCE_KIND } from '@/data/labels';
import { composeDescription, OCCURRENCE_PHRASES, validateDescription } from '@/data/occurrence-phrases';
import { getRecentLocationIds } from '@/data/recent-locations';

const KINDS = (Object.keys(OCCURRENCE_KIND) as OccurrenceKind[]).map((id) => ({ id, label: OCCURRENCE_KIND[id] }));

type Props = { kind: BatchTask['kind']; userId: string; onStart: (task: BatchTask) => void };

/** Escolhas que valem para o lote todo (local, RM ou ocorrência), feitas uma vez antes de ler. */
export function BatchPrepare({ kind, userId, onStart }: Props) {
  const [locations, setLocations] = useState<LocationRead[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [requisition, setRequisition] = useState('');
  const [occKind, setOccKind] = useState<OccurrenceKind>('damage');
  const [phrase, setPhrase] = useState<string | null>(null);
  const [free, setFree] = useState('');
  const [error, setError] = useState<string | null>(null);
  const moves = kind === 'receive' || kind === 'transfer';

  useEffect(() => {
    if (!moves) return;
    let alive = true;
    Promise.all([getLocations(), getRecentLocationIds(userId)])
      .then(([cat, recentList]) => {
        if (!alive) return;
        setLocations(cat.items.filter((l) => l.active));
        setRecentIds(recentList);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [moves, userId]);

  const recent = useMemo(
    () => recentIds.map((id) => locations.find((l) => l.id === id)).filter((l): l is LocationRead => !!l),
    [recentIds, locations],
  );

  function start() {
    if (kind === 'receive' || kind === 'transfer') {
      const target = locations.find((l) => l.id === locationId);
      if (!target) return setError('Escolha o local.');
      return onStart({ kind, locationId: target.id, locationName: target.name });
    }
    if (kind === 'withdraw') {
      const rm = requisition.trim();
      if (!rm) return setError('Informe a RM (requisição de material).');
      return onStart({ kind: 'withdraw', requisitionNumber: rm });
    }
    const description = composeDescription(phrase, free);
    const problem = validateDescription(description);
    if (problem) return setError(problem);
    onStart({ kind: 'occurrence', occurrenceKind: occKind, description });
  }

  return (
    <>
      <Panel style={styles.panel}>
        {moves ? (
          <>
            {recent.length > 0 ? (
              <ChoiceRow
                label="Últimos usados"
                options={recent.map((l) => ({ id: l.id, label: l.name }))}
                value={locationId}
                onChange={setLocationId}
              />
            ) : null}
            <OptionPicker
              label={kind === 'receive' ? 'Local de recebimento' : 'Local de destino'}
              options={locations.map((l) => ({ id: l.id, label: l.name }))}
              value={locationId}
              onChange={setLocationId}
              emptyText="Nenhum local no aparelho. Conecte-se para carregar."
            />
          </>
        ) : null}
        {kind === 'withdraw' ? (
          <Field
            label="RM (requisição de material)"
            mono
            value={requisition}
            onChangeText={setRequisition}
            autoCapitalize="characters"
            maxLength={40}
          />
        ) : null}
        {kind === 'occurrence' ? (
          <>
            <ChoiceRow
              label="Tipo"
              options={KINDS}
              value={occKind}
              onChange={(k) => {
                setOccKind(k);
                setPhrase(null);
              }}
            />
            {OCCURRENCE_PHRASES[occKind].length > 0 ? (
              <ChoiceRow
                label="Frase pronta"
                options={OCCURRENCE_PHRASES[occKind].map((p) => ({ id: p, label: p }))}
                value={phrase}
                onChange={setPhrase}
              />
            ) : null}
            <Field label="Texto livre (opcional com frase)" value={free} onChangeText={setFree} multiline maxLength={2000} />
          </>
        ) : null}
      </Panel>
      {error ? <Banner tone="warn" text={error} /> : null}
      <Button title="Começar a ler" icon="scan" onPress={start} />
    </>
  );
}

const styles = StyleSheet.create({ panel: { gap: SPACE.md } });
