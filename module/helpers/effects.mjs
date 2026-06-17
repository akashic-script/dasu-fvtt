/**
 * Manage Active Effect instances through an Actor or Item Sheet via effect control buttons.
 * @param {MouseEvent} event      The left-click event on the effect control
 * @param {Actor|Item} owner      The owning document which manages this effect
 * @param {HTMLElement} [element] The clicked control element (required for ApplicationV2 actions)
 */
export function onManageActiveEffect(event, owner, element) {
  event.preventDefault();
  const a = element ?? event.currentTarget;
  const li = a.closest('li');
  const effect = li.dataset.effectId
    ? owner.effects.get(li.dataset.effectId)
    : null;
  const effectType = li.dataset.effectType ?? a.dataset.effectType;
  switch (a.dataset.action) {
    case 'create':
      return owner.createEmbeddedDocuments('ActiveEffect', [
        {
          name: game.i18n.format('DOCUMENT.New', {
            type: game.i18n.localize('DOCUMENT.ActiveEffect'),
          }),
          img: 'icons/svg/aura.svg',
          origin: owner.uuid,
          'duration.rounds': effectType === 'temporary' ? 1 : undefined,
          disabled: effectType === 'inactive',
        },
      ]);
    case 'edit':
      if (!effect) return;
      return effect.sheet.render(true);
    case 'delete':
      if (!effect) return;
      return effect.delete();
    case 'toggle':
      if (!effect) return;
      return effect.update({ disabled: !effect.disabled });
    case 'menu': {
      if (!effect) return;
      const items = [
        {
          label: 'Edit',
          icon: 'fas fa-edit',
          onClick: () => effect.sheet.render(true),
        },
        {
          label: effect.disabled
            ? game.i18n.localize('DASU.Effect.Enable')
            : game.i18n.localize('DASU.Effect.Toggle'),
          icon: effect.disabled ? 'fas fa-check' : 'fas fa-times',
          onClick: () => effect.update({ disabled: !effect.disabled }),
        },
        {
          label: 'Delete',
          icon: 'fas fa-trash',
          onClick: () => effect.delete(),
        },
      ];
      const menu = new foundry.applications.ux.ContextMenu(
        document.body,
        null,
        items,
        {
          jQuery: false,
          fixed: true,
          relative: 'target',
        }
      );
      setTimeout(() => {
        ui.context = menu;
        menu.render(a);
      }, 0);
      return;
    }
  }
}

/**
 * Prepare the data structure for Active Effects which are currently embedded in an Actor or Item.
 * @param {ActiveEffect[]} effects    A collection or generator of Active Effect documents to prepare sheet data for
 * @return {object}                   Data for rendering
 */
export function prepareActiveEffectCategories(effects) {
  // Define effect header categories
  const categories = {
    temporary: {
      type: 'temporary',
      label: game.i18n.localize('DASU.Effect.Temporary'),
      effects: [],
    },
    passive: {
      type: 'passive',
      label: game.i18n.localize('DASU.Effect.Passive'),
      effects: [],
    },
    inactive: {
      type: 'inactive',
      label: game.i18n.localize('DASU.Effect.Inactive'),
      effects: [],
    },
  };

  // Iterate over active effects, classifying them into categories
  for (let e of effects) {
    if (e.disabled) categories.inactive.effects.push(e);
    else if (e.isTemporary) categories.temporary.effects.push(e);
    else categories.passive.effects.push(e);
  }
  return categories;
}
