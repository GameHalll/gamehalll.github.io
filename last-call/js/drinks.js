// Ingredients, recipes, glassware and the Vessel (glass/shaker) with real volume math,
// layered liquid rendering, ice displacement, foam and garnish.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { citrusTexture } from './textures.js';

export const OZ = 30; // ml

// tier: which shop tier unlocks it. spot: 'rail' (counter), 'mixer' (counter right), 'shelf' (back bar)
export const INGREDIENTS = {
  vodka:   { name: 'Vodka', brand: 'Nordvik', color: '#eaf1ff', alpha: 0.1, flow: 1, tier: 0, spot: 'rail', bottle: { shape: 'tall', glass: '#e4eef6', tint: 0.08, label: { bg: '#f3f5f7', fg: '#14254a', accent: '#b0323a', style: 0 }, cap: 'pourer' } },
  gin:     { name: 'Gin', brand: 'Hollow Pine', color: '#effff5', alpha: 0.1, flow: 1, tier: 0, spot: 'rail', bottle: { shape: 'gin', glass: '#9fd8bd', tint: 0.35, label: { bg: '#103a2b', fg: '#e9e1c9', accent: '#c9a24a', style: 1 }, cap: 'pourer' } },
  rum:     { name: 'White Rum', brand: 'Saltmarsh', color: '#fffaf0', alpha: 0.1, flow: 1, tier: 0, spot: 'rail', bottle: { shape: 'round', glass: '#f2efe6', tint: 0.08, label: { bg: '#f2e2b8', fg: '#2d2a6e', accent: '#2d6e8f', style: 2 }, cap: 'pourer' } },
  whiskey: { name: 'Whiskey', brand: 'Ember Oak', color: '#b5601a', alpha: 0.62, flow: 1, tier: 0, spot: 'rail', bottle: { shape: 'whiskey', glass: '#f1e3d0', tint: 0.08, label: { bg: '#1b1410', fg: '#e8c27a', accent: '#a5462a', style: 1 }, cap: 'pourer' } },
  cola:    { name: 'Cola', brand: 'Fizz Co.', color: '#2a1006', alpha: 0.93, flow: 1.2, tier: 0, spot: 'mixer', bubbles: true, bottle: { shape: 'soda', glass: '#6b3a1a', tint: 0.75, label: { bg: '#b3121f', fg: '#ffffff', accent: '#ffffff', style: 2 }, cap: 'cap' } },
  tonic:   { name: 'Tonic', brand: 'Quinine Bay', color: '#f3fbff', alpha: 0.12, flow: 1.2, tier: 0, spot: 'mixer', bubbles: true, bottle: { shape: 'soda', glass: '#cfe8d8', tint: 0.25, label: { bg: '#f4d03f', fg: '#1d2b44', accent: '#1d2b44', style: 0 }, cap: 'cap' } },
  soda:    { name: 'Soda Water', brand: 'Clearspring', color: '#f6fbff', alpha: 0.08, flow: 1.2, tier: 0, spot: 'mixer', bubbles: true, bottle: { shape: 'soda', glass: '#e6f2f7', tint: 0.1, label: { bg: '#2f7dbd', fg: '#ffffff', accent: '#ffffff', style: 0 }, cap: 'cap' } },
  beer:    { name: 'Lager', brand: 'Harbor Light', color: '#e2a024', alpha: 0.72, flow: 2.4, tier: 0, spot: 'fridge', foam: true, bubbles: true, bottle: { shape: 'longneck', glass: '#5a2e0e', tint: 0.8, label: { bg: '#f1e6c8', fg: '#7a1c12', accent: '#13405e', style: 1 }, cap: 'cap' } },

  draft:   { name: 'Draft Lager', color: '#e7a92a', alpha: 0.72, flow: 1, tier: 0, spot: 'tap', foam: true, bubbles: true },
  stout:   { name: 'Stout', color: '#1a0d07', alpha: 0.97, flow: 0.9, tier: 1, spot: 'tap', foam: true },

  tequila: { name: 'Tequila', brand: 'Sol Azul', color: '#fff6dc', alpha: 0.12, flow: 1, tier: 1, spot: 'rail', bottle: { shape: 'tequila', glass: '#eef3f6', tint: 0.06, label: { bg: '#0f3d63', fg: '#f3e4b5', accent: '#e07a2a', style: 1 }, cap: 'pourer' } },
  oj:      { name: 'Orange Juice', brand: 'Grove', color: '#ffa41a', alpha: 0.96, flow: 1.2, tier: 1, spot: 'mixer', bottle: { shape: 'juice', glass: '#ffffff', tint: 0.05, label: { bg: '#ff9f1c', fg: '#ffffff', accent: '#2e7d32', style: 0 }, cap: 'cap', showLiquid: true } },
  cranberry: { name: 'Cranberry', brand: 'Bogside', color: '#b0102e', alpha: 0.86, flow: 1.2, tier: 1, spot: 'mixer', bottle: { shape: 'juice', glass: '#ffffff', tint: 0.05, label: { bg: '#5c0b1d', fg: '#ffffff', accent: '#e8c27a', style: 0 }, cap: 'cap', showLiquid: true } },
  grenadine: { name: 'Grenadine', brand: 'Rubis', color: '#c3002c', alpha: 0.95, flow: 0.55, tier: 1, spot: 'mixer', dense: true, bottle: { shape: 'syrup', glass: '#ffffff', tint: 0.04, label: { bg: '#ffffff', fg: '#9c0020', accent: '#9c0020', style: 2 }, cap: 'pourer', showLiquid: true } },
  lime:    { name: 'Lime Juice', brand: 'Fresh', color: '#d5e7a0', alpha: 0.55, flow: 0.8, tier: 1, spot: 'mixer', bottle: { shape: 'squeeze', glass: '#ffffff', tint: 0.05, label: { bg: '#5aa02c', fg: '#ffffff', accent: '#ffffff', style: 0 }, cap: 'squeeze', showLiquid: true } },
  gingerbeer: { name: 'Ginger Beer', brand: 'Old Root', color: '#e5d29b', alpha: 0.55, flow: 1.2, tier: 1, spot: 'mixer', bubbles: true, bottle: { shape: 'soda', glass: '#7b4a1e', tint: 0.6, label: { bg: '#eadfc6', fg: '#3b2a12', accent: '#b5651d', style: 1 }, cap: 'cap' } },

  pineapple: { name: 'Pineapple Juice', brand: 'Tropica', color: '#f5d44a', alpha: 0.9, flow: 1.2, tier: 1, spot: 'mixer', bottle: { shape: 'juice', glass: '#ffffff', tint: 0.05, label: { bg: '#f5c400', fg: '#2e5d1a', accent: '#2e5d1a', style: 0 }, cap: 'cap', showLiquid: true } },
  grapefruit: { name: 'Grapefruit Juice', brand: 'Ruby', color: '#f29a8a', alpha: 0.85, flow: 1.2, tier: 1, spot: 'mixer', bottle: { shape: 'juice', glass: '#ffffff', tint: 0.05, label: { bg: '#e8604c', fg: '#ffffff', accent: '#ffffff', style: 0 }, cap: 'cap', showLiquid: true } },
  peach:   { name: 'Peach Schnapps', brand: 'Orchard', color: '#ffd7b0', alpha: 0.25, flow: 0.9, tier: 1, spot: 'shelf', bottle: { shape: 'round', glass: '#ffe6d0', tint: 0.2, label: { bg: '#ff9e6b', fg: '#ffffff', accent: '#7a2e12', style: 2 }, cap: 'pourer' } },
  amaretto: { name: 'Amaretto', brand: 'Mandorla', color: '#b5651d', alpha: 0.7, flow: 0.9, tier: 2, spot: 'shelf', bottle: { shape: 'whiskey', glass: '#c98a4a', tint: 0.5, label: { bg: '#2a1a10', fg: '#e8c27a', accent: '#a5462a', style: 1 }, cap: 'pourer' } },
  prosecco: { name: 'Prosecco', brand: 'Bollicine', color: '#f6edb8', alpha: 0.25, flow: 1.3, tier: 2, spot: 'mixer', bubbles: true, bottle: { shape: 'tall', glass: '#3f6b3a', tint: 0.7, label: { bg: '#f4ecd2', fg: '#3a2a10', accent: '#c9a24a', style: 1 }, cap: 'cap' } },
  coconut: { name: 'Coconut Cream', brand: 'Isla', color: '#f7f3ea', alpha: 0.97, flow: 0.7, tier: 3, spot: 'mixer', dense: true, bottle: { shape: 'juice', glass: '#ffffff', tint: 0.05, label: { bg: '#5a3a22', fg: '#ffffff', accent: '#ffffff', style: 0 }, cap: 'cap', showLiquid: true } },
  herbal:  { name: 'Herbal Liqueur', brand: 'Kräuter 56', color: '#3a2412', alpha: 0.95, flow: 0.9, tier: 3, spot: 'shelf', bottle: { shape: 'gin', glass: '#1f4a2a', tint: 0.85, label: { bg: '#f1e2b8', fg: '#2b4a2a', accent: '#c0121f', style: 1 }, cap: 'pourer' } },
  absinthe: { name: 'Absinthe', brand: 'Fée Verte', color: '#7fd65a', alpha: 0.5, flow: 0.9, tier: 4, spot: 'shelf', bottle: { shape: 'tall', glass: '#9fe08a', tint: 0.4, label: { bg: '#1b3a1a', fg: '#c9f0a0', accent: '#c9f0a0', style: 2 }, cap: 'pourer' } },
  triplesec: { name: 'Triple Sec', brand: 'Orangerie', color: '#fff4e0', alpha: 0.12, flow: 0.9, tier: 2, spot: 'shelf', bottle: { shape: 'round', glass: '#f6dcc0', tint: 0.25, label: { bg: '#e8681f', fg: '#ffffff', accent: '#ffffff', style: 2 }, cap: 'pourer' } },
  dryvermouth: { name: 'Dry Vermouth', brand: 'Bianco Alpi', color: '#f3edcc', alpha: 0.22, flow: 0.9, tier: 2, spot: 'shelf', bottle: { shape: 'tall', glass: '#cfe2c0', tint: 0.4, label: { bg: '#f6f0dc', fg: '#2b4a2a', accent: '#8a6d2a', style: 0 }, cap: 'pourer' } },
  syrup:   { name: 'Simple Syrup', brand: 'House', color: '#fffbea', alpha: 0.22, flow: 0.6, tier: 2, spot: 'mixer', dense: true, bottle: { shape: 'syrup', glass: '#ffffff', tint: 0.04, label: { bg: '#f0e9da', fg: '#333', accent: '#333', style: 0 }, cap: 'pourer', showLiquid: true } },

  sweetvermouth: { name: 'Sweet Vermouth', brand: 'Rosso Torino', color: '#6a170f', alpha: 0.88, flow: 0.9, tier: 3, spot: 'shelf', bottle: { shape: 'tall', glass: '#3b1a10', tint: 0.6, label: { bg: '#f1e8d4', fg: '#6a170f', accent: '#c9a24a', style: 1 }, cap: 'pourer' } },
  aperitivo: { name: 'Bitter Aperitivo', brand: 'Fiamma', color: '#d4142b', alpha: 0.82, flow: 0.9, tier: 3, spot: 'shelf', bottle: { shape: 'round', glass: '#ffffff', tint: 0.04, label: { bg: '#ffffff', fg: '#c0121f', accent: '#1b1b1b', style: 2 }, cap: 'pourer', showLiquid: true } },
  bitters: { name: 'Bitters', brand: 'Aromatic', color: '#5a1a0c', alpha: 0.96, flow: 0.12, tier: 3, spot: 'mixer', bottle: { shape: 'bitters', glass: '#3a1a0c', tint: 0.85, label: { bg: '#f7f2e4', fg: '#1d1d1d', accent: '#c0121f', style: 0 }, cap: 'dasher' } },

  coffee:  { name: 'Coffee Liqueur', brand: 'Café Noir', color: '#2b1406', alpha: 0.97, flow: 0.85, tier: 4, spot: 'shelf', dense: true, bottle: { shape: 'round', glass: '#2a1a10', tint: 0.85, label: { bg: '#f1e2c4', fg: '#2b1406', accent: '#b8862b', style: 1 }, cap: 'pourer' } },
  espresso: { name: 'Espresso', brand: 'Fresh pulled', color: '#1e0d04', alpha: 0.98, flow: 1.0, tier: 4, spot: 'mixer', bottle: { shape: 'carafe', glass: '#cfd3d6', tint: 0, label: null, cap: 'none' } },
  curacao: { name: 'Blue Curaçao', brand: 'Laguna', color: '#1488ff', alpha: 0.7, flow: 0.9, tier: 4, spot: 'shelf', dense: true, bottle: { shape: 'round', glass: '#ffffff', tint: 0.04, label: { bg: '#0b2d5e', fg: '#ffffff', accent: '#6fd3ff', style: 2 }, cap: 'pourer', showLiquid: true } },
  darkrum: { name: 'Dark Rum', brand: 'Black Anchor', color: '#4a1f07', alpha: 0.85, flow: 1, tier: 4, spot: 'shelf', bottle: { shape: 'whiskey', glass: '#2a1a10', tint: 0.7, label: { bg: '#121212', fg: '#e8c27a', accent: '#e8c27a', style: 1 }, cap: 'pourer' } },
  lemonade: { name: 'Lemonade', brand: 'Sunny', color: '#fbf3b8', alpha: 0.4, flow: 1.2, tier: 4, spot: 'mixer', bubbles: true, bottle: { shape: 'soda', glass: '#fbf6dc', tint: 0.2, label: { bg: '#ffe14d', fg: '#3a3a10', accent: '#3a3a10', style: 0 }, cap: 'cap' } },
};

