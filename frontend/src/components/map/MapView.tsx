import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import WebView from 'react-native-webview';
import * as Location from 'expo-location';

import { fetchObstacles, searchLocations, type Obstacle } from '../../api/map';
import { calculateRoute, type GuestPreferences, type RouteResult } from '../../api/routes';
import { isLoggedIn } from '../../services/auth';
import { COLORS } from '../../constants/theme';

const BOUN_CENTER = { lat: 41.0847, lng: 29.0503 };

// ── Static HTML — built once ─────────────────────────────────────────────────

const MAP_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
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
  var CATEGORY_COLOR = {
    BROKEN_RAMP: '#EF4444', NARROW_SIDEWALK: '#F97316', DAMAGED_SURFACE: '#F97316',
    ROAD_CONSTRUCTION: '#EAB308', BLOCKED_PATH: '#DC2626', OTHER: '#9CA3AF'
  };
  var STATUS_COLOR = {
    UNVERIFIED: '#9CA3AF', PASSIVE: '#9CA3AF',
    VERIFIED: '#34A264', RESOLVED_AWAITING_VALIDATION: '#3B82F6', CLOSED: '#6B7280'
  };
  var STATUS_LABEL = {
    UNVERIFIED: 'Unverified', PASSIVE: 'Passive', VERIFIED: 'Verified',
    RESOLVED_AWAITING_VALIDATION: 'Awaiting Validation', CLOSED: 'Closed'
  };

  var map = L.map('map', { zoomControl: false }).setView([${BOUN_CENTER.lat}, ${BOUN_CENTER.lng}], 16);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap', maxZoom: 20
  }).addTo(map);
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  // ── Obstacles ──────────────────────────────────────────────────────────────
  var obstacleMarkers = [];

  function renderObstacles(obstacles, showPassive) {
    obstacleMarkers.forEach(function(m) { map.removeLayer(m); });
    obstacleMarkers = [];
    var currentZoom = map.getZoom();
    obstacles.forEach(function(obs) {
      if (obs.isIndoor && currentZoom < 18) return;
      var isPassive = obs.status === 'PASSIVE';
      var color = CATEGORY_COLOR[obs.category] || '#9CA3AF';
      var marker = L.circleMarker([obs.latitude, obs.longitude], {
        radius: 10, color: color, fillColor: color,
        fillOpacity: isPassive ? 0.4 : 0.85,
        weight: isPassive ? 1 : 2, opacity: isPassive ? 0.5 : 1
      });
      var statusColor = STATUS_COLOR[obs.status] || '#9CA3AF';
      var statusLabel = STATUS_LABEL[obs.status] || obs.status;
      var catLabel = obs.category.replace(/_/g, ' ');
      var popupHtml =
        '<div class="popup-title">' + obs.title + '<\\/div>' +
        '<span class="badge" style="background:' + color + '">' + catLabel + '<\\/span>' +
        '<span class="badge" style="background:' + statusColor + '">' + statusLabel + '<\\/span>' +
        (obs.description ? '<div class="popup-desc">' + obs.description + '<\\/div>' : '');
      marker.bindPopup(popupHtml, { maxWidth: 220 });
      marker.on('click', function() {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'PIN_CLICK', id: obs.id }));
      });
      marker.addTo(map);
      obstacleMarkers.push(marker);
    });
  }

  // ── Route / pin-drop ───────────────────────────────────────────────────────
  var originMarker = null, destMarker = null, routeLine = null;
  var pinModeState = null;

  function makeIcon(color) {
    return L.divIcon({
      html: '<div style="width:14px;height:14px;border-radius:50%;background:' + color + ';border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>',
      className: '', iconSize: [14, 14], iconAnchor: [7, 7]
    });
  }

  map.on('click', function(e) {
    if (!pinModeState) return;
    var lat = e.latlng.lat, lng = e.latlng.lng;
    if (pinModeState === 'origin') {
      if (originMarker) map.removeLayer(originMarker);
      originMarker = L.marker([lat, lng], { icon: makeIcon('#27724A') }).addTo(map);
    } else {
      if (destMarker) map.removeLayer(destMarker);
      destMarker = L.marker([lat, lng], { icon: makeIcon('#EF4444') }).addTo(map);
    }
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'PIN_DROPPED', kind: pinModeState, lat: lat, lng: lng
    }));
    pinModeState = null;
  });

  // ── Bounds tracking ────────────────────────────────────────────────────────
  var boundsTimer = null;
  map.on('moveend zoomend', function() {
    clearTimeout(boundsTimer);
    boundsTimer = setTimeout(function() {
      var b = map.getBounds();
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'BOUNDS_CHANGE',
        north: b.getNorth(), south: b.getSouth(),
        east: b.getEast(), west: b.getWest(),
        zoom: map.getZoom()
      }));
    }, 300);
  });

  // ── Exposed API ────────────────────────────────────────────────────────────
  window.updateObstacles = function(json, showPassive) { renderObstacles(JSON.parse(json), showPassive); };
  window.flyTo = function(lat, lng, z) { map.flyTo([lat, lng], z || 18); };
  window.setPinMode = function(mode) { pinModeState = mode; };
  window.setOrigin = function(lat, lng) {
    if (originMarker) map.removeLayer(originMarker);
    originMarker = L.marker([lat, lng], { icon: makeIcon('#27724A') }).addTo(map);
  };
  window.setDest = function(lat, lng) {
    if (destMarker) map.removeLayer(destMarker);
    destMarker = L.marker([lat, lng], { icon: makeIcon('#EF4444') }).addTo(map);
  };
  window.showRoute = function(waypointsJson) {
    if (routeLine) map.removeLayer(routeLine);
    var waypoints = JSON.parse(waypointsJson);
    if (waypoints.length < 2) return;
    routeLine = L.polyline(waypoints, { color: '#3B82F6', weight: 5, opacity: 0.85 }).addTo(map);
    map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
  };
  window.fitBothPoints = function() {
    if (originMarker && destMarker) {
      var group = L.featureGroup([originMarker, destMarker]);
      map.fitBounds(group.getBounds(), { padding: [60, 60] });
    }
  };
  window.clearRoute = function() {
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
  };

  // Signal ready
  window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'READY' }));
