import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Keyboard, StyleSheet, Switch,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import WebView from 'react-native-webview';

import { fetchObstacles, searchLocations, type Obstacle, type SearchResult } from '../../api/map';
import { calculateRoute, type GuestPreferences, type RouteResult } from '../../api/routes';
import { isLoggedIn } from '../../services/auth';
import { useLocation } from '../../hooks/useLocation';
import { COLORS } from '../../constants/theme';

const BOUN_CENTER = { lat: 41.0847, lng: 29.0503 };
const DEFAULT_BBOX = { north: 41.095, south: 41.074, east: 29.065, west: 29.035 };

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function formatTime(sec: number): string {
  const mins = Math.round(sec / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), rem = mins % 60;
  return rem > 0 ? `${h}h ${rem}min` : `${h}h`;
}

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

  var markers = [];
  var destMarker = null;
  var originMarker = null;
  var routeLine = null;

  function makeIcon(color) {
    return L.divIcon({
      html: '<div style="width:14px;height:14px;border-radius:50%;background:' + color + ';border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)"><\\/div>',
      className: '', iconSize: [14, 14], iconAnchor: [7, 7]
    });
  }

  function renderObstacles(obstacles, showPassive) {
    markers.forEach(function(m) { map.removeLayer(m); });
    markers = [];
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
      markers.push(marker);
    });
  }

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

  window.updateObstacles = function(json, showPassive) {
    renderObstacles(JSON.parse(json), showPassive);
  };

  window.flyTo = function(lat, lng, z) {
    map.flyTo([lat, lng], z || 18);
  };

  window.setDestPin = function(lat, lng) {
    if (destMarker) map.removeLayer(destMarker);
    destMarker = L.marker([lat, lng], { icon: makeIcon('#EF4444') }).addTo(map);
    map.flyTo([lat, lng], 17);
  };

  window.setOriginPin = function(lat, lng) {
    if (originMarker) map.removeLayer(originMarker);
    originMarker = L.marker([lat, lng], { icon: makeIcon('#27724A') }).addTo(map);
  };

  window.showRoute = function(waypointsJson) {
    if (routeLine) map.removeLayer(routeLine);
    var waypoints = JSON.parse(waypointsJson);
    if (waypoints.length < 2) return;
    routeLine = L.polyline(waypoints, { color: '#3B82F6', weight: 5, opacity: 0.85 }).addTo(map);
    map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
  };

  window.clearRoute = function() {
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    if (originMarker) { map.removeLayer(originMarker); originMarker = null; }
    if (destMarker) { map.removeLayer(destMarker); destMarker = null; }
  };

  // Signal ready
  window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'READY' }));
