import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import WebView from 'react-native-webview';

import { fetchObstacles, searchLocations, type Obstacle } from '../../api/map';
import { COLORS, API_BASE } from '../../constants/theme';
import { getAccessToken } from '../../services/auth';

const BOUN_CENTER = { lat: 41.0847, lng: 29.0503 };

// ── HTML injected into WebView ───────────────────────────────────────────────

function buildMapHTML(obstacles: Obstacle[], showPassive: boolean, zoom: number): string {
  const obsJson = JSON.stringify(obstacles);
  const CATEGORY_COLOR: Record<string, string> = {
    BROKEN_RAMP: '#EF4444',
    NARROW_SIDEWALK: '#F97316',
    DAMAGED_SURFACE: '#F97316',
    ROAD_CONSTRUCTION: '#EAB308',
    BLOCKED_PATH: '#DC2626',
    OTHER: '#9CA3AF',
  };

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { height: 100%; width: 100%; }
    .popup-title { font-size: 13px; font-weight: 700; margin-bottom: 6px; font-family: system-ui, sans-serif; }
    .badge { display: inline-block; border-radius: 4px; padding: 2px 7px; font-size: 11px; font-weight: 600; color: #fff; margin-right: 4px; margin-bottom: 4px; }
    .popup-desc { font-size: 12px; color: #444; line-height: 1.4; margin-top: 4px; font-family: system-ui, sans-serif; }
  </style>
</head>
<body>
<div id="map"></div>
<script>
  var CATEGORY_COLOR = ${JSON.stringify(CATEGORY_COLOR)};
  var STATUS_COLOR = {
    UNVERIFIED: '#9CA3AF', PASSIVE: '#9CA3AF',
    VERIFIED: '#34A264', RESOLVED_AWAITING_VALIDATION: '#3B82F6', CLOSED: '#6B7280'
  };
  var STATUS_LABEL = {
    UNVERIFIED: 'Unverified', PASSIVE: 'Passive', VERIFIED: 'Verified',
    RESOLVED_AWAITING_VALIDATION: 'Awaiting Validation', CLOSED: 'Closed'
  };

  var map = L.map('map', { zoomControl: false }).setView([${BOUN_CENTER.lat}, ${BOUN_CENTER.lng}], ${zoom});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
    maxZoom: 20
  }).addTo(map);
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  var markers = [];

  function renderObstacles(obstacles, showPassive) {
    markers.forEach(function(m) { map.removeLayer(m); });
    markers = [];
    var currentZoom = map.getZoom();
    obstacles.forEach(function(obs) {
      if (obs.isIndoor && currentZoom < 18) return;
      var isPassive = obs.status === 'PASSIVE';
      var color = CATEGORY_COLOR[obs.category] || '#9CA3AF';
      var marker = L.circleMarker([obs.latitude, obs.longitude], {
        radius: 10,
        color: color,
        fillColor: color,
        fillOpacity: isPassive ? 0.4 : 0.85,
        weight: isPassive ? 1 : 2,
        opacity: isPassive ? 0.5 : 1
      });
      var statusColor = STATUS_COLOR[obs.status] || '#9CA3AF';
      var statusLabel = STATUS_LABEL[obs.status] || obs.status;
      var catLabel = obs.category.replace(/_/g, ' ');
      var popupHtml =
        '<div class="popup-title">' + obs.title + '</div>' +
        '<span class="badge" style="background:' + color + '">' + catLabel + '</span>' +
        '<span class="badge" style="background:' + statusColor + '">' + statusLabel + '</span>' +
        (obs.description ? '<div class="popup-desc">' + obs.description + '</div>' : '');
      marker.bindPopup(popupHtml, { maxWidth: 220 });
      marker.on('click', function() {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'PIN_CLICK', id: obs.id }));
      });
      marker.addTo(map);
      markers.push(marker);
    });
  }

  var obstacles = ${obsJson};
  renderObstacles(obstacles, ${showPassive});

  map.on('moveend zoomend', function() {
    var b = map.getBounds();
    var z = map.getZoom();
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'BOUNDS_CHANGE',
      north: b.getNorth(), south: b.getSouth(),
      east: b.getEast(), west: b.getWest(),
      zoom: z
    }));
  });

  window.updateObstacles = function(json, showPassive) {
    obstacles = JSON.parse(json);
    renderObstacles(obstacles, showPassive);
  };

  window.flyTo = function(lat, lng, z) {
    map.flyTo([lat, lng], z || 18);
  };