export const GARNISHES = {
  lime: { name: 'Lime wedge', tier: 0 },
  orange: { name: 'Orange slice', tier: 1 },
  cherry: { name: 'Cherry', tier: 1 },
  olive: { name: 'Olive', tier: 2 },
  mint: { name: 'Mint sprig', tier: 2 },
};

export const RECIPES = [
  { id: 'rocks', name: 'Whiskey Rocks', tier: 0, glass: 'rocks', ice: true, method: 'build', garnish: null, parts: { whiskey: 2 }, price: 8 },
  { id: 'rumcola', name: 'Rum & Cola', tier: 0, glass: 'highball', ice: true, method: 'build', garnish: null, parts: { rum: 1.5, cola: 4 }, price: 9 },
  { id: 'vodsoda', name: 'Vodka Soda', tier: 0, glass: 'highball', ice: true, method: 'build', garnish: 'lime', parts: { vodka: 1.5, soda: 4 }, price: 9 },
  { id: 'gt', name: 'Gin & Tonic', tier: 0, glass: 'highball', ice: true, method: 'build', garnish: 'lime', parts: { gin: 1.5, tonic: 4 }, price: 10 },
  { id: 'whiskeycola', name: 'Whiskey & Cola', tier: 0, glass: 'highball', ice: true, method: 'build', garnish: null, parts: { whiskey: 1.5, cola: 4 }, price: 9 },
  { id: 'whiskeyhb', name: 'Whiskey Highball', tier: 0, glass: 'highball', ice: true, method: 'build', garnish: 'lime', parts: { whiskey: 1.5, soda: 4 }, price: 10 },
  { id: 'vodkashot', name: 'Vodka Shot', tier: 0, glass: 'shot', ice: false, method: 'build', garnish: null, parts: { vodka: 1.5 }, price: 6 },
  { id: 'whiskeyshot', name: 'Whiskey Shot', tier: 0, glass: 'shot', ice: false, method: 'build', garnish: null, parts: { whiskey: 1.5 }, price: 7 },
  { id: 'draft', name: 'Draft Lager', tier: 0, glass: 'pint', ice: false, method: 'build', garnish: null, parts: { draft: 13 }, price: 7 },
  { id: 'stout', name: 'Pint of Stout', tier: 1, glass: 'pint', ice: false, method: 'build', garnish: null, parts: { stout: 13 }, price: 8 },

  { id: 'screw', name: 'Screwdriver', tier: 1, glass: 'highball', ice: true, method: 'build', garnish: 'orange', parts: { vodka: 1.5, oj: 4 }, price: 12 },
  { id: 'cape', name: 'Cape Codder', tier: 1, glass: 'highball', ice: true, method: 'build', garnish: 'lime', parts: { vodka: 1.5, cranberry: 4 }, price: 12 },
  { id: 'sunrise', name: 'Tequila Sunrise', tier: 1, glass: 'highball', ice: true, method: 'build', garnish: 'cherry', parts: { tequila: 1.5, oj: 3.5, grenadine: 0.5 }, price: 14, note: 'Grenadine last. Don\'t stir: it sinks.' },
  { id: 'mule', name: 'Copper Mule', tier: 1, glass: 'mug', ice: true, method: 'build', garnish: 'lime', parts: { vodka: 1.5, gingerbeer: 4, lime: 0.5 }, price: 15 },

  { id: 'tequilashot', name: 'Tequila Shot', tier: 1, glass: 'shot', ice: false, method: 'build', garnish: 'lime', parts: { tequila: 1.5 }, price: 7 },
  { id: 'rumpunch', name: 'Rum Punch', tier: 1, glass: 'highball', ice: true, method: 'build', garnish: 'cherry', parts: { rum: 1.5, oj: 2, cranberry: 2, grenadine: 0.25 }, price: 14 },
  { id: 'tequilasoda', name: 'Tequila Soda', tier: 1, glass: 'highball', ice: true, method: 'build', garnish: 'lime', parts: { tequila: 1.5, soda: 4 }, price: 11 },
  { id: 'beachbreeze', name: 'Beach Breeze', tier: 1, glass: 'highball', ice: true, method: 'build', garnish: 'orange', parts: { vodka: 1.5, peach: 0.5, oj: 2, cranberry: 2 }, price: 15 },
  { id: 'baybreeze', name: 'Bay Breeze', tier: 1, glass: 'highball', ice: true, method: 'build', garnish: 'lime', parts: { vodka: 1.5, pineapple: 2, cranberry: 2 }, price: 13 },
  { id: 'greyhound', name: 'Greyhound', tier: 1, glass: 'highball', ice: true, method: 'build', garnish: null, parts: { vodka: 1.5, grapefruit: 4 }, price: 12 },
  { id: 'paloma', name: 'Paloma', tier: 1, glass: 'highball', ice: true, method: 'build', garnish: 'lime', parts: { tequila: 2, grapefruit: 3, lime: 0.5, soda: 1 }, price: 15 },
  { id: 'fuzzynavel', name: 'Fuzzy Navel', tier: 1, glass: 'highball', ice: true, method: 'build', garnish: 'orange', parts: { peach: 1.5, oj: 4 }, price: 12 },
  { id: 'madras', name: 'Madras', tier: 1, glass: 'highball', ice: true, method: 'build', garnish: 'lime', parts: { vodka: 1.5, cranberry: 3, oj: 1 }, price: 12 },
  { id: 'mimosa', name: 'Mimosa', tier: 2, glass: 'flute', ice: false, method: 'build', garnish: null, parts: { prosecco: 3, oj: 2 }, price: 13 },
  { id: 'peachfizz', name: 'Peach Fizz', tier: 2, glass: 'flute', ice: false, method: 'build', garnish: null, parts: { peach: 1, prosecco: 4 }, price: 14 },
  { id: 'french75', name: 'French 75', tier: 2, glass: 'flute', ice: false, method: 'build', garnish: null, parts: { gin: 1, lime: 0.5, syrup: 0.5, prosecco: 3 }, price: 17 },
  { id: 'amarettosour', name: 'Amaretto Sour', tier: 2, glass: 'rocks', ice: true, method: 'shake', garnish: 'cherry', parts: { amaretto: 2, lime: 1, syrup: 0.5 }, price: 16 },
  { id: 'marg', name: 'Margarita', tier: 2, glass: 'coupe', ice: false, method: 'shake', garnish: 'lime', parts: { tequila: 2, triplesec: 1, lime: 1 }, price: 17 },
  { id: 'daiq', name: 'Daiquiri', tier: 2, glass: 'coupe', ice: false, method: 'shake', garnish: 'lime', parts: { rum: 2, lime: 1, syrup: 0.75 }, price: 16 },
  { id: 'martini', name: 'Dry Martini', tier: 2, glass: 'martini', ice: false, method: 'stir', garnish: 'olive', parts: { gin: 2.5, dryvermouth: 0.5 }, price: 18 },
  { id: 'mojito', name: 'Mojito', tier: 2, glass: 'highball', ice: true, method: 'stir', garnish: 'mint', parts: { rum: 2, lime: 1, syrup: 0.75, soda: 2 }, price: 17 },

  { id: 'gimlet', name: 'Gimlet', tier: 2, glass: 'coupe', ice: false, method: 'shake', garnish: 'lime', parts: { gin: 2, lime: 0.75, syrup: 0.75 }, price: 16 },
  { id: 'collins', name: 'Tom Collins', tier: 2, glass: 'highball', ice: true, method: 'build', garnish: 'cherry', parts: { gin: 1.5, lime: 1, syrup: 0.5, soda: 3 }, price: 15 },
  { id: 'kamikaze', name: 'Kamikaze', tier: 2, glass: 'shot', ice: false, method: 'shake', garnish: null, parts: { vodka: 0.5, triplesec: 0.5, lime: 0.5 }, price: 9 },
  { id: 'oldfash', name: 'Old Fashioned', tier: 3, glass: 'rocks', ice: true, method: 'stir', garnish: 'orange', parts: { whiskey: 2, syrup: 0.25, bitters: 0.1 }, price: 22 },
  { id: 'negroni', name: 'Negroni', tier: 3, glass: 'rocks', ice: true, method: 'stir', garnish: 'orange', parts: { gin: 1, aperitivo: 1, sweetvermouth: 1 }, price: 22 },
  { id: 'manhattan', name: 'Manhattan', tier: 3, glass: 'martini', ice: false, method: 'stir', garnish: 'cherry', parts: { whiskey: 2, sweetvermouth: 1, bitters: 0.07 }, price: 23 },
  { id: 'cosmo', name: 'Cosmopolitan', tier: 3, glass: 'martini', ice: false, method: 'shake', garnish: 'lime', parts: { vodka: 1.5, triplesec: 0.5, cranberry: 1, lime: 0.5 }, price: 22 },

  { id: 'boulevardier', name: 'Boulevardier', tier: 3, glass: 'rocks', ice: true, method: 'stir', garnish: 'orange', parts: { whiskey: 1.25, aperitivo: 1, sweetvermouth: 1 }, price: 22 },
  { id: 'americano', name: 'Americano', tier: 3, glass: 'highball', ice: true, method: 'build', garnish: 'orange', parts: { aperitivo: 1.5, sweetvermouth: 1.5, soda: 2 }, price: 19 },
  { id: 'pinacolada', name: 'Piña Colada', tier: 3, glass: 'highball', ice: true, method: 'shake', garnish: 'cherry', parts: { rum: 2, pineapple: 3, coconut: 1.5 }, price: 21 },
  { id: 'spritz', name: 'Bitter Spritz', tier: 3, glass: 'highball', ice: true, method: 'build', garnish: 'orange', parts: { aperitivo: 2, prosecco: 3, soda: 1 }, price: 18 },
  { id: 'herbalshot', name: 'Herbal Shot', tier: 3, glass: 'shot', ice: false, method: 'build', garnish: null, parts: { herbal: 1.5 }, price: 9 },
  { id: 'godfather', name: 'Godfather', tier: 3, glass: 'rocks', ice: true, method: 'stir', garnish: null, parts: { whiskey: 2, amaretto: 0.75 }, price: 21 },
  { id: 'espmart', name: 'Espresso Martini', tier: 4, glass: 'martini', ice: false, method: 'shake', garnish: null, parts: { vodka: 1.5, coffee: 1, espresso: 1 }, price: 28 },
  { id: 'lagoon', name: 'Blue Lagoon', tier: 4, glass: 'highball', ice: true, method: 'build', garnish: 'cherry', parts: { vodka: 1.5, curacao: 1, lemonade: 3.5 }, price: 25 },
  { id: 'stormy', name: 'Dark Squall', tier: 4, glass: 'highball', ice: true, method: 'build', garnish: 'lime', parts: { darkrum: 2, gingerbeer: 3.5, lime: 0.5 }, price: 24 },
  { id: 'blackrussian', name: 'Black Russian', tier: 4, glass: 'rocks', ice: true, method: 'stir', garnish: null, parts: { vodka: 2, coffee: 1 }, price: 22 },
  { id: 'bluewave', name: 'Blue Wave', tier: 4, glass: 'highball', ice: true, method: 'build', garnish: 'cherry', parts: { rum: 1.5, curacao: 1, lemonade: 3 }, price: 24 },
  { id: 'stormpunch', name: 'Storm Punch', tier: 4, glass: 'highball', ice: true, method: 'build', garnish: 'orange', parts: { rum: 1, darkrum: 1, oj: 2, lime: 0.5, grenadine: 0.25 }, price: 27 },
  { id: 'greenfairy', name: 'Green Fairy', tier: 4, glass: 'highball', ice: true, method: 'build', garnish: 'mint', parts: { absinthe: 1, syrup: 0.5, lime: 0.5, soda: 3 }, price: 25 },
  { id: 'tropstorm', name: 'Tropical Storm', tier: 4, glass: 'highball', ice: true, method: 'shake', garnish: 'cherry', parts: { darkrum: 1.5, pineapple: 2, coconut: 1, oj: 1 }, price: 27 },
  { id: 'longisland', name: 'Long Island Tea', tier: 4, glass: 'highball', ice: true, method: 'stir', garnish: 'lime', parts: { vodka: 0.5, gin: 0.5, rum: 0.5, tequila: 0.5, triplesec: 0.5, lime: 0.75, cola: 1 }, price: 32 },
];