<\/script>
</body>
</html>`;

// ── Types ────────────────────────────────────────────────────────────────────

interface MapPoint { lat: number; lng: number; label: string; }

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}
function formatTime(sec: number): string {
  const mins = Math.round(sec / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), rem = mins % 60;
  return rem > 0 ? `${h}h ${rem}min` : `${h}h`;
}

// ── Main component ───────────────────────────────────────────────────────────

export default function MapView() {
  const webViewRef = useRef<WebView>(null);
  const readyRef   = useRef(false);

  // Obstacle state
  const [showPassive, setShowPassive] = useState(false);
  const showPassiveRef = useRef(showPassive);
  showPassiveRef.current = showPassive;
  const currentBoundsRef = useRef<{ north: number; south: number; east: number; west: number } | null>(null);

  // Search / route state
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [originQ, setOriginQ] = useState('');
  const [destQ,   setDestQ]   = useState('');
  const [origin, setOrigin]   = useState<MapPoint | null>(null);
  const [dest,   setDest]     = useState<MapPoint | null>(null);
  const [pinMode, setPinModeState] = useState<'origin' | 'dest' | null>(null);
  const [route,   setRoute]   = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError,   setRouteError]   = useState<string | null>(null);
  const [showPrefs, setShowPrefs] = useState(false);
  const [prefs, setPrefs] = useState<GuestPreferences>({
    avoidStairs: true, avoidSteepSlopes: false, maxSlopeGradient: 8,
  });
  const [locLoading, setLocLoading] = useState(false);

  const source = useMemo(() => ({ html: MAP_HTML }), []);

  // ── Obstacles ──────────────────────────────────────────────────────────────

  const pushObstacles = useCallback((data: Obstacle[], passive: boolean) => {
    if (!readyRef.current) return;
    webViewRef.current?.injectJavaScript(
      `window.updateObstacles(${JSON.stringify(JSON.stringify(data))}, ${passive}); true;`
    );
  }, []);

  const loadObstacles = useCallback(async (
    bbox: { north: number; south: number; east: number; west: number },
    passive: boolean,
  ) => {
    const data = await fetchObstacles(bbox, passive);
    pushObstacles(data, passive);
  }, [pushObstacles]);

  useEffect(() => {
    if (currentBoundsRef.current) loadObstacles(currentBoundsRef.current, showPassive);
  }, [showPassive, loadObstacles]);

  // ── WebView messages ───────────────────────────────────────────────────────

  const handleMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'READY') {
        readyRef.current = true;
      } else if (msg.type === 'BOUNDS_CHANGE') {
        const bbox = { north: msg.north, south: msg.south, east: msg.east, west: msg.west };
        currentBoundsRef.current = bbox;
        loadObstacles(bbox, showPassiveRef.current);
      } else if (msg.type === 'PIN_DROPPED') {
        (async () => {
          const coordLabel = `${(msg.lat as number).toFixed(5)}, ${(msg.lng as number).toFixed(5)}`;
          const point: MapPoint = { lat: msg.lat, lng: msg.lng, label: coordLabel };
          if (msg.kind === 'origin') { setOrigin(point); setOriginQ(coordLabel); }
          else                        { setDest(point);   setDestQ(coordLabel);   }
          setPinModeState(null);
          webViewRef.current?.injectJavaScript(`window.fitBothPoints(); true;`);
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${msg.lat}&lon=${msg.lng}&format=json&accept-language=en`,
              { headers: { 'User-Agent': 'AccessMap/1.0' } },
            );
            if (res.ok) {
              const data = await res.json();
              const short = ((data.display_name ?? coordLabel) as string).split(',').slice(0, 3).join(',').trim();
              const named: MapPoint = { lat: msg.lat, lng: msg.lng, label: short };
              if (msg.kind === 'origin') { setOrigin(named); setOriginQ(short); }
              else                        { setDest(named);   setDestQ(short);   }
            }
          } catch {}
        })();
      }
    } catch {}
  }, [loadObstacles]);

  // ── Search ─────────────────────────────────────────────────────────────────

  const searchAndSet = useCallback(async (q: string, kind: 'origin' | 'dest') => {
    if (!q.trim()) return;
    const results = await searchLocations(q.trim());
    if (!results.length) return;
    const r = results[0];
    const point: MapPoint = { lat: r.latitude, lng: r.longitude, label: r.name };
    if (kind === 'origin') {
      setOrigin(point); setOriginQ(r.name);
      webViewRef.current?.injectJavaScript(`window.setOrigin(${r.latitude}, ${r.longitude}); true;`);
      webViewRef.current?.injectJavaScript(`window.flyTo(${r.latitude}, ${r.longitude}, 17); true;`);
    } else {
      setDest(point); setDestQ(r.name);
      webViewRef.current?.injectJavaScript(`window.setDest(${r.latitude}, ${r.longitude}); true;`);
      webViewRef.current?.injectJavaScript(`window.flyTo(${r.latitude}, ${r.longitude}, 17); true;`);
    }
  }, []);

  // ── GPS / current location ─────────────────────────────────────────────────

  const handleUseCurrentLocation = async () => {
    setLocLoading(true);
    setRouteError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setRouteError('Location permission denied.'); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = loc.coords;
      const label = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      setOrigin({ lat: latitude, lng: longitude, label });
      setOriginQ(label);
      webViewRef.current?.injectJavaScript(`window.setOrigin(${latitude}, ${longitude}); true;`);
      webViewRef.current?.injectJavaScript(`window.flyTo(${latitude}, ${longitude}, 17); true;`);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=en`,
          { headers: { 'User-Agent': 'AccessMap/1.0' } },
        );
        if (res.ok) {
          const data = await res.json();
          const short = ((data.display_name ?? label) as string).split(',').slice(0, 3).join(',').trim();
          setOrigin({ lat: latitude, lng: longitude, label: short });
          setOriginQ(short);
        }
      } catch {}
    } catch { setRouteError('Could not get your location.'); }
    finally { setLocLoading(false); }
  };

  // ── Pin mode ───────────────────────────────────────────────────────────────

  const activatePinMode = (kind: 'origin' | 'dest') => {
    const next = pinMode === kind ? null : kind;
    setPinModeState(next);
    webViewRef.current?.injectJavaScript(`window.setPinMode(${next ? `'${next}'` : 'null'}); true;`);
  };

  // ── Route calculation ──────────────────────────────────────────────────────

  const doCalculate = useCallback(async (guestPrefs?: GuestPreferences) => {
    if (!origin || !dest) return;
    setShowPrefs(false);
    setRouteLoading(true);
    setRouteError(null);
    setRoute(null);
    webViewRef.current?.injectJavaScript(`window.clearRoute(); true;`);
    const result = await calculateRoute({
      originLat: origin.lat, originLng: origin.lng,
      destinationLat: dest.lat, destinationLng: dest.lng,
      preferences: guestPrefs,
    });
    setRouteLoading(false);
    if (result) {
      setRoute(result);
      if (result.waypoints.length > 1) {
        webViewRef.current?.injectJavaScript(
          `window.showRoute(${JSON.stringify(JSON.stringify(result.waypoints))}); true;`
        );
      }
    } else {
      setRouteError('Could not calculate route. Please try again.');
    }
  }, [origin, dest]);

  const handleGetRoute = useCallback(() => {
    if (!origin || !dest) { setRouteError('Please set both origin and destination.'); return; }
    if (isLoggedIn()) doCalculate();
    else setShowPrefs(true);
  }, [origin, dest, doCalculate]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={s.container}>

      {/* Full-screen map */}
      <WebView
        ref={webViewRef}
        style={StyleSheet.absoluteFill}
        source={source}
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

      {/* ── Search overlay ── */}
      <View style={s.searchOverlay} pointerEvents="box-none">
        {!searchExpanded ? (

          /* Collapsed state */
          <View style={s.collapsedRow} pointerEvents="box-none">
            <TouchableOpacity
              style={s.searchBarCollapsed}
              onPress={() => setSearchExpanded(true)}
              activeOpacity={0.9}
            >
              <Ionicons name="search-outline" size={16} color={COLORS.gray400} />
              <Text style={s.searchPlaceholder}>Search for a location</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.passiveChip, showPassive && s.passiveChipActive]}
              onPress={() => setShowPassive(v => !v)}
            >
              <View style={[s.chipDot, showPassive && s.chipDotActive]} />
              <Text style={[s.chipText, showPassive && s.chipTextActive]}>Passive</Text>
            </TouchableOpacity>
          </View>

        ) : (

          /* Expanded state */
          <View style={s.expandedCard}>
            <View style={s.expandedHeader}>
              <Ionicons name="navigate-circle-outline" size={18} color={COLORS.green600} />
              <Text style={s.expandedTitle}>Plan Route</Text>
              <TouchableOpacity style={s.collapseBtn} onPress={() => setSearchExpanded(false)}>
                <Ionicons name="chevron-up-outline" size={20} color={COLORS.gray500} />
              </TouchableOpacity>
            </View>

            {/* Origin row */}
            <View style={s.inputRow}>
              <View style={[s.dot, s.dotOrigin]} />
              <TextInput
                style={s.input}
                placeholder="Origin"
                placeholderTextColor={COLORS.gray400}
                value={originQ}
                onChangeText={t => { setOriginQ(t); setRouteError(null); }}
                onSubmitEditing={() => searchAndSet(originQ, 'origin')}
                returnKeyType="search"
              />
              {locLoading ? (
                <ActivityIndicator size="small" color={COLORS.blue600} style={s.iconBtn} />
              ) : (
                <TouchableOpacity style={s.iconBtn} onPress={handleUseCurrentLocation}>
                  <Ionicons name="locate-outline" size={19} color={COLORS.blue600} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[s.pinBtn, pinMode === 'origin' && s.pinBtnActive]}
                onPress={() => activatePinMode('origin')}
              >
                <Ionicons name="location-outline" size={18} color={pinMode === 'origin' ? COLORS.green700 : COLORS.gray400} />
              </TouchableOpacity>
            </View>

            <View style={s.connector}><View style={s.connectorLine} /></View>

            {/* Destination row */}
            <View style={s.inputRow}>
              <View style={[s.dot, s.dotDest]} />
              <TextInput
                style={s.input}
                placeholder="Destination"
                placeholderTextColor={COLORS.gray400}
                value={destQ}
                onChangeText={t => { setDestQ(t); setRouteError(null); }}
                onSubmitEditing={() => searchAndSet(destQ, 'dest')}
                returnKeyType="search"
              />
              <TouchableOpacity
                style={[s.pinBtn, pinMode === 'dest' && s.pinBtnActive]}
                onPress={() => activatePinMode('dest')}
              >
                <Ionicons name="location-outline" size={18} color={pinMode === 'dest' ? COLORS.red500 : COLORS.gray400} />
              </TouchableOpacity>
            </View>

            {/* Pin mode hint */}
            {pinMode && (
              <View style={s.pinHintRow}>
                <Ionicons name="finger-print-outline" size={13} color={COLORS.green700} />
                <Text style={s.pinHintText}>Tap map to set {pinMode === 'origin' ? 'origin' : 'destination'}</Text>
                <TouchableOpacity onPress={() => activatePinMode(pinMode)}>
                  <Ionicons name="close-outline" size={16} color={COLORS.gray400} />
                </TouchableOpacity>
              </View>
            )}

            {/* Get Route */}
            <TouchableOpacity
              style={[s.routeBtn, (!origin || !dest) && s.routeBtnDisabled]}
              onPress={handleGetRoute}
              disabled={routeLoading}
              activeOpacity={0.8}
            >
              {routeLoading ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <>
                  <Ionicons name="navigate-outline" size={16} color={COLORS.white} />
                  <Text style={s.routeBtnText}>Get Route</Text>
                </>
              )}
            </TouchableOpacity>

            {routeError && (
              <View style={s.errorRow}>
                <Ionicons name="alert-circle-outline" size={14} color={COLORS.red500} />
                <Text style={s.errorText}>{routeError}</Text>
              </View>
            )}

            {/* Passive toggle */}
            <TouchableOpacity
              style={[s.passiveRow, showPassive && s.passiveRowActive]}
              onPress={() => setShowPassive(v => !v)}
              activeOpacity={0.8}
            >
              <View style={[s.chipDot, showPassive && s.chipDotActive]} />
              <Text style={[s.chipText, showPassive && s.chipTextActive]}>Show passive obstacles</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── Route summary (bottom card) ── */}
      {route && !showPrefs && (
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

      {/* ── Guest preferences overlay ── */}
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
                onValueChange={v => setPrefs(p => ({ ...p, avoidStairs: v }))}
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
                onValueChange={v => setPrefs(p => ({ ...p, avoidSteepSlopes: v }))}
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
                onChangeText={v => {
                  const n = parseInt(v, 10);
                  if (!isNaN(n) && n >= 1 && n <= 30) setPrefs(p => ({ ...p, maxSlopeGradient: n }));
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
  mapLoading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },

  // Search overlay
  searchOverlay: {
    position: 'absolute', top: 12, left: 12, right: 12, zIndex: 10,
  },
  collapsedRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  searchBarCollapsed: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    height: 44, backgroundColor: COLORS.white, borderRadius: 12,
    paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.gray200,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 6, elevation: 4,
  },
  searchPlaceholder: { flex: 1, fontSize: 14, color: COLORS.gray400 },

  // Expanded card
  expandedCard: {
    backgroundColor: COLORS.white, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: COLORS.gray200,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 8, elevation: 6,
    gap: 4,
  },
  expandedHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  expandedTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: COLORS.gray800 },
  collapseBtn: { padding: 2 },

  // Input rows
  inputRow: { flexDirection: 'row', alignItems: 'center', height: 44, gap: 8 },
  dot: {
    width: 11, height: 11, borderRadius: 6, borderWidth: 2.5, borderColor: COLORS.white,
    flexShrink: 0, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
  },
  dotOrigin: { backgroundColor: COLORS.green700 },
  dotDest:   { backgroundColor: COLORS.red500 },
  connector: { paddingLeft: 4, height: 8, justifyContent: 'center' },
  connectorLine: { width: 1, height: 8, backgroundColor: COLORS.gray300, marginLeft: 4 },
  input: {
    flex: 1, height: 40, backgroundColor: COLORS.gray100,
    borderRadius: 9, paddingHorizontal: 12, fontSize: 14,
    color: COLORS.gray800, borderWidth: 1, borderColor: COLORS.gray200,
  },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  pinBtn: {
    width: 36, height: 36, borderRadius: 9, borderWidth: 1,
    borderColor: COLORS.gray200, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.white, flexShrink: 0,
  },
  pinBtnActive: { borderColor: COLORS.green500, backgroundColor: COLORS.green50 },

  // Pin hint
  pinHintRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.green50, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  pinHintText: { flex: 1, fontSize: 12, color: COLORS.green700, fontWeight: '500' },

  // Route button
  routeBtn: {
    marginTop: 4, height: 44, borderRadius: 11, backgroundColor: COLORS.green700,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  routeBtnDisabled: { backgroundColor: COLORS.gray300 },
  routeBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  errorText: { fontSize: 12, color: COLORS.red500, flex: 1 },

  // Passive toggle (in expanded card)
  passiveRow: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingVertical: 7, paddingHorizontal: 4,
  },
  passiveRowActive: {},

  // Passive chip (collapsed)
  passiveChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 44,
    paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5,
    borderColor: COLORS.gray200, backgroundColor: COLORS.white,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 6, elevation: 4,
  },
  passiveChipActive: { borderColor: COLORS.green500, backgroundColor: COLORS.green50 },
  chipDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.gray300 },
  chipDotActive: { backgroundColor: COLORS.green500 },
  chipText: { fontSize: 12, fontWeight: '600', color: COLORS.gray500 },
  chipTextActive: { color: COLORS.green700 },

  // Route summary card
  summaryCard: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: COLORS.gray200,
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

  // Guest prefs overlay
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
