import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import WebView from 'react-native-webview';
import { COLORS } from '../../constants/theme';

export interface ReportMapPreviewProps {
  latitude: number;
  longitude: number;
  zoom?: number;
  height?: number;
  testID?: string;
}

/**
 * Small, non-interactive Leaflet preview. Renders a single marker at the
 * given coordinate inside a WebView. No search, no routing, no obstacle
 * loading — intentionally NOT a thin wrapper around MapView, which is a
 * full-screen app shell.
 */
export default function ReportMapPreview({
  latitude,
  longitude,
  zoom = 16,
  height = 170,
  testID = 'report-map-preview',
}: ReportMapPreviewProps) {
  const html = useMemo(
    () => `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { height: 100%; width: 100%; background: #e5e7eb; }
  </style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map', {
    zoomControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    touchZoom: false,
    tap: false,
    attributionControl: false
  }).setView([${latitude}, ${longitude}], ${zoom});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 20 }).addTo(map);
  var pinIcon = L.divIcon({
    html: '<div style="width:14px;height:14px;border-radius:50%;background:#EF4444;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>',
    className: '',
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
  L.marker([${latitude}, ${longitude}], { icon: pinIcon, interactive: false, keyboard: false }).addTo(map);
<\/script>
</body>
</html>`,
    [latitude, longitude, zoom],
  );

  return (
    <View style={[s.wrap, { height }]} testID={testID}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={s.webview}
        scrollEnabled={false}
        pointerEvents="none"
      />
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
  webview: { flex: 1, backgroundColor: COLORS.gray200 },
});
