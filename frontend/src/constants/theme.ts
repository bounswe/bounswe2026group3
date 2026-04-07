import Constants from 'expo-constants';
import { Platform } from 'react-native';

export const COLORS = {
  green900: '#1A3C2A',
  green800: '#1F5C3A',
  green700: '#27724A',
  green600: '#2D8A56',
  green500: '#34A264',
  green400: '#5CB87E',
  green300: '#8ED4A4',
  green200: '#C0EACF',
  green100: '#E6F7ED',
  green50:  '#F2FBF6',
  blue600:  '#2563EB',
  blue500:  '#3B82F6',
  blue100:  '#DBEAFE',
  blue50:   '#EFF6FF',
  red600:   '#DC2626',
  red500:   '#EF4444',
  red50:    '#FEF2F2',
  orange500:'#F97316',
  orange100:'#FFEDD5',
  gray900:  '#111827',
  gray800:  '#1F2937',
  gray700:  '#374151',
  gray600:  '#4B5563',
  gray500:  '#6B7280',
  gray400:  '#9CA3AF',
  gray300:  '#D1D5DB',
  gray200:  '#E5E7EB',
  gray100:  '#F3F4F6',
  gray50:   '#F9FAFB',
  white:    '#FFFFFF',
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
