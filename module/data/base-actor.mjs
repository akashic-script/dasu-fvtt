import { SharedActorComponents } from './shared/components.mjs';

export default class BaseActorDataModel extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ['DASU.Actor.base'];

  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      dsid: new fields.StringField({
        required: false,
        blank: true,
        initial: '',
      }),
      publishId: new fields.StringField({ required: false }),
      level: new fields.NumberField({
        required: true,
        initial: 1,
        min: 1,
        max: 100,
        integer: true,
      }),
      merit: new fields.NumberField({
        required: true,
        initial: 0,
        min: 0,
        integer: true,
      }),
      attributes: SharedActorComponents.getAttributesSchema(),
      stats: SharedActorComponents.getStatsSchema(),
      resistances: SharedActorComponents.getResistancesSchema(),
      aptitudes: SharedActorComponents.getAptitudesSchema(),
      biography: new fields.HTMLField({
        required: false,
        initial: '',
      }),
    };
  }
}