export const TIERS = [
  { tier: 0, name: 'House Well', cost: 0, blurb: 'Vodka, gin, rum, whiskey, cola, tonic, soda, draft lager and shots.' },
  { tier: 1, name: 'Juice Bar Delivery', cost: 160, blurb: 'Tequila, peach schnapps, orange, cranberry, pineapple and grapefruit juice, grenadine, lime, ginger beer, copper mugs, orange slices and cherries.' },
  { tier: 2, name: 'Cocktail Kit', cost: 480, blurb: 'Boston shaker, bar spoon, coupe, martini and champagne glasses, prosecco, amaretto, triple sec, dry vermouth, syrup, olives and mint.' },
  { tier: 3, name: 'Italian Shelf', cost: 1100, blurb: 'Sweet vermouth, bitter aperitivo, aromatic bitters, herbal liqueur and coconut cream. Stirred classics and tiki.' },
  { tier: 4, name: 'Top Shelf', cost: 2600, blurb: 'Coffee liqueur, espresso, blue curaçao, dark rum, absinthe and lemonade. The big-ticket drinks.' },
];

export const UPGRADES = [
  { id: 'tipjar', name: 'Brass tip jar', cost: 120, desc: 'Guests tip 20% more when they can see the jar.' },
  { id: 'stool3', name: 'Fourth bar stool', cost: 220, desc: 'One more guest at the bar at a time.' },
  { id: 'peanuts', name: 'Bowls of peanuts', cost: 260, desc: 'Salty snacks. Guests wait 35% longer before giving up.' },
  { id: 'steady', name: 'Steady hands', cost: 380, desc: 'Practice pours at home. Much less hand shake while pouring.' },
  { id: 'jukebox', name: 'Bigger speakers', cost: 450, desc: 'Subwoofers for the DJ. Louder bass, guests arrive faster and tip a bit more.' },
  { id: 'stool4', name: 'Fifth bar stool', cost: 600, desc: 'Another seat. Busy nights pay.' },
  { id: 'stool5', name: 'Sixth bar stool', cost: 1100, desc: 'A completely full bar.' },
  { id: 'pourers', name: 'Measured pourers', cost: 650, desc: 'Slower, steadier spouts on every bottle. Easier to hit the line.' },
  { id: 'neon', name: 'Window neon', cost: 900, desc: 'A big OPEN sign in the window. More walk-ins and better tips.' },
  { id: 'lights', name: 'String lights', cost: 320, desc: 'Warm bulbs strung over the whole terrace. Guests wait 15% longer.', decor: true },
  { id: 'sofas', name: 'Lounge sofas', cost: 600, desc: 'Velvet sofas by the windows. Guests tip 10% more.', decor: true },
  { id: 'firepit', name: 'Fire pit', cost: 950, desc: 'A crackling fire pit with benches. Guests arrive faster.', decor: true },
  { id: 'ledwall', name: 'LED bottle wall', cost: 1400, desc: 'The back bar glows and cycles colour. Guests tip 15% more.', decor: true },
];