</script>
</body>
</html>`;
}

// ── Main component ───────────────────────────────────────────────────────────

export default function MapView() {
  const webViewRef = useRef<WebView>(null);

  const [obstacles, setObstacles]     = useState<Obstacle[]>([]);
  const [showPassive, setShowPassive] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [query, setQuery]             = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [zoom, setZoom]               = useState(16);

  const currentBoundsRef = useRef<{ north: number; south: number; east: number; west: number } | null>(null);
  const showPassiveRef   = useRef(showPassive);
  showPassiveRef.current = showPassive;

  const loadObstacles = useCallback(async (
    bbox: { north: number; south: number; east: number; west: number },
    passive: boolean,
  ) => {
    setLoading(true);
    const data = await fetchObstacles(bbox, passive);
    setLoading(false);
    setObstacles(data);
    // Push updated obstacles into WebView
    webViewRef.current?.injectJavaScript(
      `window.updateObstacles(${JSON.stringify(JSON.stringify(data))}, ${passive}); true;`
    );
  }, []);

  // When showPassive toggle changes, re-fetch
  useEffect(() => {
    if (currentBoundsRef.current) {
      loadObstacles(currentBoundsRef.current, showPassive);
    }
  }, [showPassive, loadObstacles]);

  const handleMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'BOUNDS_CHANGE') {
        const bbox = { north: msg.north, south: msg.south, east: msg.east, west: msg.west };
        currentBoundsRef.current = bbox;
        setZoom(msg.zoom);
        loadObstacles(bbox, showPassiveRef.current);
      }
    } catch {}
  }, [loadObstacles]);

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearchLoading(true);
    try {
      const results = await searchLocations(q);
      if (results.length > 0) {
        webViewRef.current?.injectJavaScript(
          `window.flyTo(${results[0].latitude}, ${results[0].longitude}, 18); true;`
        );
      }
    } finally {
      setSearchLoading(false);
    }
  };

  const html = buildMapHTML(obstacles, showPassive, zoom);

  return (
    <View style={s.container}>
      {/* Toolbar */}
      <View style={s.toolbar}>
        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={16} color={COLORS.gray400} />
          <TextInput
            style={s.searchInput}
            placeholder="Search campus locations…"
            placeholderTextColor={COLORS.gray400}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          {searchLoading ? (
            <ActivityIndicator size="small" color={COLORS.green600} />
          ) : query.length > 0 ? (
            <TouchableOpacity onPress={handleSearch} style={s.searchGoBtn}>
              <Ionicons name="arrow-forward-circle" size={28} color={COLORS.green700} />
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity
          style={[s.passiveChip, showPassive && s.passiveChipActive]}
          onPress={() => setShowPassive((v) => !v)}
        >
          <View style={[s.chipDot, showPassive && s.chipDotActive]} />
          <Text style={[s.chipText, showPassive && s.chipTextActive]}>Passive</Text>
        </TouchableOpacity>
      </View>

      {loading && <View style={s.loadingBar} />}

      {/* Map WebView */}
      <WebView
        ref={webViewRef}
        style={s.map}
        source={{ html }}
        onMessage={handleMessage}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={s.mapLoading}>
            <ActivityIndicator size="large" color={COLORS.green600} />
          </View>
        )}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 42,
    backgroundColor: COLORS.gray100,
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  searchInput: {
    flex: 1,
    height: 42,
    fontSize: 14,
    color: COLORS.gray800,
    paddingHorizontal: 4,
  },
  searchGoBtn: { padding: 2 },
  passiveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.gray200,
    backgroundColor: COLORS.white,
  },
  passiveChipActive: { borderColor: COLORS.green500, backgroundColor: COLORS.green50 },
  chipDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.gray300 },
  chipDotActive: { backgroundColor: COLORS.green500 },
  chipText: { fontSize: 12, fontWeight: '600', color: COLORS.gray500 },
  chipTextActive: { color: COLORS.green700 },
  loadingBar: { height: 3, backgroundColor: COLORS.green500 },
  map: { flex: 1 },
  mapLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
