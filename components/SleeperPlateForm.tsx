import { StyleSheet, Text } from 'react-native';

import { Field, OptionPicker, Panel, SectionTitle } from '@/components/ui';
import { COLOR, FONT_SIZE, SPACE } from '@/constants/theme';
import type { SpeciesRead } from '@/data/api/types';
import { speciesLabel } from '@/data/labels';
import type { SleeperFormField } from '@/data/sleeper-form';

export type PlateValues = {
  registration_record: string;
  wood_class: string;
  length_m: string;
  treatment: string;
  supplier: string;
  inspection_company: string;
  manufacture_year: string;
  species_id: string;
};

type Props = {
  values: PlateValues;
  onChange: (key: keyof PlateValues, value: string) => void;
  errors: Partial<Record<SleeperFormField, string>>;
  species: SpeciesRead[];
  /** Espécie só é editável por especialista e admin; para os outros o seletor nem aparece. */
  canEditSpecies: boolean;
};

/** Campos da plaqueta do dormente (ata, classe, medidas, origem e, se permitido, espécie). */
export function SleeperPlateForm({ values, onChange, errors, species, canEditSpecies }: Props) {
  const err = (k: SleeperFormField) => (errors[k] ? <Text style={styles.error}>{errors[k]}</Text> : null);
  return (
    <Panel style={styles.panel}>
      <SectionTitle icon="pricetag-outline" title="Plaqueta" />
      {canEditSpecies ? (
        <OptionPicker
          label="Espécie"
          value={values.species_id || null}
          onChange={(id) => onChange('species_id', id ?? '')}
          clearable
          options={species.map((s) => ({ id: s.id, label: speciesLabel(s) }))}
          error={errors.species_id}
          emptyText="Espécies indisponíveis sem conexão."
        />
      ) : null}
      <Field
        label="Ata"
        mono
        value={values.registration_record}
        onChangeText={(v) => onChange('registration_record', v)}
        autoCapitalize="characters"
      />
      {err('registration_record')}
      <Field label="Classe" value={values.wood_class} onChangeText={(v) => onChange('wood_class', v)} />
      {err('wood_class')}
      <Field
        label="Comprimento (m)"
        value={values.length_m}
        onChangeText={(v) => onChange('length_m', v)}
        keyboardType="decimal-pad"
        style={errors.length_m ? styles.fieldError : null}
      />
      {err('length_m')}
      <Field label="Tratamento" value={values.treatment} onChangeText={(v) => onChange('treatment', v)} />
      <Field label="Fornecedor" value={values.supplier} onChangeText={(v) => onChange('supplier', v)} />
      <Field
        label="Empresa inspetora"
        value={values.inspection_company}
        onChangeText={(v) => onChange('inspection_company', v)}
      />
      <Field
        label="Ano de fabricação"
        value={values.manufacture_year}
        onChangeText={(v) => onChange('manufacture_year', v)}
        keyboardType="number-pad"
        maxLength={4}
        style={errors.manufacture_year ? styles.fieldError : null}
      />
      {err('manufacture_year')}
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: { gap: SPACE.md },
  error: { fontSize: FONT_SIZE.caption, color: COLOR.red },
  fieldError: { borderColor: COLOR.red },
});