// ------------------------------------------------------------------ glassware
// Profiles are [r, y] pairs (metres). inner = drinkable cavity, bottom to top.
export const GLASSES = {
  rocks:   { name: 'Rocks glass', cap: 300, outer: [[0, 0], [0.038, 0], [0.0405, 0.003], [0.0415, 0.02], [0.0435, 0.094], [0.0425, 0.0955]], inner: [[0.0, 0.017], [0.034, 0.017], [0.0365, 0.022], [0.0405, 0.093]] },
  highball:{ name: 'Highball', cap: 360, outer: [[0, 0], [0.031, 0], [0.0335, 0.004], [0.0335, 0.012], [0.0355, 0.158], [0.0345, 0.1595]], inner: [[0, 0.013], [0.029, 0.013], [0.0315, 0.018], [0.0335, 0.157]] },
  pint:    { name: 'Pint glass', cap: 520, outer: [[0, 0], [0.03, 0], [0.032, 0.004], [0.032, 0.01], [0.0425, 0.13], [0.0445, 0.142], [0.044, 0.158], [0.0432, 0.1595]], inner: [[0, 0.011], [0.028, 0.011], [0.0298, 0.015], [0.0405, 0.13], [0.0425, 0.142], [0.042, 0.158]] },
  martini: { name: 'Martini glass', cap: 190, outer: [[0, 0], [0.036, 0], [0.037, 0.003], [0.01, 0.006], [0.0045, 0.012], [0.004, 0.085], [0.007, 0.092], [0.059, 0.158], [0.058, 0.1595]], inner: [[0, 0.094], [0.0035, 0.0945], [0.0565, 0.157]] },
  coupe:   { name: 'Coupe', cap: 200, outer: [[0, 0], [0.034, 0], [0.035, 0.003], [0.01, 0.006], [0.0045, 0.012], [0.004, 0.085], [0.012, 0.09], [0.034, 0.096], [0.048, 0.106], [0.054, 0.118], [0.055, 0.13], [0.054, 0.1315]], inner: [[0, 0.092], [0.012, 0.093], [0.032, 0.0985], [0.046, 0.108], [0.0515, 0.119], [0.0525, 0.129]] },
  mug:     { name: 'Copper mug', cap: 450, opaque: true, outer: [[0, 0], [0.039, 0], [0.041, 0.004], [0.042, 0.05], [0.0415, 0.098], [0.043, 0.1], [0.0425, 0.102]], inner: [[0, 0.004], [0.039, 0.004], [0.04, 0.1]] },
  flute:   { name: 'Champagne flute', cap: 180, outer: [[0, 0], [0.032, 0], [0.033, 0.003], [0.01, 0.006], [0.0045, 0.012], [0.004, 0.08], [0.012, 0.09], [0.026, 0.13], [0.03, 0.2], [0.0295, 0.2015]], inner: [[0, 0.088], [0.009, 0.092], [0.024, 0.13], [0.028, 0.199]] },
  shot:    { name: 'Shot glass', cap: 70, outer: [[0, 0], [0.022, 0], [0.0232, 0.004], [0.0262, 0.068], [0.0255, 0.0695]], inner: [[0, 0.014], [0.019, 0.014], [0.0232, 0.068]] },
  shaker:  { name: 'Shaker tin', cap: 750, opaque: true, outer: [[0, 0], [0.033, 0], [0.035, 0.004], [0.046, 0.17], [0.047, 0.176], [0.0462, 0.178]], inner: [[0, 0.004], [0.033, 0.004], [0.045, 0.176]] },
};
for (const k in GLASSES) {
  const g = GLASSES[k];
  g.rimY = g.outer[g.outer.length - 1][1];
  g.rimR = g.inner[g.inner.length - 1][0];
  g.bottomY = g.inner[0][1];
}