<\/script>
</body>
</html>`;

// ── Types ────────────────────────────────────────────────────────────────────

interface MapPoint { lat: number; lng: number; label: string; }

// ── Main component ───────────────────────────────────────────────────────────

export default function MapView() {
  const webViewRef = useRef<WebView>(null);
  const readyRef = useRef(false);

  // Map state
  const [showPassive, setShowPassive] = useState(false);
  const showPassiveRef = useRef(showPassive);
  showPassiveRef.current = showPassive;
  const currentBoundsRef = useRef<{ north: number; south: number; east: number; west: number } | null>(null);

  // Search state
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Route planning state
  const [dest, setDest] = useState<MapPoint | null>(null);
  const [origin, setOrigin] = useState<MapPoint | null>(null);
  const [originQ, setOriginQ] = useState('');
  const [showRoutePanel, setShowRoutePanel] = useState(false);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  // Guest preferences
  const [showPrefs, setShowPrefs] = useState(false);
  const [prefs, setPrefs] = useState<GuestPreferences>({
    avoidStairs: true,
    avoidSteepSlopes: false,
    maxSlopeGradient: 8,
  });

  // Location hook
  const { location: currentLocation, loading: locationLoading, refetch: refetchLocation } = useLocation();

  const source = useMemo(() => ({ html: MAP_HTML }), []);
  const prefetchedRef = useRef<Obstacle[] | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Prefetch obstacles on mount
  useEffect(() => {
    fetchObstacles(DEFAULT_BBOX, false).then((data) => {
      prefetchedRef.current = data;
      if (readyRef.current) {
        webViewRef.current?.injectJavaScript(
          `window.updateObstacles(${JSON.stringify(JSON.stringify(data))}, false); true;`
        );
      }
    });
  }, []);

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
    if (currentBoundsRef.current) {
      loadObstacles(currentBoundsRef.current, showPassive);
    }
  }, [showPassive, loadObstacles]);

  const handleMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'READY') {
        readyRef.current = true;
        if (prefetchedRef.current) {
          pushObstacles(prefetchedRef.current, showPassiveRef.current);
          prefetchedRef.current = null;
        }
      } else if (msg.type === 'BOUNDS_CHANGE') {
        const bbox = { north: msg.north, south: msg.south, east: msg.east, west: msg.west };
        currentBoundsRef.current = bbox;
        loadObstacles(bbox, showPassiveRef.current);
      }
    } catch {}
  }, [loadObstacles, pushObstacles]);

  // ── Search with autocomplete ───────────────────────────────────────────────

  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (text.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setShowSuggestions(true);
    searchTimerRef.current = setTimeout(async () => {
      setSearchLoading(true);
      const results = await searchLocations(text.trim());
      setSuggestions(results);
      setSearchLoading(false);
    }, 300);
  }, []);

  const handleSelectSuggestion = useCallback((item: SearchResult) => {
    Keyboard.dismiss();
    setQuery(item.name);
    setSuggestions([]);
    setShowSuggestions(false);

    // Set as destination
    const point: MapPoint = { lat: item.latitude, lng: item.longitude, label: item.name };
    setDest(point);
    setRoute(null);
    setRouteError(null);

    // Drop pin and fly to location
    webViewRef.current?.injectJavaScript(
      `window.clearRoute(); window.setDestPin(${item.latitude}, ${item.longitude}); true;`
    );
  }, []);

  // ── Route planning ─────────────────────────────────────────────────────────

  const handleUseCurrentLocation = useCallback(async () => {
    if (currentLocation) {
      const point: MapPoint = { lat: currentLocation.lat, lng: currentLocation.lng, label: 'Current Location' };
      setOrigin(point);
      setOriginQ('Current Location');
      webViewRef.current?.injectJavaScript(
        `window.setOriginPin(${currentLocation.lat}, ${currentLocation.lng}); true;`
      );
    } else {
      await refetchLocation();
    }
  }, [currentLocation, refetchLocation]);

  const handleOriginSearch = useCallback(async () => {
    if (!originQ.trim()) return;
    const results = await searchLocations(originQ.trim());
    if (results.length > 0) {
      const r = results[0];
      const point: MapPoint = { lat: r.latitude, lng: r.longitude, label: r.name };
      setOrigin(point);
      setOriginQ(r.name);
      webViewRef.current?.injectJavaScript(
        `window.setOriginPin(${r.latitude}, ${r.longitude}); true;`
      );
    }
  }, [originQ]);

  const doCalculate = useCallback(async (guestPrefs?: GuestPreferences) => {
    if (!origin || !dest) return;
    setShowPrefs(false);
    setRouteLoading(true);
    setRouteError(null);
    setRoute(null);
    webViewRef.current?.injectJavaScript(`window.clearRoute(); true;`);
    // Re-place markers
    webViewRef.current?.injectJavaScript(
      `window.setOriginPin(${origin.lat}, ${origin.lng}); window.setDestPin(${dest.lat}, ${dest.lng}); true;`
    );
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
    if (!origin || !dest) {
      setRouteError('Please set both origin and destination.');
      return;
    }
    if (isLoggedIn()) doCalculate();
    else setShowPrefs(true);
  }, [origin, dest, doCalculate]);

  const handleCloseRoutePanel = useCallback(() => {
    setShowRoutePanel(false);
    setOrigin(null);
    setOriginQ('');
    setRoute(null);
    setRouteError(null);
    webViewRef.current?.injectJavaScript(`window.clearRoute(); true;`);
    // Re-place destination pin
    if (dest) {
      webViewRef.current?.injectJavaScript(
        `window.setDestPin(${dest.lat}, ${dest.lng}); true;`
      );
    }
  }, [dest]);

  const handleClearAll = useCallback(() => {
    setQuery('');
    setDest(null);
    setOrigin(null);
    setOriginQ('');
    setRoute(null);
    setRouteError(null);
    setShowRoutePanel(false);
    webViewRef.current?.injectJavaScript(`window.clearRoute(); true;`);
  }, []);

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

      {/* Search overlay */}
      <View style={s.searchOverlay} pointerEvents="box-none">
        <View style={s.searchBar}>
          <Ionicons name="search-outline" size={18} color={COLORS.gray400} />
          <TextInput
            style={s.searchInput}
            placeholder="Search for a location"
            placeholderTextColor={COLORS.gray400}
            value={query}
            onChangeText={handleQueryChange}
            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
            returnKeyType="search"
          />
          {searchLoading && <ActivityIndicator size="small" color={COLORS.green600} />}
          {query.length > 0 && !searchLoading && (
            <TouchableOpacity onPress={handleClearAll}>
              <Ionicons name="close-circle" size={20} color={COLORS.gray400} />
            </TouchableOpacity>
          )}
        </View>

        {/* Autocomplete suggestions */}
        {showSuggestions && suggestions.length > 0 && (
          <View style={s.suggestionsContainer}>
            <FlatList
              data={suggestions}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity style={s.suggestionItem} onPress={() => handleSelectSuggestion(item)}>
                  <Ionicons name="location-outline" size={16} color={COLORS.gray500} />
                  <Text style={s.suggestionText} numberOfLines={1}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        )}

        {/* Passive filter chip */}
        <View style={s.chipRow} pointerEvents="box-none">
          <TouchableOpacity
            style={[s.passiveChip, showPassive && s.passiveChipActive]}
            onPress={() => setShowPassive((v) => !v)}
          >
            <View style={[s.chipDot, showPassive && s.chipDotActive]} />
            <Text style={[s.chipText, showPassive && s.chipTextActive]}>Passive</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* "Plan Route" chip — shown when destination selected but route panel not open */}
      {dest && !showRoutePanel && (
        <View style={s.planRouteChipWrap}>
          <TouchableOpacity style={s.planRouteChip} onPress={() => setShowRoutePanel(true)}>
            <Ionicons name="navigate-outline" size={16} color={COLORS.white} />
            <Text style={s.planRouteChipText}>Plan Route</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Route planning panel */}
      {showRoutePanel && (
        <View style={s.routePanel}>
          <View style={s.routePanelHeader}>
            <Text style={s.routePanelTitle}>Route</Text>
            <TouchableOpacity onPress={handleCloseRoutePanel}>
              <Ionicons name="close-outline" size={22} color={COLORS.gray500} />
            </TouchableOpacity>
          </View>

          {/* Origin field */}
          <View style={s.fieldRow}>
            <View style={[s.dot, s.dotOrigin]} />
            <TextInput
              style={s.fieldInput}
              placeholder="Origin"
              placeholderTextColor={COLORS.gray400}
              value={originQ}
              onChangeText={setOriginQ}
              onSubmitEditing={handleOriginSearch}
              returnKeyType="search"
            />
          </View>

          <TouchableOpacity style={s.currentLocBtn} onPress={handleUseCurrentLocation}>
            <Ionicons name="locate-outline" size={15} color={COLORS.green700} />
            <Text style={s.currentLocText}>
              {locationLoading ? 'Getting location...' : 'Use current location'}
            </Text>
          </TouchableOpacity>

          <View style={s.fieldDivider} />

          {/* Destination field (pre-filled) */}
          <View style={s.fieldRow}>
            <View style={[s.dot, s.dotDest]} />
            <Text style={s.fieldText} numberOfLines={1}>{dest?.label ?? ''}</Text>
          </View>

          {/* Get Route button */}
          <TouchableOpacity
            style={[s.routeBtn, (!origin || !dest) && s.routeBtnDisabled]}
            onPress={handleGetRoute}
            disabled={routeLoading}
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

          {/* Route summary */}
          {route && (
            <View style={s.summaryBox}>
              <View style={s.summaryRow}>
                <View style={s.summaryItem}>
                  <Ionicons name="walk-outline" size={16} color={COLORS.green700} />
                  <Text style={s.summaryValue}>{formatDistance(route.distanceMeters)}</Text>
                </View>
                <View style={s.summaryDivider} />
                <View style={s.summaryItem}>
                  <Ionicons name="time-outline" size={16} color={COLORS.green700} />
                  <Text style={s.summaryValue}>{formatTime(route.estimatedTimeSeconds)}</Text>
                </View>
                <View style={s.summaryDivider} />
                <View style={s.summaryItem}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={COLORS.green700} />
                  <Text style={s.summaryValue}>{route.avoidedObstaclesCount ?? 0}</Text>
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

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1 },
  mapLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Search overlay
  searchOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    paddingTop: 12, paddingHorizontal: 12,
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    height: 46, backgroundColor: COLORS.white, borderRadius: 12,
    paddingHorizontal: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 8, elevation: 4,
  },
  searchInput: { flex: 1, height: 46, fontSize: 15, color: COLORS.gray800 },

  // Suggestions
  suggestionsContainer: {
    backgroundColor: COLORS.white, borderRadius: 12, marginTop: 4,
    maxHeight: 200, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 6, elevation: 3,
  },
  suggestionItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.gray100,
  },
  suggestionText: { flex: 1, fontSize: 14, color: COLORS.gray800 },

  // Chips row
  chipRow: {
    flexDirection: 'row', marginTop: 8,
  },
  passiveChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 34,
    paddingHorizontal: 12, borderRadius: 17, borderWidth: 1.5,
    borderColor: COLORS.gray200, backgroundColor: COLORS.white,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 3, elevation: 2,
  },
  passiveChipActive: { borderColor: COLORS.green500, backgroundColor: COLORS.green50 },
  chipDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.gray300 },
  chipDotActive: { backgroundColor: COLORS.green500 },
  chipText: { fontSize: 12, fontWeight: '600', color: COLORS.gray500 },
  chipTextActive: { color: COLORS.green700 },

  // Plan Route chip
  planRouteChipWrap: {
    position: 'absolute', bottom: 24, left: 0, right: 0,
    alignItems: 'center', zIndex: 10,
  },
  planRouteChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24,
    backgroundColor: COLORS.green700,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 5,
  },
  planRouteChipText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },

  // Route panel
  routePanel: {
    position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
    backgroundColor: COLORS.white, borderTopLeftRadius: 18, borderTopRightRadius: 18,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12, shadowRadius: 10, elevation: 8,
    gap: 6,
  },
  routePanelHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 4,
  },
  routePanelTitle: { fontSize: 16, fontWeight: '700', color: COLORS.gray800 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 40 },
  dot: {
    width: 11, height: 11, borderRadius: 6, borderWidth: 2.5,
    borderColor: COLORS.white, flexShrink: 0,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
  },
  dotOrigin: { backgroundColor: COLORS.green700 },
  dotDest: { backgroundColor: COLORS.red500 },
  fieldInput: {
    flex: 1, height: 38, backgroundColor: COLORS.gray100,
    borderRadius: 9, paddingHorizontal: 12, fontSize: 14,
    color: COLORS.gray800, borderWidth: 1, borderColor: COLORS.gray200,
  },
  fieldText: {
    flex: 1, fontSize: 14, color: COLORS.gray800,
    backgroundColor: COLORS.gray100, borderRadius: 9,
    paddingHorizontal: 12, paddingVertical: 9,
    borderWidth: 1, borderColor: COLORS.gray200,
    overflow: 'hidden',
  },
  currentLocBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginLeft: 21, marginTop: 2, marginBottom: 2,
  },
  currentLocText: { fontSize: 13, color: COLORS.green700, fontWeight: '500' },
  fieldDivider: {
    height: 1, backgroundColor: COLORS.gray200, marginVertical: 2,
  },
  routeBtn: {
    marginTop: 6, height: 44, borderRadius: 11, backgroundColor: COLORS.green700,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  routeBtnDisabled: { backgroundColor: COLORS.gray300 },
  routeBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  errorText: { fontSize: 12, color: COLORS.red500 },

  // Summary
  summaryBox: { marginTop: 8 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  summaryItem: { alignItems: 'center', gap: 3, flex: 1 },
  summaryDivider: { width: 1, height: 28, backgroundColor: COLORS.gray200 },
  summaryValue: { fontSize: 14, fontWeight: '700', color: COLORS.gray800 },
  warningsBox: {
    marginTop: 8, backgroundColor: COLORS.orange100,
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
