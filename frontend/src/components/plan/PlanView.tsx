import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, StyleSheet, Switch,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import WebView from 'react-native-webview';

import { calculateRoute, type GuestPreferences, type RouteResult } from '../../api/routes';
import { searchLocations } from '../../api/map';
import { isLoggedIn } from '../../services/auth';
import { COLORS } from '../../constants/theme';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function formatTime(sec: number): string {
  const mins = Math.round(sec / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), rem = mins % 60;
  return rem > 0 ? `${h}h ${rem}min` : `${h}h`;
}

// ── Map HTML ──────────────────────────────────────────────────────────────────

const PLAN_MAP_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { height: 100%; width: 100%; }
  </style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map', { zoomControl: false }).setView([41.0847, 29.0503], 16);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap', maxZoom: 20
  }).addTo(map);
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  var pinMode = null;
  var originMarker = null, destMarker = null, routeLine = null, baselineLine = null;

  function makeIcon(color) {
    return L.divIcon({
      html: '<div style="width:14px;height:14px;border-radius:50%;background:' + color + ';border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>',
      className: '', iconSize: [14, 14], iconAnchor: [7, 7]
    });
  }

  map.on('click', function(e) {
    if (!pinMode) return;
    var lat = e.latlng.lat, lng = e.latlng.lng;
    if (pinMode === 'origin') {
      if (originMarker) map.removeLayer(originMarker);
      originMarker = L.marker([lat, lng], { icon: makeIcon('#27724A') }).addTo(map);
    } else {
      if (destMarker) map.removeLayer(destMarker);
      destMarker = L.marker([lat, lng], { icon: makeIcon('#EF4444') }).addTo(map);
    }
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'PIN_DROPPED', kind: pinMode, lat: lat, lng: lng
    }));
    pinMode = null;
  });

  window.setPinMode = function(mode) { pinMode = mode; };

  window.setOrigin = function(lat, lng) {
    if (originMarker) map.removeLayer(originMarker);
    originMarker = L.marker([lat, lng], { icon: makeIcon('#27724A') }).addTo(map);
  };

  window.setDest = function(lat, lng) {
    if (destMarker) map.removeLayer(destMarker);
    destMarker = L.marker([lat, lng], { icon: makeIcon('#EF4444') }).addTo(map);
  };

  window.showRoute = function(waypointsJson, baselineWaypointsJson) {
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    if (baselineLine) { map.removeLayer(baselineLine); baselineLine = null; }
    var waypoints = JSON.parse(waypointsJson);
    if (waypoints.length < 2) return;
    var baseline = baselineWaypointsJson ? JSON.parse(baselineWaypointsJson) : null;
    if (baseline && baseline.length > 1) {
      baselineLine = L.polyline(baseline, {
        color: '#F97316', weight: 5, opacity: 0.9, dashArray: '10 8'
      }).addTo(map);
    }
    routeLine = L.polyline(waypoints, { color: '#3B82F6', weight: 5, opacity: 0.9 }).addTo(map);
    var fitGroup = baselineLine
      ? L.featureGroup([baselineLine, routeLine])
      : routeLine;
    map.fitBounds(fitGroup.getBounds(), { padding: [40, 40] });
  };

  window.fitBothPoints = function() {
    if (originMarker && destMarker) {
      var group = L.featureGroup([originMarker, destMarker]);
      map.fitBounds(group.getBounds(), { padding: [60, 60] });
    }
  };

  window.clearRoute = function() {
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    if (baselineLine) { map.removeLayer(baselineLine); baselineLine = null; }
  };