function rAt(inner, y) {
  if (y <= inner[0][1]) return inner[1] ? inner[1][0] : 0;
  for (let i = 1; i < inner.length; i++) {
    const [r0, y0] = inner[i - 1], [r1, y1] = inner[i];
    if (y <= y1) {
      if (i === 1 && r0 === 0) return r1; // flat bottom
      const t = (y - y0) / Math.max(1e-6, y1 - y0);
      return r0 + (r1 - r0) * t;
    }
  }
  return inner[inner.length - 1][0];
}

function profileToLathe(def) {
  const pts = [];
  for (const [r, y] of def.outer) pts.push(new THREE.Vector2(r, y));
  for (let i = def.inner.length - 1; i >= 0; i--) pts.push(new THREE.Vector2(def.inner[i][0], def.inner[i][1]));
  // close with tiny epsilon at axis to avoid degenerate normal
  pts[pts.length - 1].x = 0.0001;
  pts[0].x = 0.0001;
  return pts;
}

export const MAT = {};
export function mats() {
  if (MAT.glass) return MAT;
  MAT.glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.2, clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 1, envMapIntensity: 1.6, side: THREE.FrontSide, depthWrite: false });
  MAT.copper = new THREE.MeshStandardMaterial({ color: 0xc8744a, metalness: 1, roughness: 0.28 });
  MAT.steel = new THREE.MeshStandardMaterial({ color: 0xd8dcdf, metalness: 1, roughness: 0.18 });
  MAT.ice = new THREE.MeshPhysicalMaterial({ color: 0xdff0fa, transparent: true, opacity: 0.5, roughness: 0.15, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 0.8, depthWrite: false });
  MAT.foam = new THREE.MeshStandardMaterial({ color: 0xfffbf0, roughness: 0.9 });
  return MAT;
}

export function glassGeometry(type) {
  const def = GLASSES[type];
  return new THREE.LatheGeometry(profileToLathe(def), 48);
}

const ICE_S = 0.024;
let iceGeo = null;
export function iceGeometry() {
  if (!iceGeo) iceGeo = new RoundedBoxGeometry(ICE_S, ICE_S, ICE_S, 2, 0.0045);
  return iceGeo;
}
export const ICE_VOL = ICE_S * ICE_S * ICE_S * 1e6 * 0.9; // ml (rounded corners)

