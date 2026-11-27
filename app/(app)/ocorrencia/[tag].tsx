import { useLocalSearchParams } from 'expo-router';

import { OccurrenceForm } from '@/components/OccurrenceForm';

/** Ocorrência de um dormente (tag vinda da tela do dormente). */
export default function OccurrenceForSleeperScreen() {
  const params = useLocalSearchParams<{ tag: string }>();
  return <OccurrenceForm tag={Array.isArray(params.tag) ? params.tag[0] : params.tag} />;
}
