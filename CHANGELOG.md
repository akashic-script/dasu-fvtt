# Changelog

# [14.3.0](https://github.com/akashic-script/dasu-fvtt/compare/v14.2.0...v14.3.0) (2026-07-19)

### Bug Fixes

- **combat:** prevent party actors from being created as combatants ([41cdbb7](https://github.com/akashic-script/dasu-fvtt/commit/41cdbb76195881754fe99a34a9414f3293508b11))
- **roster:** conditionally render channel toggle button for channelers ([1560946](https://github.com/akashic-script/dasu-fvtt/commit/156094676b4906a71fb5f708f6e6027dd9c52af0))

### Features

- add apply-effects/cost to special abilities; make slot caps advisory ([e779fbf](https://github.com/akashic-script/dasu-fvtt/commit/e779fbf32bd6d18a9b93916f6ba6ec9d91181b05))
- fix hp/wp resource clamping, fix child ([72bf708](https://github.com/akashic-script/dasu-fvtt/commit/72bf7082cfa2cf91a90086555c59d4881dd119bd))
- **party:** add daemon/ability fusion workbench ([4c8ad17](https://github.com/akashic-script/dasu-fvtt/commit/4c8ad17e875b93abd8106e0ae41d7d3a97c67fa2))
- rework tick caps and difficulty TN to fixed values; fix roll dialog difficulty reset ([679ad6a](https://github.com/akashic-script/dasu-fvtt/commit/679ad6aee3be7a8953c353b9cb518ac6c4cdfeaf))

# [14.2.0](https://github.com/spyrella/dasu/compare/v14.1.0...v14.2.0) (2026-07-08)

### Bug Fixes

- **sheet:** move initiative button before level pill in actor header ([bec84ad](https://github.com/spyrella/dasu/commit/bec84ad313eeecca4c01d2008309b01b4c344aee))
- **system:** no base, a reserved type ([7dc581e](https://github.com/spyrella/dasu/commit/7dc581e5d09aaffdba259ad6b0fac13e6db1af60))

### Features

- **party:** add DASUParty data model with members/storage sets ([a8b4332](https://github.com/spyrella/dasu/commit/a8b433212e4ea68d5f55f1b975e707e4b9cbde26))
- **party:** add party actor sheet with card/table layout toggle ([92f729d](https://github.com/spyrella/dasu/commit/92f729d4790c7ac25c55b6422b1da11436d572ef))
- **party:** add party aura mirroring to member summoners ([0902f55](https://github.com/spyrella/dasu/commit/0902f55ecd78d343df58432708424a3d7f2041a6))
- **party:** add party pseudo-folders to the actors sidebar ([d0d60ee](https://github.com/spyrella/dasu/commit/d0d60ee7ad605ec9546da1ad6b2b434e2e9e8da3))
- **party:** add table-layout renderer and shared row filter for party sheet ([5289e6d](https://github.com/spyrella/dasu/commit/5289e6d66480e8bd8bfab926a0051c8ea0d31766))
- **party:** change token desposition and actor link on recruit daemon ([b6047a6](https://github.com/spyrella/dasu/commit/b6047a60c030228ec09b1b56d3f9384a6ab5874c))
- **party:** implement hotkey for opening active party, set edit mode true on new actor creation ([d6582d4](https://github.com/spyrella/dasu/commit/d6582d432cfe8709d35f6107ee97ddba5387dad5))
- **party:** register party actor type, sheet, and settings ([c08f8ac](https://github.com/spyrella/dasu/commit/c08f8ac16103f133a3086df4894afacd649306ed))

# [14.1.0](https://github.com/spyrella/dasu/compare/v14.0.0...v14.1.0) (2026-07-06)

### Features

- combat encounter tracker with team-based fielding ([1e42fd8](https://github.com/spyrella/dasu/commit/1e42fd85d8f38cc347678cd0d06b8254be0a30ef))
- implement socket handling for inline actions and auto-apply settings ([06b9dc2](https://github.com/spyrella/dasu/commit/06b9dc2374dc50f8ff4972acb5d031eaf37e3779))
- inline enrichers, AE expression values, and roll-data expansion ([885fbbf](https://github.com/spyrella/dasu/commit/885fbbf289101df29577e1cae628e88aad0d93cb))
- single-owner daemon stock via system.summonerId ([0a34cfe](https://github.com/spyrella/dasu/commit/0a34cfecad08edc77990138aabe946fa6e748a39))
- weapon equip slotting system ([27fa73a](https://github.com/spyrella/dasu/commit/27fa73a98c9ef4d56947d52cedf1b5e34b470a5d))

# 14.0.0 (2026-07-04)

### Bug Fixes

- **actor:** rename Classes to SYN, add ACK tab, fix skill SP validation, use free fontawesome icons only ([91fdb4b](https://github.com/spyrella/dasu/commit/91fdb4bc47e4033d765262ff018bde52c35c01c4))
- add missingno to tactics ([d7d72a2](https://github.com/spyrella/dasu/commit/d7d72a256bfe3b1a61ecfbd1dfe892e60d0c924e))
- keep channel state consistent with active state ([a2496de](https://github.com/spyrella/dasu/commit/a2496de7c13d90d8ee5a9d36bc695ba0a830ac84))
- resolve effect table controls for item-sourced effects ([5867675](https://github.com/spyrella/dasu/commit/5867675442ab237ef527929c15fd3c49c9405f74))
- **sheets:** restore prototype token header controls; clean up CSS and UI ([2c73012](https://github.com/spyrella/dasu/commit/2c73012fa5f8aa1d907dfd7a78d5e10300e82851))
- **stats:** stats are now objects, fix for npc sheet ([7f7c25c](https://github.com/spyrella/dasu/commit/7f7c25cb2001ebf20d670f559e609db35fec0f14))

### Features

- **actor:** add level field to actor schema and deprecate boilerplate cr/xp ([1d2d706](https://github.com/spyrella/dasu/commit/1d2d706247a818984765c4c4423b3733a6c2c39a))
- **actor:** add merit progression and identity row to sheet header ([c188206](https://github.com/spyrella/dasu/commit/c188206a311e7d44e2a0fc16946085e40df8c761))
- **actor:** implement merit popover functionality and enhance UI elements ([8e217ef](https://github.com/spyrella/dasu/commit/8e217efbcd70ebfcd37f10aa2edf594799b78105))
- **actor:** replace abilities with POW/DEX/WIL/STA ([8abc0ea](https://github.com/spyrella/dasu/commit/8abc0eaef7c57d773523669e01e7190c61e253c8))
- **actor:** skills, derived stats, moral triad, identity tab polish ([67c04fc](https://github.com/spyrella/dasu/commit/67c04fcfe906d15d8441f8207b0970706945f6bb))
- **actor:** type rename summoner/daemon ([05a3bca](https://github.com/spyrella/dasu/commit/05a3bcad2810aaa4a5ac387b9efc95689baa879d))
- add actor aptitudes section; fix popover in popout ([1420de7](https://github.com/spyrella/dasu/commit/1420de74e1090c79fe3749040cc736a26372e762))
- add archetype and subtype item types ([9bd54ad](https://github.com/spyrella/dasu/commit/9bd54ad86b3e750872660760d9e88d837d2c7205))
- add bond item type with ranks, dialog, and chat card ([fe6a352](https://github.com/spyrella/dasu/commit/fe6a352db794c95b3bbabafb9554d06dd7d61958))
- add class advancement system with level-up planner ([37b8bb0](https://github.com/spyrella/dasu/commit/37b8bb05935f1383e93c548944338ef2cd7eb86b))
- add food of gods item category ([ebbb5ae](https://github.com/spyrella/dasu/commit/ebbb5ae8e9679e99e47f75cc0e1c798edf7b614a))
- add item type ([85e29a4](https://github.com/spyrella/dasu/commit/85e29a489fdc93bf809820c4fb141b45ddd568ae))
- add riches resource, item categories, and damage effects ([2482fb3](https://github.com/spyrella/dasu/commit/2482fb348cc7ac4d3059fb2ba609091ffbc60512))
- add skills and derived stats, fix wheel event ([921ffad](https://github.com/spyrella/dasu/commit/921ffada89f1a7a1b9f03ad01fbb59258b295f06))
- add summoner stock system with daemon management ([663111c](https://github.com/spyrella/dasu/commit/663111cc26600c633a89bca2175d3c0a1974f066))
- added aptitude to config ([2ef8d7c](https://github.com/spyrella/dasu/commit/2ef8d7c726ab6de424e542baa431c0b63845c37f))
- archetype/subtype chip placeholders ([fe7fb66](https://github.com/spyrella/dasu/commit/fe7fb66744507b732bd2f3ea9438b49787a7731e))
- daemon combat roles in the header ([9ebaf98](https://github.com/spyrella/dasu/commit/9ebaf98f11969d8e82376259475b607dd422a3ce))
- daemon special abilities and transformation forms ([51a1998](https://github.com/spyrella/dasu/commit/51a19981d139bfdca2f0ee4bae026ea8e058d109))
- dejection sheet UI, planner tab, and curse editing ([989812c](https://github.com/spyrella/dasu/commit/989812cbfa3eda53201382e8ada2139ee3c09daf))
- dejection track with relentless curse penalties ([74c9a0f](https://github.com/spyrella/dasu/commit/74c9a0f2f1cda385d0eae7162603c95766f739ab))
- deprecate spell, add classes/abilities, reorganize tabs ([95d882c](https://github.com/spyrella/dasu/commit/95d882c884b781926bcb718f1bbaceb8a8f68ebc))
- fix text legibility ([7589f2e](https://github.com/spyrella/dasu/commit/7589f2e722b243f6ff2a1d478dce428117541abd))
- govern attributes, damage resources, bond targets, and actor sheet polish ([b336ad1](https://github.com/spyrella/dasu/commit/b336ad1a4b50c68c1225f3dbf1def98d2cf0d8cb))
- **i18n:** localize ui elements ([8647558](https://github.com/spyrella/dasu/commit/86475583cb56391603f4ee2494e824f6ac880586))
- **identity:** active-legend header for moral triad + tabbed split view for notes ([3d3bdd2](https://github.com/spyrella/dasu/commit/3d3bdd2627ba569d88e197d6865d5cbde6fde1ee))
- implement ability item type and generic item/effect table system ([25d90e6](https://github.com/spyrella/dasu/commit/25d90e6e31d57cf9ac0e99c9acb729fc452f8b0e))
- implement check system with roll dialog, schema use dialog, and chat card output ([867a14d](https://github.com/spyrella/dasu/commit/867a14d9344d8cbccd4c33ed0278d1711aed5926))
- implement custom skills management, including addition, deletion, and display in actor sheet ([ef7e8b8](https://github.com/spyrella/dasu/commit/ef7e8b8679efaf74902f8dc69b9a749a4fee3e8a))
- implement damage, resource, and effect pipelines with check card wiring ([c951e22](https://github.com/spyrella/dasu/commit/c951e22905b7ce216f949f9e9af6725e8d70d830))
- implement resistances and critical threshold fields ([728ecf8](https://github.com/spyrella/dasu/commit/728ecf8162212ff18a0c450ff4714299791f52f9))
- implement schema item type ([6490957](https://github.com/spyrella/dasu/commit/64909573df43e5ea499b47de39e8f50f9963399d))
- implement skill specialties and aiding ([cb4e934](https://github.com/spyrella/dasu/commit/cb4e934ef59c5a6c089f8d8210bccb192fede763))
- implement tactics item type ([d2d5061](https://github.com/spyrella/dasu/commit/d2d5061bff1fbef7dde6ff7024e482f4cfeb481a))
- item tag system with effect transfer ([4c34fb9](https://github.com/spyrella/dasu/commit/4c34fb9896458c25d32cbd2c0014ce44664017d8))
- **item:** add weapon item type ([f2041b1](https://github.com/spyrella/dasu/commit/f2041b12ee962a4692db08d4cee0a813b7f8293b))
- level-banded attribute tick cap ([916b4ee](https://github.com/spyrella/dasu/commit/916b4eef9f4432f95d7a8bf9e01d73bcdf8bdd01))
- persistent fieldset state and module table API ([921b5cd](https://github.com/spyrella/dasu/commit/921b5cdc5a32beba03235e12dbde61de0c21dd2a))
- refactor abilities to attributes, implement attribute point validation ([83c5efc](https://github.com/spyrella/dasu/commit/83c5efcf7e5dc689ec9d01f3c083558e628554da))
- refactor actor resources to use resources for hp/wp ([e06b4a1](https://github.com/spyrella/dasu/commit/e06b4a1d45732fba3f54512f9e0df15e07f32e2d))
- setup pipeline framework for applying check effects ([3062d4e](https://github.com/spyrella/dasu/commit/3062d4e56a93c1836fec24bc547a4d49c9b7f87a))
- situational bonuses, daemon-building packs, and dsid identifiers ([a1b964b](https://github.com/spyrella/dasu/commit/a1b964b958e6077f65c704d5bfc05ad806437c79))
- status effects with stacking and effect pipeline ([26e4c3b](https://github.com/spyrella/dasu/commit/26e4c3b412241473a98f555f9e924de656d4b1f6))
- status stacking, turn tracking, and effect duration ([edcadbb](https://github.com/spyrella/dasu/commit/edcadbb00aeaaab5cfe20159e4690c695d5f1371))
- **style:** design tokens, fonts, theming, localization ([61b1f04](https://github.com/spyrella/dasu/commit/61b1f04e85b4ec07b2147b2039119ca06a5c5f23))
- **tactic:** add "none" govern option with localization ([65adc4f](https://github.com/spyrella/dasu/commit/65adc4f29706e52a8eefbc3bbc4d546042437809))
- tag apply-effects, snapshot refresh, and cross-item Apply Effects panel ([97fee2f](https://github.com/spyrella/dasu/commit/97fee2ff026c9eb384d12883ca6cc8e7d1fd6d85))
- **ui:** clean up actor sheet header, sidebar, resource bars ([b7c8dd6](https://github.com/spyrella/dasu/commit/b7c8dd65d882921e8e9ad5c39eb275665072eabe))
- **ui:** effects context menu, icon controls, API fixes ([3d7cd43](https://github.com/spyrella/dasu/commit/3d7cd43554bed9265958f1f203d66bbd9c69a9be))
- **ui:** horizontal diagonal tab navigation ([e22d7e8](https://github.com/spyrella/dasu/commit/e22d7e858f58f67e0ee6f7adc9c767c67f808c4c))
- **ui:** item sheet layout, sidebar, header, tab parity ([5af6483](https://github.com/spyrella/dasu/commit/5af6483ae36376a453989ad40d747923b05a84d3))
- **ui:** remove unused attributes tab, move actions to contextmenu ([3e704b0](https://github.com/spyrella/dasu/commit/3e704b04598c198a3b4687ff246e8226233adb8a))
- **ui:** tab content templates, features, items, spells ([d1df69d](https://github.com/spyrella/dasu/commit/d1df69def9bc535d6c676be888737c1231a4d1da))
- will strain counter and channeling ([b02c0db](https://github.com/spyrella/dasu/commit/b02c0dbf0f505dfc972fb12219912a8382fe6c88))
- wire dcThreshold on ability apply-effects to gate EffectPipeline ([6a75c86](https://github.com/spyrella/dasu/commit/6a75c8612fca876fba92eaf69d3647280e05c3f2))

# CHANGELOG