function hexToColor(h) { return new THREE.Color(h); }

// ------------------------------------------------------------------ Vessel
export class Vessel {
  constructor(type) {
    mats();
    this.type = type;
    this.def = GLASSES[type];
    this.group = new THREE.Group();
    this.group.userData.vessel = this;
    const m = type === 'mug' ? MAT.copper : type === 'shaker' ? MAT.steel : MAT.glass;
    this.mesh = new THREE.Mesh(glassGeometry(type), m);
    this.mesh.renderOrder = 5;
    this.mesh.castShadow = this.def.opaque;
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);
    if (type === 'mug') this.addMugHandle();
    if (type === 'shaker') this.addShakerDetail();
    this.main = new Map(); // ingredient -> ml
    this.dense = new Map();
    this.ice = []; // {mesh, slot}
    this.slots = this.computeSlots();
    this.foam = 0; // metres
    this.stir = 0; // 0..1
    this.shake = 0;
    this.shaken = false;
    this.spilled = 0;
    this.garnish = null;
    this.garnishMesh = null;
    this.dirty = true;
    this.level = this.def.bottomY;
    this.denseLevel = this.def.bottomY;
    // volume table
    this.table = [];
    let v = 0; const dy = 0.0005;
    for (let y = this.def.bottomY; y <= this.def.rimY + 0.0001; y += dy) {
      const r = rAt(this.def.inner, y);
      this.table.push([y, v]);
      v += Math.PI * r * r * dy * 1e6;
    }
    this.capacityMl = v;
    this.liquidMeshes = [0, 1, 2].map((i) => {
      const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false, envMapIntensity: 1.2 });
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
      mesh.renderOrder = 3 + i * 0.1;
      mesh.visible = false;
      this.group.add(mesh);
      return mesh;
    });
    this.iceGroup = new THREE.Group();
    this.group.add(this.iceGroup);
    this.bubbleT = 0;
  }

  addMugHandle() {
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.0055, 12, 24, Math.PI * 1.1), MAT.copper);
    h.rotation.z = -Math.PI / 2 - 0.15; h.position.set(0.043, 0.052, 0); h.scale.set(1, 1.15, 1);
    this.group.add(h);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.0425, 0.0016, 6, 48), MAT.copper);
    band.rotation.x = Math.PI / 2; band.position.y = 0.012; this.group.add(band);
  }
  addShakerDetail() {
    // weighted bottom ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0342, 0.002, 6, 40), MAT.steel);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.012; this.group.add(ring);
    // lid tin (shown while shaking)
    const lidG = new THREE.LatheGeometry([new THREE.Vector2(0.0001, 0.11), new THREE.Vector2(0.03, 0.11), new THREE.Vector2(0.038, 0.1), new THREE.Vector2(0.044, 0)], 40);
    this.lid = new THREE.Mesh(lidG, MAT.steel);
    this.lid.rotation.x = Math.PI; this.lid.position.y = 0.27; this.lid.visible = false;
    this.group.add(this.lid);
  }

  get rimY() { return this.def.rimY; }
  get rimR() { return this.def.rimR; }

  computeSlots() {
    const out = []; const s = ICE_S;
    let y = this.def.bottomY + s * 0.55;
    const top = this.def.rimY - s * 0.3;
    let layer = 0;
    while (y < top && out.length < 14) {
      const r = rAt(this.def.inner, y - s * 0.4) - s * 0.62;
      let n = r > s * 0.95 ? 3 : r > s * 0.45 ? 2 : r > 0 ? 1 : 0;
      if (this.type === 'pint' || this.type === 'mug' || this.type === 'shaker') n = Math.min(4, n + (r > s * 1.25 ? 1 : 0));
      const rr = n === 1 ? 0 : Math.min(r, s * (n === 2 ? 0.56 : n === 3 ? 0.66 : 0.8));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + layer * 0.9;
        out.push(new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr));
      }
      y += s * 0.86; layer++;
    }
    return out;
  }

  totalMl() { let t = 0; for (const v of this.main.values()) t += v; for (const v of this.dense.values()) t += v; return t; }
  contents() { const m = new Map(this.main); for (const [k, v] of this.dense) m.set(k, (m.get(k) || 0) + v); return m; }
  iceCount() { return this.ice.length; }

  iceBelow(h) {
    let v = 0;
    for (const c of this.ice) {
      const b = c.slot.y - ICE_S / 2;
      v += Math.min(1, Math.max(0, (h - b) / ICE_S)) * ICE_VOL;
    }
    return v;
  }
  heightFor(ml) {
    if (ml <= 0) return this.def.bottomY;
    let lo = this.def.bottomY, hi = this.def.rimY + 0.03;
    for (let it = 0; it < 22; it++) {
      const mid = (lo + hi) / 2;
      const cap = this.capAt(mid) - this.iceBelow(mid);
      if (cap < ml) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
  capAt(y) {
    const t = this.table; if (y <= t[0][0]) return 0;
    const last = t[t.length - 1];
    if (y >= last[0]) return last[1] + (y - last[0]) * Math.PI * this.rimR * this.rimR * 1e6;
    const i = Math.min(t.length - 1, Math.floor((y - t[0][0]) / 0.0005));
    return t[i][1];
  }
  // room left before overflow, ml
  freeMl() { return Math.max(0, this.capAt(this.def.rimY - 0.002) - this.iceBelow(this.def.rimY - 0.002) - this.totalMl()); }

  addLiquid(id, ml) {
    const ing = INGREDIENTS[id];
    let spill = 0;
    const free = this.freeMl();
    if (ml > free) { spill = ml - free; ml = free; }
    if (ml > 0) {
      const target = ing.dense && !this.mixedOnce ? this.dense : this.main;
      target.set(id, (target.get(id) || 0) + ml);
      if (ing.foam) this.foam = Math.min(0.03, this.foam + ml * 0.00006);
      this.dirty = true;
    }
    if (spill > 0) this.spilled += spill;
    return spill;
  }
  mix() {
    for (const [k, v] of this.dense) this.main.set(k, (this.main.get(k) || 0) + v);
    this.dense.clear();
    this.mixedOnce = true;
    this.dirty = true;
  }
  empty() {
    this.main.clear(); this.dense.clear(); this.foam = 0; this.stir = 0; this.shake = 0; this.shaken = false; this.spilled = 0; this.mixedOnce = false;
    for (const c of this.ice) this.iceGroup.remove(c.mesh);
    this.ice.length = 0;
    this.setGarnish(null);
    this.dirty = true;
  }
  addIce() {
    if (this.ice.length >= this.slots.length) return false;
    const slot = this.slots[this.ice.length];
    const mesh = new THREE.Mesh(iceGeometry(), MAT.ice);
    mesh.position.copy(slot);
    mesh.rotation.set(Math.random() * 0.5, Math.random() * 6, Math.random() * 0.5);
    mesh.renderOrder = 4;
    this.iceGroup.add(mesh);
    this.ice.push({ mesh, slot });
    this.dirty = true;
    // ice displaces liquid: anything over the rim spills
    const over = this.totalMl() - (this.capAt(this.def.rimY - 0.002) - this.iceBelow(this.def.rimY - 0.002));
    if (over > 0) { this.removeMl(over); this.spilled += over; return over; }
    return 0;
  }
  removeMl(ml) {
    const total = this.totalMl(); if (total <= 0) return;
    const k = Math.max(0, 1 - ml / total);
    for (const m of [this.main, this.dense]) for (const [id, v] of m) m.set(id, v * k);
    this.dirty = true;
  }
  // pull ml out as a list of [id, ml] (for pouring out of the shaker)
  take(ml) {
    const total = this.totalMl(); if (total <= 0) return [];
    ml = Math.min(ml, total);
    const out = [];
    for (const m of [this.main, this.dense]) for (const [id, v] of m) { const t = v / total * ml; out.push([id, t]); m.set(id, v - t); }
    this.dirty = true;
    return out;
  }

  mixColor(map) {
    const c = new THREE.Color(0, 0, 0); let wsum = 0, a = 0, total = 0;
    for (const [id, ml] of map) {
      if (ml <= 0.01) continue;
      const ing = INGREDIENTS[id]; const w = ml * (0.15 + ing.alpha * ing.alpha * 3);
      const ic = hexToColor(ing.color);
      c.r += ic.r * w; c.g += ic.g * w; c.b += ic.b * w; wsum += w; a += ing.alpha * ml; total += ml;
    }
    if (wsum > 0) c.multiplyScalar(1 / wsum);
    return { color: c, alpha: total ? a / total : 0 };
  }

  latheBetween(y0, y1, inset = 0.992) {
    const pts = [new THREE.Vector2(0.0001, y0)];
    const steps = 10;
    for (let i = 0; i <= steps; i++) { const y = y0 + (y1 - y0) * (i / steps); pts.push(new THREE.Vector2(Math.max(0.0005, rAt(this.def.inner, y) * inset), y)); }
    pts.push(new THREE.Vector2(0.0001, y1));
    return new THREE.LatheGeometry(pts, 36);
  }

  rebuild() {
    this.dirty = false;
    const denseMl = [...this.dense.values()].reduce((a, b) => a + b, 0);
    const total = this.totalMl();
    const hDense = this.heightFor(denseMl);
    const hTop = Math.min(this.def.rimY - 0.0015, this.heightFor(total));
    this.level = hTop; this.denseLevel = hDense;
    const [mDense, mMain, mFoam] = this.liquidMeshes;
    const showInside = !this.def.opaque;
    const setLayer = (mesh, map, y0, y1) => {
      if (y1 - y0 < 0.0004 || !showInside) { mesh.visible = false; return; }
      mesh.geometry.dispose();
      mesh.geometry = this.latheBetween(y0, y1);
      const { color, alpha } = this.mixColor(map);
      mesh.material.color.copy(color);
      mesh.material.opacity = 0.32 + alpha * 0.62;
      mesh.material.emissive = color.clone().multiplyScalar(0.12);
      mesh.visible = true;
    };
    setLayer(mDense, this.dense, this.def.bottomY + 0.0005, hDense);
    setLayer(mMain, this.main, Math.max(this.def.bottomY + 0.0005, hDense), hTop);
    if (this.foam > 0.001 && total > 5 && showInside) {
      const f0 = hTop, f1 = Math.min(this.def.rimY + 0.004, hTop + this.foam);
      mFoam.geometry.dispose(); mFoam.geometry = this.latheBetween(f0, f1, 0.995);
      mFoam.material.color.set(0xfff8ea); mFoam.material.opacity = 0.96; mFoam.material.roughness = 0.9; mFoam.material.clearcoat = 0;
      mFoam.material.depthWrite = true; mFoam.visible = true;
    } else mFoam.visible = false;
  }

  setGarnish(type) {
    if (this.garnishMesh) { this.group.remove(this.garnishMesh); this.garnishMesh = null; }
    this.garnish = type;
    if (!type) return;
    const m = makeGarnish(type);
    const r = this.rimR, y = this.rimY;
    if (type === 'lime' || type === 'orange') { m.position.set(r * 0.95, y - 0.006, 0); m.rotation.set(0, 0, -0.35); if (type === 'orange') { m.rotation.set(0, Math.PI / 2, 0); m.position.set(r * 0.92, y - 0.012, 0); } }
    else if (type === 'cherry') { m.position.set(0.006, Math.max(this.level, this.def.bottomY + 0.01) + 0.004, 0.004); }
    else if (type === 'olive') { m.position.set(-r * 0.5, y + 0.01, 0); m.rotation.z = 0.55; }
    else if (type === 'mint') { m.position.set(-0.006, y - 0.004, 0.005); }
    this.garnishMesh = m;
    this.group.add(m);
  }

  update(dt) {
    if (this.foam > 0.003) { this.foam = Math.max(0.003, this.foam - dt * 0.0006); this.dirty = true; }
    if (this.dirty) this.rebuild();
  }
}

// ------------------------------------------------------------------ garnishes
let citrusTex = null;
export function makeGarnish(type) {
  const g = new THREE.Group();
  if (!citrusTex) citrusTex = { lime: citrusTexture('#4e8a1f', '#b9d86a'), orange: citrusTexture('#e8740e', '#ffb43a') };
  if (type === 'lime') {
    // wedge: an eighth of a sphere-ish citrus
    const rind = new THREE.MeshStandardMaterial({ color: 0x4f8f22, roughness: 0.55 });
    const flesh = new THREE.MeshPhysicalMaterial({ color: 0xc6e07a, roughness: 0.35, transmission: 0, clearcoat: 0.6, emissive: 0x2a3a10, emissiveIntensity: 0.3 });
    const wedge = new THREE.Mesh(new THREE.SphereGeometry(0.022, 20, 12, 0, Math.PI * 0.42, 0, Math.PI), rind);
    wedge.scale.set(1, 1.25, 1);
    g.add(wedge);
    const face1 = new THREE.Mesh(new THREE.CircleGeometry(0.0205, 20, Math.PI / 2, Math.PI), flesh);
    face1.scale.set(1, 1.25, 1); face1.rotation.y = -Math.PI / 2 + 0.0; g.add(face1);
    const face2 = face1.clone(); face2.rotation.y = -Math.PI / 2 + Math.PI * 0.42 + Math.PI; g.add(face2);
    face2.material = flesh;
    g.rotation.y = Math.PI * 0.8;
  } else if (type === 'orange') {
    const slice = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.005, 32), [new THREE.MeshStandardMaterial({ color: 0xe8740e, roughness: 0.5 }), new THREE.MeshPhysicalMaterial({ map: citrusTex.orange, roughness: 0.4, clearcoat: 0.5 }), new THREE.MeshPhysicalMaterial({ map: citrusTex.orange, roughness: 0.4, clearcoat: 0.5 })]);
    slice.rotation.x = Math.PI / 2;
    // cut half so it sits on the rim
    g.add(slice);
  } else if (type === 'cherry') {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.0095, 20, 14), new THREE.MeshPhysicalMaterial({ color: 0x9a0010, roughness: 0.15, clearcoat: 1, emissive: 0x2a0004 }));
    c.scale.set(1, 0.9, 1); g.add(c);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.008, 0), new THREE.Vector3(0.004, 0.03, 0), new THREE.Vector3(0.014, 0.045, 0));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.0008, 5), new THREE.MeshStandardMaterial({ color: 0x5a3a12, roughness: 0.7 })));
  } else if (type === 'olive') {
    const pick = new THREE.Mesh(new THREE.CylinderGeometry(0.0008, 0.0008, 0.09, 6), new THREE.MeshStandardMaterial({ color: 0xd8b878, roughness: 0.6 }));
    pick.position.y = -0.02; g.add(pick);
    for (let i = 0; i < 2; i++) {
      const o = new THREE.Mesh(new THREE.SphereGeometry(0.008, 16, 12), new THREE.MeshPhysicalMaterial({ color: 0x6b7d1f, roughness: 0.3, clearcoat: 0.7 }));
      o.scale.set(1, 1.3, 1); o.position.y = -0.035 - i * 0.02; g.add(o);
      const pim = new THREE.Mesh(new THREE.SphereGeometry(0.003, 8, 6), new THREE.MeshStandardMaterial({ color: 0xc0201a, roughness: 0.5 }));
      pim.position.set(0, -0.035 - i * 0.02 + 0.009, 0); g.add(pim);
    }
  } else if (type === 'mint') {
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f8a3a, roughness: 0.5, side: THREE.DoubleSide });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.001, 0.0012, 0.05, 5), new THREE.MeshStandardMaterial({ color: 0x3d6b2a }));
    stem.position.y = 0.01; g.add(stem);
    for (let i = 0; i < 7; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 6), leafMat);
      leaf.scale.set(0.65, 0.12, 1.2);
      const a = i * 2.3, y = 0.012 + i * 0.0055;
      leaf.position.set(Math.cos(a) * 0.008, y, Math.sin(a) * 0.008);
      leaf.rotation.set(0.5, -a, 0.3);
      g.add(leaf);
    }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ------------------------------------------------------------------ scoring
