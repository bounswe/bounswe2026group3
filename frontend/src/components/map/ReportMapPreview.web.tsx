/// <reference lib="dom" />
// @ts-ignore
import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { StyleSheet, View } from 'react-native';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import { COLORS } from '../../constants/theme';

export interface ReportMapPreviewProps {
  latitude: number;
  longitude: number;
  zoom?: number;
  height?: number;
  testID?: string;
}

const PIN_ICON = L.divIcon({
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#EF4444;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>`,
  className: '',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

/**
 * Web counterpart of ReportMapPreview — same props, react-leaflet under
 * the hood. Fully non-interactive: pan, zoom, double-click zoom, scroll
 * wheel, keyboard, and touch zoom are all disabled.
 */
export default function ReportMapPreview({
  latitude,
  longitude,
  zoom = 16,
  height = 170,
  testID = 'report-map-preview',
}: ReportMapPreviewProps) {
  return (
    <View style={[s.wrap, { height }]} testID={testID}>
      <MapContainer
        center={[latitude, longitude]}
        zoom={zoom}
        zoomControl={false}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        boxZoom={false}
        keyboard={false}
        touchZoom={false}
        attributionControl={false}
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Marker position={[latitude, longitude]} icon={PIN_ICON} interactive={false} />
      </MapContainer>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: COLORS.gray200,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
});