</script>
</body>
</html>`;

// ── Types ─────────────────────────────────────────────────────────────────────

interface MapPoint { lat: number; lng: number; label: string; }

// ── Main component ────────────────────────────────────────────────────────────

export default function PlanView() {
  const webViewRef = useRef<WebView>(null);
  const planSource = useMemo(() => ({ html: PLAN_MAP_HTML }), []);

  const [origin, setOrigin]       = useState<MapPoint | null>(null);
  const [dest,   setDest]         = useState<MapPoint | null>(null);
  const [originQ, setOriginQ]     = useState('');
  const [destQ,   setDestQ]       = useState('');
  const [pinMode, setPinMode]     = useState<'origin' | 'dest' | null>(null);

  const [route,   setRoute]   = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const [showPrefs, setShowPrefs] = useState(false);
  const [prefs, setPrefs] = useState<GuestPreferences>({
    avoidStairs: true,
    avoidSteepSlopes: false,
    maxSlopeGradient: 8,
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const searchAndSet = useCallback(async (q: string, kind: 'origin' | 'dest') => {
    if (!q.trim()) return;
    const results = await searchLocations(q.trim());
    if (!results.length) return;
    const r = results[0];
    const point: MapPoint = { lat: r.latitude, lng: r.longitude, label: r.name };
    if (kind === 'origin') {
      setOrigin(point);
      setOriginQ(r.name);
      webViewRef.current?.injectJavaScript(`window.setOrigin(${r.latitude}, ${r.longitude}); true;`);
    } else {
      setDest(point);
      setDestQ(r.name);
      webViewRef.current?.injectJavaScript(`window.setDest(${r.latitude}, ${r.longitude}); true;`);
    }
  }, []);

  const handleMessage = useCallback(async (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'PIN_DROPPED') {
        const coordLabel = `${msg.lat.toFixed(5)}, ${msg.lng.toFixed(5)}`;
        const point: MapPoint = { lat: msg.lat, lng: msg.lng, label: coordLabel };

        if (msg.kind === 'origin') { setOrigin(point); setOriginQ(coordLabel); }
        else                        { setDest(point);   setDestQ(coordLabel);   }

        // Reverse geocode
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${msg.lat}&lon=${msg.lng}&format=json&accept-language=en`,
            { headers: { 'User-Agent': 'AccessMap/1.0' } },
          );
          if (res.ok) {
            const data = await res.json();
            const short = (data.display_name ?? coordLabel).split(',').slice(0, 3).join(',').trim();
            const named: MapPoint = { lat: msg.lat, lng: msg.lng, label: short };
            if (msg.kind === 'origin') { setOrigin(named); setOriginQ(short); }
            else                        { setDest(named);   setDestQ(short);   }
          }
        } catch {}

        // Fit map if both pins set
        webViewRef.current?.injectJavaScript(`window.fitBothPoints(); true;`);
      }
    } catch {}
  }, []);

  const activatePinMode = (kind: 'origin' | 'dest') => {
    const next = pinMode === kind ? null : kind;
    setPinMode(next);
    webViewRef.current?.injectJavaScript(`window.setPinMode(${next ? `'${next}'` : 'null'}); true;`);
  };

  const doCalculate = useCallback(async (guestPrefs?: GuestPreferences) => {
    if (!origin || !dest) return;
    setShowPrefs(false);
    setLoading(true);
    setError(null);
    setRoute(null);
    webViewRef.current?.injectJavaScript(`window.clearRoute(); true;`);
    const result = await calculateRoute({
      originLat: origin.lat, originLng: origin.lng,
      destinationLat: dest.lat, destinationLng: dest.lng,
      preferences: guestPrefs,
    });
    setLoading(false);
    if (result) {
      setRoute(result);
      if (result.waypoints.length > 1) {
        const baselineArg =
          result.alternativeRoute && result.baselineRoute
            ? JSON.stringify(JSON.stringify(result.baselineRoute.waypoints))
            : 'null';
        webViewRef.current?.injectJavaScript(
          `window.showRoute(${JSON.stringify(JSON.stringify(result.waypoints))}, ${baselineArg}); true;`
        );
      }
    } else {
      setError('Could not calculate route. Please try again.');
    }
  }, [origin, dest]);

  const handleGetRoute = useCallback(() => {
    if (!origin || !dest) { setError('Please set both origin and destination.'); return; }
    if (isLoggedIn()) doCalculate();
    else setShowPrefs(true);
  }, [origin, dest, doCalculate]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={s.container}>

      {/* Inputs card */}
      <View style={s.inputsCard}>
        <View style={s.inputRow}>
          <View style={[s.dot, s.dotOrigin]} />
          <TextInput
            style={s.input}
            placeholder="Origin — search or drop pin"
            placeholderTextColor={COLORS.gray400}
            value={originQ}
            onChangeText={setOriginQ}
            onSubmitEditing={() => searchAndSet(originQ, 'origin')}
            returnKeyType="search"
          />
          <TouchableOpacity
            style={[s.pinBtn, pinMode === 'origin' && s.pinBtnActive]}
            onPress={() => activatePinMode('origin')}
          >
            <Ionicons name="location-outline" size={18}
              color={pinMode === 'origin' ? COLORS.green700 : COLORS.gray400} />
          </TouchableOpacity>
        </View>

        <View style={s.connector}><View style={s.connectorLine} /></View>

        <View style={s.inputRow}>
          <View style={[s.dot, s.dotDest]} />
          <TextInput
            style={s.input}
            placeholder="Destination — search or drop pin"
            placeholderTextColor={COLORS.gray400}
            value={destQ}
            onChangeText={setDestQ}
            onSubmitEditing={() => searchAndSet(destQ, 'dest')}
            returnKeyType="search"
          />
          <TouchableOpacity
            style={[s.pinBtn, pinMode === 'dest' && s.pinBtnActive]}
            onPress={() => activatePinMode('dest')}
          >
            <Ionicons name="location-outline" size={18}
              color={pinMode === 'dest' ? COLORS.red500 : COLORS.gray400} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[s.routeBtn, (!origin || !dest) && s.routeBtnDisabled]}
          onPress={handleGetRoute}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <>
              <Ionicons name="navigate-outline" size={16} color={COLORS.white} />
              <Text style={s.routeBtnText}>Get Route</Text>
            </>
          )}
        </TouchableOpacity>

        {error && (
          <View style={s.errorRow}>
            <Ionicons name="alert-circle-outline" size={14} color={COLORS.red500} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}
      </View>

      {/* Pin mode banner */}
      {pinMode && (
        <View style={s.pinBanner}>
          <Ionicons name="finger-print-outline" size={14} color={COLORS.green700} />
          <Text style={s.pinBannerText}>
            Tap the map to set {pinMode === 'origin' ? 'origin' : 'destination'}
          </Text>
          <TouchableOpacity onPress={() => activatePinMode(pinMode)}>
            <Ionicons name="close-outline" size={18} color={COLORS.gray500} />
          </TouchableOpacity>
        </View>
      )}

      {/* Map */}
      <WebView
        ref={webViewRef}
        style={s.map}
        source={planSource}
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

      {/* Summary card */}
      {route && (
        <View style={s.summaryCard}>
          <View style={s.summaryRow}>
            <View style={s.summaryItem}>
              <Ionicons name="walk-outline" size={18} color={COLORS.green700} />
              <Text style={s.summaryValue}>{formatDistance(route.distanceMeters)}</Text>
              <Text style={s.summaryLabel}>Distance</Text>
            </View>
            <View style={s.summaryDivider} />
            <View style={s.summaryItem}>
              <Ionicons name="time-outline" size={18} color={COLORS.green700} />
              <Text style={s.summaryValue}>{formatTime(route.estimatedTimeSeconds)}</Text>
              <Text style={s.summaryLabel}>Est. time</Text>
            </View>
            <View style={s.summaryDivider} />
            <View style={s.summaryItem}>
              <Ionicons name="shield-checkmark-outline" size={18} color={COLORS.green700} />
              <Text style={s.summaryValue}>{route.avoidedObstaclesCount ?? 0}</Text>
              <Text style={s.summaryLabel}>Avoided</Text>
            </View>
          </View>

          {route.alternativeRoute && route.baselineRoute && (
            <View style={s.baselineCompareRow}>
              <View style={s.baselineSwatch} />
              <Text style={s.baselineCompareLabel}>Direct (no avoidance):</Text>
              <Text style={s.baselineCompareValue}>
                {formatDistance(route.baselineRoute.distanceMeters)} · {formatTime(route.baselineRoute.estimatedTimeSeconds)}
              </Text>
            </View>
          )}

          {route.warnings && route.warnings.length > 0 && (
            <View style={s.warningsBox}>
              {route.warnings.map((w, i) => (
                <View key={i} style={s.warningRow}>
                  <Ionicons name="warning-outline" size={13} color={COLORS.orange500} />
                  <Text style={s.warningText}>{w}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Guest preferences overlay */}
      {showPrefs && (
        <View style={s.overlay}>
          <View style={s.prefsCard}>
            <Text style={s.prefsTitle}>Route Preferences</Text>
            <Text style={s.prefsSubtitle}>
              Sign in to save your profile. For now, set your preferences below.
            </Text>

            <View style={s.prefRow}>
              <View style={s.prefLabel}>
                <Ionicons name="footsteps-outline" size={16} color={COLORS.gray700} />
                <Text style={s.prefLabelText}>Avoid stairs</Text>
              </View>
              <Switch
                value={prefs.avoidStairs}
                onValueChange={(v) => setPrefs((p) => ({ ...p, avoidStairs: v }))}
                trackColor={{ false: COLORS.gray200, true: COLORS.green400 }}
                thumbColor={COLORS.white}
              />
            </View>

            <View style={s.prefRow}>
              <View style={s.prefLabel}>
                <Ionicons name="trending-up-outline" size={16} color={COLORS.gray700} />
                <Text style={s.prefLabelText}>Avoid steep slopes</Text>
              </View>
              <Switch
                value={prefs.avoidSteepSlopes}
                onValueChange={(v) => setPrefs((p) => ({ ...p, avoidSteepSlopes: v }))}
                trackColor={{ false: COLORS.gray200, true: COLORS.green400 }}
                thumbColor={COLORS.white}
              />
            </View>

            <View style={s.prefRow}>
              <View style={s.prefLabel}>
                <Ionicons name="speedometer-outline" size={16} color={COLORS.gray700} />
                <Text style={s.prefLabelText}>Max slope gradient (%)</Text>
              </View>
              <TextInput
                style={s.slopeInput}
                keyboardType="numeric"
                value={String(prefs.maxSlopeGradient)}
                onChangeText={(v) => {
                  const n = parseInt(v, 10);
                  if (!isNaN(n) && n >= 1 && n <= 30) setPrefs((p) => ({ ...p, maxSlopeGradient: n }));
                }}
              />
            </View>

            <TouchableOpacity style={s.prefsCalcBtn} onPress={() => doCalculate(prefs)}>
              <Ionicons name="navigate-outline" size={16} color={COLORS.white} />
              <Text style={s.prefsCalcBtnText}>Calculate Route</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.prefsCancelBtn} onPress={() => setShowPrefs(false)}>
              <Text style={s.prefsCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },

  inputsCard: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
    gap: 4,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', height: 44, gap: 10 },
  dot: {
    width: 11, height: 11, borderRadius: 6, borderWidth: 2.5,
    borderColor: COLORS.white, flexShrink: 0,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
  },
  dotOrigin: { backgroundColor: COLORS.green700 },
  dotDest:   { backgroundColor: COLORS.red500 },
  connector: { paddingLeft: 4, height: 10, justifyContent: 'center' },
  connectorLine: { width: 1, height: 10, backgroundColor: COLORS.gray300, marginLeft: 4 },
  input: {
    flex: 1, height: 40, backgroundColor: COLORS.gray100,
    borderRadius: 9, paddingHorizontal: 12, fontSize: 14,
    color: COLORS.gray800, borderWidth: 1, borderColor: COLORS.gray200,
  },
  pinBtn: {
    width: 36, height: 36, borderRadius: 9, borderWidth: 1,
    borderColor: COLORS.gray200, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.white, flexShrink: 0,
  },
  pinBtnActive: { borderColor: COLORS.green500, backgroundColor: COLORS.green50 },
  routeBtn: {
    marginTop: 8, height: 44, borderRadius: 11, backgroundColor: COLORS.green700,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  routeBtnDisabled: { backgroundColor: COLORS.gray300 },
  routeBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  errorText: { fontSize: 12, color: COLORS.red500 },

  pinBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: COLORS.green50,
    borderBottomWidth: 1, borderBottomColor: COLORS.green200,
  },
  pinBannerText: { flex: 1, fontSize: 13, color: COLORS.green700, fontWeight: '500' },

  map: { flex: 1 },
  mapLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  summaryCard: {
    backgroundColor: COLORS.white,
    borderTopWidth: 1, borderTopColor: COLORS.gray200,
    paddingHorizontal: 16, paddingVertical: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 6,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  summaryItem: { alignItems: 'center', gap: 3, flex: 1 },
  summaryDivider: { width: 1, height: 36, backgroundColor: COLORS.gray200 },
  summaryValue: { fontSize: 16, fontWeight: '700', color: COLORS.gray800 },
  summaryLabel: { fontSize: 11, color: COLORS.gray400, fontWeight: '500' },
  warningsBox: {
    marginTop: 10, backgroundColor: COLORS.orange100,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, gap: 4,
  },
  warningRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  warningText: { flex: 1, fontSize: 12, color: COLORS.gray700, lineHeight: 17 },

  baselineCompareRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 10, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: COLORS.gray100,
  },
  baselineSwatch: {
    width: 22, height: 3,
    backgroundColor: COLORS.orange500, borderRadius: 1.5,
  },
  baselineCompareLabel: { fontSize: 12, color: COLORS.gray500, fontWeight: '500' },
  baselineCompareValue: { fontSize: 12, color: COLORS.gray800, fontWeight: '600' },

  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center', zIndex: 2000,
  },
  prefsCard: {
    width: '90%', maxWidth: 400, backgroundColor: COLORS.white,
    borderRadius: 16, padding: 24, gap: 16,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, elevation: 10,
  },
  prefsTitle: { fontSize: 18, fontWeight: '700', color: COLORS.gray800 },
  prefsSubtitle: { fontSize: 13, color: COLORS.gray500, lineHeight: 18, marginTop: -8 },
  prefRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingVertical: 4,
  },
  prefLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  prefLabelText: { fontSize: 14, color: COLORS.gray700, fontWeight: '500' },
  slopeInput: {
    width: 56, height: 36, borderRadius: 8,
    borderWidth: 1.5, borderColor: COLORS.gray300,
    textAlign: 'center', fontSize: 15, fontWeight: '600', color: COLORS.gray800,
  },
  prefsCalcBtn: {
    height: 46, borderRadius: 11, backgroundColor: COLORS.green700,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 4,
  },
  prefsCalcBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  prefsCancelBtn: { alignItems: 'center', paddingVertical: 4 },
  prefsCancelText: { fontSize: 14, color: COLORS.gray400 },
});
