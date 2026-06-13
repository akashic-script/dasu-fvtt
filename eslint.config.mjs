import globals from 'globals';
import js from '@eslint/js';

const recommended = js.configs.recommended;

const foundryGlobals = {
  // Core
  game: 'readonly',
  ui: 'readonly',
  CONFIG: 'readonly',
  Hooks: 'readonly',
  foundry: 'readonly',
  globalThis: 'readonly',

  // Documents
  Actor: 'readonly',
  Item: 'readonly',
  User: 'readonly',
  Combat: 'readonly',
  Combatant: 'readonly',
  ActiveEffect: 'readonly',
  ActorDelta: 'readonly',
  Card: 'readonly',
  Cards: 'readonly',
  ChatMessage: 'readonly',
  Dialog: 'readonly',
  Document: 'readonly',
  EmbeddedCollection: 'readonly',
  EmbeddedDocument: 'readonly',
  Folder: 'readonly',
  JournalEntry: 'readonly',
  JournalEntryPage: 'readonly',
  Macro: 'readonly',
  Playlist: 'readonly',
  PlaylistSound: 'readonly',
  RollTable: 'readonly',
  Scene: 'readonly',
  Setting: 'readonly',
  Table: 'readonly',
  TableResult: 'readonly',

  // Base documents
  BaseActor: 'readonly',
  BaseItem: 'readonly',
  BaseUser: 'readonly',

  // Sheets / Applications
  Application: 'readonly',
  ApplicationV2: 'readonly',
  ApplicationTab: 'readonly',
  ApplicationRenderContext: 'readonly',
  RenderOptions: 'readonly',
  FormApplication: 'readonly',
  DocumentSheet: 'readonly',
  ActorSheet: 'readonly',
  ActorSheetV2: 'readonly',
  ItemSheet: 'readonly',
  ItemSheetV2: 'readonly',
  HandlebarsApplicationMixin: 'readonly',
  ImagePopout: 'readonly',

  // Canvas & layers
  Canvas: 'readonly',
  CanvasLayer: 'readonly',
  CanvasVisibility: 'readonly',
  BackgroundLayer: 'readonly',
  ControlsLayer: 'readonly',
  EffectsLayer: 'readonly',
  GridLayer: 'readonly',
  InterfaceLayer: 'readonly',
  LightingLayer: 'readonly',
  MapLayer: 'readonly',
  ObjectHUD: 'readonly',
  PlaceableObject: 'readonly',
  PlaceablesLayer: 'readonly',
  TemplateLayer: 'readonly',
  TokenLayer: 'readonly',
  WallsLayer: 'readonly',
  WeatherLayer: 'readonly',

  // Placeables
  Drawing: 'readonly',
  FogExploration: 'readonly',
  MeasuredTemplate: 'readonly',
  Note: 'readonly',
  Tile: 'readonly',
  Token: 'readonly',
  Wall: 'readonly',

  // Light / Vision sources
  PointSource: 'readonly',
  LightSource: 'readonly',
  VisionSource: 'readonly',
  SoundSource: 'readonly',

  // Collections / World
  Actors: 'readonly',
  Items: 'readonly',
  Collection: 'readonly',
  CompendiumCollection: 'readonly',
  DocumentCollection: 'readonly',
  WorldCollection: 'readonly',

  // Managers & helpers
  AudioHelper: 'readonly',
  Clock: 'readonly',
  CombatEncounters: 'readonly',
  CombatTracker: 'readonly',
  ColorManager: 'readonly',
  FilePicker: 'readonly',
  FogManager: 'readonly',
  Game: 'readonly',
  GameTime: 'readonly',
  Handlebars: 'readonly',
  Hotbar: 'readonly',
  KeyboardManager: 'readonly',
  Localization: 'readonly',
  Macros: 'readonly',
  MouseManager: 'readonly',
  Notifications: 'readonly',
  Packages: 'readonly',
  PIXI: 'readonly',
  Roll: 'readonly',
  Settings: 'readonly',
  Socket: 'readonly',
  Sounds: 'readonly',
  SortingHelpers: 'readonly',
  Tables: 'readonly',
  Templates: 'readonly',
  TextEditor: 'readonly',
  TooltipManager: 'readonly',
  TouchManager: 'readonly',
  Tours: 'readonly',
  Users: 'readonly',
  VideoManager: 'readonly',
  WebGLManager: 'readonly',
  WorldTime: 'readonly',

  // Utilities
  Color: 'readonly',
  DuplicateError: 'readonly',
  fromUuid: 'readonly',
  getDocumentClass: 'readonly',
  renderDialog: 'readonly',
  renderTemplate: 'readonly',
};

export default [
  {
    ignores: ['data/', 'node_modules/'],
  },
  recommended,
  {
    files: ['**/*.mjs', '**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.node,
        ...foundryGlobals,
      },
    },
    rules: {
      'linebreak-style': ['error', 'unix'],
      quotes: 'off',
      semi: ['error', 'always'],
      'no-unused-vars': 'off',
      'no-console': 'off',
      'no-case-declarations': 'off',
    },
  },
];
