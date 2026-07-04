import { Checks } from './checks.mjs';
import { SYSTEM, DASU } from '../helpers/config.mjs';
import { Flags } from '../helpers/flags.mjs';

/**
 * Skill Aiding: a context-menu action on a skill-check chat message that lets a
 * *different* actor aid the original roll. The aiding actor rolls 2 dice; the
 * result modifies the target's check:
 *   - 11+        -> +1
 *   - double 10  -> +2 (crit)
 *   - double 1   -> -2 (snake eyes)
 *   - otherwise  ->  0
 * The aiding actor must have at least +1 tick in the aided skill.
 */

/** Pick the actor the current user is aiding with (assigned char or token). */
function aidingActor() {
  const controlled = canvas.tokens?.controlled?.find((t) => t.actor)?.actor;
  return controlled ?? game.user.character ?? null;
}

/** Resolve a skill's tick on an actor, honoring core and custom skill keys. */
function skillTick(actor, skillKey) {
  return actor?.system?.skills?.[skillKey]?.value ?? 0;
}

/** Compute the aid modifier from two d10 faces. */
function aidOutcome(a, b) {
  if (a === 10 && b === 10) return { mod: 2, key: 'Crit' };
  if (a === 1 && b === 1) return { mod: -2, key: 'SnakeEyes' };
  if (a + b >= 11) return { mod: 1, key: 'Success' };
  return { mod: 0, key: 'Fail' };
}

async function aid(message) {
  const result = message.getFlag(SYSTEM, Flags.ChatMessage.Check);
  if (!result || result.type !== 'skill') return;

  const helper = aidingActor();
  if (!helper) {
    ui.notifications?.warn(game.i18n.localize('DASU.Check.Aid.NoActor'));
    return;
  }

  const target = await fromUuid(result.actorUuid);
  if (helper.uuid === result.actorUuid) {
    ui.notifications?.warn(game.i18n.localize('DASU.Check.Aid.SelfAid'));
    return;
  }

  const skillKey = result.skill;
  if (skillTick(helper, skillKey) < 1) {
    ui.notifications?.warn(game.i18n.localize('DASU.Check.Aid.NeedsTick'));
    return;
  }

  const roll = await new Roll(
    `${DASU.check.baseDice}d${DASU.check.faces}`
  ).evaluate();
  const faces = roll.dice[0]?.results?.map((r) => r.result) ?? [];
  const { mod, key } = aidOutcome(faces[0] ?? 0, faces[1] ?? 0);

  const skillLabel = DASU.skills[skillKey]
    ? game.i18n.localize(DASU.skills[skillKey])
    : helper.system?.skills?.[skillKey]?.label ?? skillKey;

  const modText = mod > 0 ? `+${mod}` : `${mod}`;
  const flavor = game.i18n.format('DASU.Check.Aid.Flavor', {
    helper: helper.name,
    target: target?.name ?? '?',
    skill: skillLabel,
  });
  const outcomeText =
    mod === 0
      ? game.i18n.localize('DASU.Check.Aid.NoEffect')
      : game.i18n.format('DASU.Check.Aid.Effect', { mod: modText });

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor: helper }),
    flavor: `${flavor} - ${game.i18n.localize(
      `DASU.Check.Aid.${key}`
    )}: ${outcomeText}`,
    flags: { [SYSTEM]: { aidOf: message.id, aidMod: mod } },
  });
}

const messageFromContext = (el) => {
  const node = el?.jquery ? el[0] : el;
  const messageId =
    node?.dataset?.messageId ??
    node?.closest?.('[data-message-id]')?.dataset.messageId;
  return messageId ? game.messages.get(messageId) : undefined;
};

const initialize = () => {
  Hooks.on('getChatMessageContextOptions', (html, options) => {
    options.push({
      label: game.i18n.localize('DASU.Check.Aid.Action'),
      icon: '<i class="fas fa-hands-helping"></i>',
      visible: (li) => Checks.isCheck(messageFromContext(li), 'skill'),
      onClick: (event, target) => {
        const message = messageFromContext(target);
        if (message) aid(message);
      },
    });
  });
};

export const CheckAid = Object.freeze({ initialize });