export function evaluate(v, recipe, tolFrac = 0.2) {
  let pen = 0; const notes = [];
  const add = (p, n) => { pen += p; if (n) notes.push(n); };
  if (v.type !== recipe.glass) add(22, `Wrong glass, I wanted a ${GLASSES[recipe.glass].name.toLowerCase()}.`);
  const c = v.contents();
  let T = 0; for (const k in recipe.parts) T += recipe.parts[k] * OZ;
  for (const k in recipe.parts) {
    const t = recipe.parts[k] * OZ, a = c.get(k) || 0;
    const tol = Math.max(t * tolFrac, tolFrac * 25);
    const w = 26 * (t / T) + 8;
    if (a < t * 0.2) add(w + 6, `Where's the ${INGREDIENTS[k].name.toLowerCase()}?`);
    else {
      const e = Math.max(0, Math.abs(a - t) - tol) / t;
      if (e > 0) add(Math.min(1, e * 1.6) * w, a > t ? `Heavy on the ${INGREDIENTS[k].name.toLowerCase()}.` : `Light on the ${INGREDIENTS[k].name.toLowerCase()}.`);
    }
  }
  for (const [k, a] of c) if (!(k in recipe.parts) && a > 4) add(12, `Why is there ${INGREDIENTS[k].name.toLowerCase()} in this?`);
  if (recipe.ice && v.iceCount() < 2) add(14, 'This needs ice.');
  if (!recipe.ice && v.iceCount() > 0) add(10, 'No ice in this one, please.');
  if (recipe.method === 'shake' && !v.shaken) add(16, 'This should be shaken.');
  if (recipe.method === 'stir' && v.stir < 1) add(9, 'Give it a stir next time.');
  if (recipe.id === 'sunrise' && v.dense.size === 0 && (c.get('grenadine') || 0) > 3) add(5, 'The sunrise is gone. You stirred it!');
  if (recipe.garnish && v.garnish !== recipe.garnish) add(8, v.garnish ? `That's the wrong garnish.` : `No ${GARNISHES[recipe.garnish].name.toLowerCase()}?`);
  if (!recipe.garnish && v.garnish) add(3, null);
  if (v.spilled > 2) add(Math.min(18, v.spilled / 2.5), 'The glass is sticky. You spilled.');
  const score = Math.round(Math.max(0, Math.min(100, 100 - pen)));
  return { score, notes };
}

