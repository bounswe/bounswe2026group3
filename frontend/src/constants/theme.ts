import Constants from 'expo-constants';
import { Platform } from 'react-native';

// AccessMap "Civic Topographic" palette.
// Ink/Bone/Moss/Signal/Rule. Legacy gray/green/blue/red/orange tokens are
// remapped onto this 5-hue system so every existing screen adopts it without
// touching consumer files.

const INK         = '#0F1B14';
const INK_80      = '#1F2A23';
const INK_70      = '#404B43';
const INK_60      = '#5C665F';
const INK_50      = '#7B847E';
const INK_40      = '#9CA39B';

const BONE        = '#F5F1E8';
const BONE_2      = '#EDE7D7';

const MOSS        = '#2E5D43';
const MOSS_DK     = '#1F4230';
const MOSS_MD     = '#3F7355';
const MOSS_LT     = '#D6E5DA';
const MOSS_LT_2   = '#E8F0EA';

const SIGNAL      = '#E8623D';
const SIGNAL_DK   = '#B84621';
const SIGNAL_LT   = '#FBE2D6';

const RULE        = '#D9D2BE';

export const COLORS = {
  // ---- new "Civic Topographic" tokens (prefer these in new code) ----
  ink: INK,
  inkSoft: INK_70,
  inkMuted: INK_50,
  bone: BONE,
  bone2: BONE_2,
  moss: MOSS,
  mossDk: MOSS_DK,
  mossLt: MOSS_LT,
  signal: SIGNAL,
  signalDk: SIGNAL_DK,
  signalLt: SIGNAL_LT,
  rule: RULE,

  // ---- legacy aliases, remapped (keep existing imports working) ----
  green900: INK,         // was used as header bg + heavy text → becomes ink
  green800: MOSS_DK,
  green700: MOSS,        // primary action color
  green600: MOSS,
  green500: MOSS_MD,
  green400: MOSS_MD,
  green300: MOSS_LT,
  green200: MOSS_LT,
  green100: MOSS_LT_2,
  green50:  BONE_2,

  blue600:  INK,         // kill royal blue — CTAs and links go ink
  blue500:  INK,
  blue100:  BONE_2,
  blue50:   BONE,

  red600:   SIGNAL_DK,
  red500:   SIGNAL,
  red50:    SIGNAL_LT,

  orange500: SIGNAL,
  orange100: SIGNAL_LT,

  gray900:  INK,
  gray800:  INK_80,
  gray700:  INK_70,
  gray600:  INK_60,
  gray500:  INK_50,
  gray400:  INK_40,
  gray300:  RULE,
  gray200:  RULE,
  gray100:  BONE_2,
  gray50:   BONE,

  white:    '#FFFFFF',
};

export const FONTS = {
  display:  Platform.select({ web: '"Fraunces", Georgia, serif', default: 'System' }) as string,
  body:     Platform.select({ web: '"Inter Tight", -apple-system, system-ui, sans-serif', default: 'System' }) as string,
  mono:     Platform.select({ web: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace', default: 'Menlo' }) as string,
};

function getApiBase(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) return envUrl;

  if (Platform.OS === 'web') return 'https://bounswe2026group3-2.onrender.com';

  const host = Constants.expoConfig?.hostUri;
  if (host) {
    const ip = host.split(':')[0];
    return `http://${ip}:8000`;
  }

  return 'http://localhost:8000';
}

export const API_BASE = getApiBase();