// grab-and-go items from the fridge
export const ITEMS = {
  cola:   { name: 'Can of Cola', short: 'Cola', color: '#c4161c', band: '#ffffff', tier: 0, price: 4 },
  lemon:  { name: 'Lemon-Lime Soda', short: 'Lemon-Lime', color: '#2f9e44', band: '#f7e43a', tier: 0, price: 4 },
  water:  { name: 'Sparkling Water', short: 'Water', color: '#2f7dbd', band: '#dff3ff', tier: 0, price: 3 },
  beer:   { name: 'Bottled Lager', short: 'Bottled Lager', bottle: true, open: true, tier: 0, price: 6 },
  orange: { name: 'Orange Soda', short: 'Orange', color: '#f28c1a', band: '#ffffff', tier: 1, price: 4 },
  ginger: { name: 'Ginger Ale', short: 'Ginger Ale', color: '#c8a24a', band: '#2b4a2a', tier: 1, price: 5 },
  energy: { name: 'Energy Drink', short: 'Energy', color: '#1e1e1e', band: '#a6ff00', tier: 2, price: 6 },
};

// guest personalities
export const GUEST_TYPES = [
  { id: 'normal', label: '', w: 4, pat: 1, tip: 1 },
  { id: 'regular', label: 'Regular', w: 0, pat: 1.3, tip: 1.3, hello: ['Hey, me again!', 'Evening!', 'Back again.'] },
  { id: 'vip', label: 'VIP', w: 0, pat: 0.85, tip: 2, hello: ['I was told you were the best.', 'Impress me.', 'I hear good things about this place.'] },
  { id: 'rush', label: 'In a hurry', w: 1, pat: 0.6, tip: 1.4, hello: ['Quick, I have a train to catch!', 'Fast as you can, please.'] },
  { id: 'picky', label: 'Picky', w: 1, pat: 1, tip: 1, picky: true, hello: ['Made properly, please.', "I can tell a bad pour, you know."] },
  { id: 'chill', label: 'Chill', w: 1, pat: 1.6, tip: 0.9, hello: ['No rush, friend.', 'Take your time.'] },
  { id: 'big', label: 'Big tipper', w: 0.6, pat: 1, tip: 2, hello: ['Treat me right and I treat you right.', "Tonight's a celebration!"] },
];
export const CHATTER = ['What a view up here.', 'My boss is driving me crazy.', 'Is it always this busy?', 'Cheers to the weekend!', 'I could live on this rooftop.', 'Do you make a good espresso martini?', "This city never sleeps.", 'First date. Wish me luck.', 'I just got promoted!', 'Long day. Long, long day.', 'The skyline looks unreal tonight.', 'You make this look easy.'];
