import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Keyboard, ScrollView, StyleSheet, Switch,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import WebView from 'react-native-webview';

import { fetchObstacles, searchLocations, type Obstacle, type SearchResult } from '../../api/map';
import { calculateRoute, type GuestPreferences, type RouteResult } from '../../api/routes';
import { getSavedPlaces, createSavedPlace, type SavedPlace } from '../../api/savedPlaces';
import { isLoggedIn } from '../../services/auth';
import SavePlaceModal from './SavePlaceModal';
import { useLocation } from '../../hooks/useLocation';
import { COLORS } from '../../constants/theme';
import { HIGH_DETAIL_ZOOM } from '../../constants/mapConstants';
import { useRouter } from 'expo-router';

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

// ── Constants ────────────────────────────────────────────────────────────────

const BOUN_CENTER = { lat: 41.0847, lng: 29.0503 };
const DEFAULT_BBOX = { north: 41.095, south: 41.074, east: 29.065, west: 29.035 };

interface MapPoint { lat: number; lng: number; label: string; }

// ── Static HTML — built once, never changes ─────────────────────────────────

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

  function renderObstacles(obstacles, showPassive) {
    markers.forEach(function(m) { map.removeLayer(m); });
    markers = [];
    var currentZoom = map.getZoom();
    obstacles.forEach(function(obs) {
      if (obs.isIndoor && currentZoom < ${HIGH_DETAIL_ZOOM}) return;
      var isPassive = obs.status === 'PASSIVE';
      var color = CATEGORY_COLOR[obs.category] || '#9CA3AF';
      var marker;
      if (obs.isIndoor) {
        var indoorIcon = L.divIcon({
          html: '<div style="width:22px;height:22px;border-radius:50%;background:' + color + ';border:3px solid white;box-shadow:0 3px 8px rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:white;font-family:system-ui,sans-serif;line-height:1">i<\/div>',
          className: '',
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        });
        marker = L.marker([obs.latitude, obs.longitude], {
          icon: indoorIcon,
          opacity: isPassive ? 0.5 : 1
        });
      } else {
        marker = L.circleMarker([obs.latitude, obs.longitude], {
          radius: 10, color: color, fillColor: color,
          fillOpacity: isPassive ? 0.4 : 0.85,
          weight: isPassive ? 1 : 2, opacity: isPassive ? 0.5 : 1
        });
      }
      var statusColor = STATUS_COLOR[obs.status] || '#9CA3AF';
      var statusLabel = STATUS_LABEL[obs.status] || obs.status;
      var catLabel = obs.category.replace(/_/g, ' ');
      var popupHtml =
        '<div class="popup-title">' + obs.title + '<\/div>' +
        '<span class="badge" style="background:' + color + '">' + catLabel + '<\/span>' +
        '<span class="badge" style="background:' + statusColor + '">' + statusLabel + '<\/span>' +
        (obs.description ? '<div class="popup-desc">' + obs.description + '<\/div>' : '');
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

  // ── Route planning additions ──────────────────────────────────────────────

  var pinMode = null;
  var originMarker = null, destMarker = null, routeLine = null;
  var searchPin = null;

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

  window.setSearchPin = function(lat, lng) {
    if (searchPin) map.removeLayer(searchPin);
    searchPin = L.marker([lat, lng], { icon: makeIcon('#EF4444') }).addTo(map);
    map.flyTo([lat, lng], 18);
  };

  window.clearSearchPin = function() {
    if (searchPin) { map.removeLayer(searchPin); searchPin = null; }
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
  };

  window.clearMarkers = function() {
    if (originMarker) { map.removeLayer(originMarker); originMarker = null; }
    if (destMarker) { map.removeLayer(destMarker); destMarker = null; }
  };

  window.fitBothPoints = function() {
    if (originMarker && destMarker) {
      var group = L.featureGroup([originMarker, destMarker]);
      map.fitBounds(group.getBounds(), { padding: [60, 60] });
    }
  };

  // Signal ready
  window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'READY' }));
<\/script>
</body>
</html>`;

// ── Main component ───────────────────────────────────────────────────────────

export default function MapView() {
  const router = useRouter();
  const webViewRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const autocompleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search state
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<SearchResult | null>(null);

  // Route planning state
  const [routePanelOpen, setRoutePanelOpen] = useState(false);
  const [origin, setOrigin] = useState<MapPoint | null>(null);
  const [dest, setDest] = useState<MapPoint | null>(null);
  const [originQ, setOriginQ] = useState('');
  const [destQ, setDestQ] = useState('');
  const [pinMode, setPinMode] = useState<'origin' | 'dest' | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [showPrefs, setShowPrefs] = useState(false);
  const [prefs, setPrefs] = useState<GuestPreferences>({
    avoidStairs: true,
    avoidSteepSlopes: false,
    maxSlopeGradient: 8,
  });

  // Saved places state
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [saveTarget, setSaveTarget] = useState<{ kind: 'origin' | 'dest'; lat: number; lng: number; address: string } | null>(null);
  const [saveLabel, setSaveLabel] = useState('');
  const [savingPlace, setSavingPlace] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Origin autocomplete state
  const [originSuggestions, setOriginSuggestions] = useState<SearchResult[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<SearchResult[]>([]);
  const originAutoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destAutoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [originFocused, setOriginFocused] = useState(false);
  const [destFocused, setDestFocused] = useState(false);

  const currentBoundsRef = useRef<{ north: number; south: number; east: number; west: number } | null>(null);

  const source = useMemo(() => ({ html: MAP_HTML }), []);
  const prefetchedRef = useRef<Obstacle[] | null>(null);

  const { location: currentLocation } = useLocation();

  // ── Saved places ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (isLoggedIn()) getSavedPlaces().then(setSavedPlaces);
  }, []);

  const handleSavePlace = useCallback(async () => {
    if (!saveTarget || !saveLabel.trim()) return;
    setSavingPlace(true);
    setSaveError('');
    const result = await createSavedPlace({
      label: saveLabel.trim(),
      latitude: saveTarget.lat,
      longitude: saveTarget.lng,
      address: saveTarget.address || undefined,
    });
    setSavingPlace(false);
    if (result) {
      setSavedPlaces((prev) => [...prev, result]);
      setSaveTarget(null);
      setSaveLabel('');
    } else {
      setSaveError('Failed to save place. Please try again.');
    }
  }, [saveTarget, saveLabel]);

  const openSaveModal = (kind: 'origin' | 'dest') => {
    const point = kind === 'origin' ? origin : dest;
    if (!point) return;
    setSaveTarget({ kind, lat: point.lat, lng: point.lng, address: point.label });
    setSaveLabel('');
    setSaveError('');
  };

  // ── Obstacle loading ─────────────────────────────────────────────────────

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
  ) => {
    const data = await fetchObstacles(bbox, false);
    pushObstacles(data, false);
  }, [pushObstacles]);

  // ── Autocomplete for main search ─────────────────────────────────────────

  const handleQueryChange = (text: string) => {
    setQuery(text);
    setSelectedLocation(null);
    if (autocompleteTimer.current) clearTimeout(autocompleteTimer.current);
    if (text.trim().length < 2) { setSuggestions([]); return; }
    autocompleteTimer.current = setTimeout(async () => {
      const results = await searchLocations(text.trim());
      setSuggestions(results);
    }, 300);
  };

  const handleSelectSuggestion = (result: SearchResult) => {
    setQuery(result.name);
    setSuggestions([]);
    setSelectedLocation(result);
    setSearchFocused(false);
    Keyboard.dismiss();
    webViewRef.current?.injectJavaScript(
      `window.setSearchPin(${result.latitude}, ${result.longitude}); true;`
    );
    // Auto-fill destination
    setDest({ lat: result.latitude, lng: result.longitude, label: result.name });
    setDestQ(result.name);
    webViewRef.current?.injectJavaScript(
      `window.setDest(${result.latitude}, ${result.longitude}); true;`
    );
  };

  const handlePlanRoute = () => {
    setRoutePanelOpen(true);
    // Clear the search pin when entering route panel mode
    webViewRef.current?.injectJavaScript(`window.clearSearchPin(); true;`);
  };

  // ── Origin / Destination autocomplete ────────────────────────────────────

  const handleOriginQChange = (text: string) => {
    setOriginQ(text);
    if (originAutoTimer.current) clearTimeout(originAutoTimer.current);
    if (text.trim().length < 2) { setOriginSuggestions([]); return; }
    originAutoTimer.current = setTimeout(async () => {
      const results = await searchLocations(text.trim());
      setOriginSuggestions(results);
    }, 300);
  };

  const handleDestQChange = (text: string) => {
    setDestQ(text);
    if (destAutoTimer.current) clearTimeout(destAutoTimer.current);
    if (text.trim().length < 2) { setDestSuggestions([]); return; }
    destAutoTimer.current = setTimeout(async () => {
      const results = await searchLocations(text.trim());
      setDestSuggestions(results);
    }, 300);
  };

  const selectOriginSuggestion = (r: SearchResult) => {
    const point: MapPoint = { lat: r.latitude, lng: r.longitude, label: r.name };
    setOrigin(point);
    setOriginQ(r.name);
    setOriginSuggestions([]);
    setOriginFocused(false);
    Keyboard.dismiss();
    webViewRef.current?.injectJavaScript(`window.setOrigin(${r.latitude}, ${r.longitude}); true;`);
    clearRouteOnChange();
  };

  const selectDestSuggestion = (r: SearchResult) => {
    const point: MapPoint = { lat: r.latitude, lng: r.longitude, label: r.name };
    setDest(point);
    setDestQ(r.name);
    setDestSuggestions([]);
    setDestFocused(false);
    Keyboard.dismiss();
    webViewRef.current?.injectJavaScript(`window.setDest(${r.latitude}, ${r.longitude}); true;`);
    clearRouteOnChange();
  };

  // ── Route planning handlers ──────────────────────────────────────────────

  const clearRouteOnChange = () => {
    setRoute(null);
    webViewRef.current?.injectJavaScript(`window.clearRoute(); true;`);
  };

  const useCurrentLocation = async () => {
    if (!currentLocation) return;
    const { lat, lng } = currentLocation;
    const coordLabel = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    setOrigin({ lat, lng, label: coordLabel });
    setOriginQ(coordLabel);
    setOriginSuggestions([]);
    webViewRef.current?.injectJavaScript(`window.setOrigin(${lat}, ${lng}); true;`);
    clearRouteOnChange();
    // Reverse-geocode to get a real address
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=en`,
        { headers: { 'User-Agent': 'AccessMap/1.0' } },
      );
      if (res.ok) {
        const data = await res.json();
        const short = (data.display_name ?? coordLabel).split(',').slice(0, 3).join(',').trim();
        setOrigin({ lat, lng, label: short });
        setOriginQ(short);
      }
    } catch {}
  };

  const activatePinMode = (kind: 'origin' | 'dest') => {
    const next = pinMode === kind ? null : kind;
    setPinMode(next);
    webViewRef.current?.injectJavaScript(`window.setPinMode(${next ? `'${next}'` : 'null'}); true;`);
  };

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

  const closeRoutePanel = () => {
    setRoutePanelOpen(false);
    setOrigin(null);
    setDest(null);
    setOriginQ('');
    setDestQ('');
    setRoute(null);
    setRouteError(null);
    setPinMode(null);
    webViewRef.current?.injectJavaScript(`window.clearRoute(); window.clearMarkers(); true;`);
    // Re-show search pin if a location was selected
    if (selectedLocation) {
      webViewRef.current?.injectJavaScript(
        `window.setSearchPin(${selectedLocation.latitude}, ${selectedLocation.longitude}); true;`
      );
    }
  };

  // ── WebView message handler ──────────────────────────────────────────────

  const handleMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'READY') {
        readyRef.current = true;
        if (prefetchedRef.current) {
          pushObstacles(prefetchedRef.current, false);
          prefetchedRef.current = null;
        }
      } else if (msg.type === 'BOUNDS_CHANGE') {
        const bbox = { north: msg.north, south: msg.south, east: msg.east, west: msg.west };
        currentBoundsRef.current = bbox;
        loadObstacles(bbox);
      } else if (msg.type === 'PIN_DROPPED') {
        const coordLabel = `${msg.lat.toFixed(5)}, ${msg.lng.toFixed(5)}`;
        const point: MapPoint = { lat: msg.lat, lng: msg.lng, label: coordLabel };
        if (msg.kind === 'origin') { setOrigin(point); setOriginQ(coordLabel); }
        else { setDest(point); setDestQ(coordLabel); }
        clearRouteOnChange();

        // Reverse geocode
        fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${msg.lat}&lon=${msg.lng}&format=json&accept-language=en`,
          { headers: { 'User-Agent': 'AccessMap/1.0' } },
        ).then(res => {
          if (!res.ok) return;
          return res.json();
        }).then(data => {
          if (!data) return;
          const short = (data.display_name ?? coordLabel).split(',').slice(0, 3).join(',').trim();
          const named: MapPoint = { lat: msg.lat, lng: msg.lng, label: short };
          if (msg.kind === 'origin') { setOrigin(named); setOriginQ(short); }
          else { setDest(named); setDestQ(short); }
        }).catch(() => {});

        webViewRef.current?.injectJavaScript(`window.fitBothPoints(); true;`);
      } else if (msg.type === 'PIN_CLICK') {
        router.push(`/report/${msg.id}`);
      }
    } catch {}
  }, [loadObstacles, pushObstacles]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={s.container}>

      {/* ── Full-screen map ── */}
      <WebView
        ref={webViewRef}
        style={s.map}
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

      {/* ── Overlaid UI ── */}
      <View style={s.overlay} pointerEvents="box-none">

        {/* Top bar area */}
        <View style={s.topArea} pointerEvents="box-none">

          {!routePanelOpen ? (
            /* ── Default: Search bar + passive chip ── */
            <View style={s.searchCard}>
              <View style={s.searchWrap}>
                <Ionicons name="search-outline" size={22} color={COLORS.gray500} />
                <TextInput
                  style={s.searchInput}
                  placeholder="Search for a location"
                  placeholderTextColor={COLORS.gray400}
                  value={query}
                  onChangeText={handleQueryChange}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                  returnKeyType="search"
                />
                {query.length > 0 ? (
                  <TouchableOpacity onPress={() => { setQuery(''); setSuggestions([]); setSelectedLocation(null); webViewRef.current?.injectJavaScript(`window.clearSearchPin(); true;`); }}>
                    <Ionicons name="close-circle" size={24} color={COLORS.gray400} />
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Autocomplete suggestions */}
              {searchFocused && suggestions.length > 0 && (
                <View style={s.suggestionsBox}>
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

              {/* "Plan Route" chip after selecting a destination */}
              {selectedLocation && !routePanelOpen && (
                <TouchableOpacity style={s.planRouteChip} onPress={handlePlanRoute}>
                  <Ionicons name="navigate-outline" size={16} color={COLORS.white} />
                  <Text style={s.planRouteChipText}>Plan Route</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            /* ── Route panel ── */
            <View style={s.routeCard}>
              <View style={s.routeCardHeader}>
                <Text style={s.routeCardTitle}>Plan Route</Text>
                <TouchableOpacity onPress={closeRoutePanel}>
                  <Ionicons name="close-outline" size={22} color={COLORS.gray500} />
                </TouchableOpacity>
              </View>

              {/* Saved places quick-select for origin */}
              {originFocused && savedPlaces.length > 0 && originQ.length === 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.savedChips} keyboardShouldPersistTaps="handled">
                  {savedPlaces.map((p) => (
                    <TouchableOpacity key={p.id} style={s.savedChip} onPress={() => selectOriginSuggestion({ id: p.id, name: p.label, latitude: p.latitude, longitude: p.longitude })}>
                      <Ionicons name="bookmark" size={11} color={COLORS.green700} />
                      <Text style={s.savedChipText}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {/* Origin row */}
              <View style={s.inputRow}>
                <View style={[s.dot, s.dotOrigin]} />
                <View style={{ flex: 1 }}>
                  <TextInput
                    style={s.input}
                    placeholder="Origin — search or drop pin"
                    placeholderTextColor={COLORS.gray400}
                    value={originQ}
                    onChangeText={handleOriginQChange}
                    onFocus={() => setOriginFocused(true)}
                    onBlur={() => setTimeout(() => setOriginFocused(false), 200)}
                    onSubmitEditing={() => {
                      if (originSuggestions.length > 0) selectOriginSuggestion(originSuggestions[0]);
                    }}
                    returnKeyType="search"
                  />
                  {originFocused && originSuggestions.length > 0 && (
                    <View style={s.fieldSuggestions}>
                      <FlatList
                        data={originSuggestions}
                        keyExtractor={(item) => item.id}
                        keyboardShouldPersistTaps="handled"
                        renderItem={({ item }) => (
                          <TouchableOpacity style={s.suggestionItem} onPress={() => selectOriginSuggestion(item)}>
                            <Ionicons name="location-outline" size={14} color={COLORS.gray500} />
                            <Text style={s.suggestionText} numberOfLines={1}>{item.name}</Text>
                          </TouchableOpacity>
                        )}
                      />
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  style={[s.pinBtn, pinMode === 'origin' && s.pinBtnActive]}
                  onPress={() => activatePinMode('origin')}
                >
                  <Ionicons name="location-outline" size={18}
                    color={pinMode === 'origin' ? COLORS.green700 : COLORS.gray400} />
                </TouchableOpacity>
                {origin && isLoggedIn() && (
                  <TouchableOpacity style={s.bookmarkBtn} onPress={() => openSaveModal('origin')}>
                    <Ionicons name="bookmark-outline" size={16} color={COLORS.green700} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Use current location button */}
              <TouchableOpacity style={s.currentLocBtn} onPress={useCurrentLocation} disabled={!currentLocation}>
                <Ionicons name="navigate-circle-outline" size={16} color={currentLocation ? COLORS.blue600 : COLORS.gray300} />
                <Text style={[s.currentLocText, !currentLocation && { color: COLORS.gray300 }]}>Use current location</Text>
              </TouchableOpacity>

              <View style={s.connector}><View style={s.connectorLine} /></View>

              {/* Saved places quick-select for destination */}
              {destFocused && savedPlaces.length > 0 && destQ.length === 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.savedChips} keyboardShouldPersistTaps="handled">
                  {savedPlaces.map((p) => (
                    <TouchableOpacity key={p.id} style={s.savedChip} onPress={() => selectDestSuggestion({ id: p.id, name: p.label, latitude: p.latitude, longitude: p.longitude })}>
                      <Ionicons name="bookmark" size={11} color={COLORS.green700} />
                      <Text style={s.savedChipText}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {/* Destination row */}
              <View style={s.inputRow}>
                <View style={[s.dot, s.dotDest]} />
                <View style={{ flex: 1 }}>
                  <TextInput
                    style={s.input}
                    placeholder="Destination — search or drop pin"
                    placeholderTextColor={COLORS.gray400}
                    value={destQ}
                    onChangeText={handleDestQChange}
                    onFocus={() => setDestFocused(true)}
                    onBlur={() => setTimeout(() => setDestFocused(false), 200)}
                    onSubmitEditing={() => {
                      if (destSuggestions.length > 0) selectDestSuggestion(destSuggestions[0]);
                    }}
                    returnKeyType="search"
                  />
                  {destFocused && destSuggestions.length > 0 && (
                    <View style={s.fieldSuggestions}>
                      <FlatList
                        data={destSuggestions}
                        keyExtractor={(item) => item.id}
                        keyboardShouldPersistTaps="handled"
                        renderItem={({ item }) => (
                          <TouchableOpacity style={s.suggestionItem} onPress={() => selectDestSuggestion(item)}>
                            <Ionicons name="location-outline" size={14} color={COLORS.gray500} />
                            <Text style={s.suggestionText} numberOfLines={1}>{item.name}</Text>
                          </TouchableOpacity>
                        )}
                      />
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  style={[s.pinBtn, pinMode === 'dest' && s.pinBtnActive]}
                  onPress={() => activatePinMode('dest')}
                >
                  <Ionicons name="location-outline" size={18}
                    color={pinMode === 'dest' ? COLORS.red500 : COLORS.gray400} />
                </TouchableOpacity>
                {dest && isLoggedIn() && (
                  <TouchableOpacity style={s.bookmarkBtn} onPress={() => openSaveModal('dest')}>
                    <Ionicons name="bookmark-outline" size={16} color={COLORS.green700} />
                  </TouchableOpacity>
                )}
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

              {route && (
                <View style={s.summaryCard}>
                  <View style={s.summaryRow}>
                    <View style={s.summaryItem}>
                      <Ionicons name="walk-outline" size={16} color={COLORS.green700} />
                      <Text style={s.summaryValue}>{formatDistance(route.distanceMeters)}</Text>
                      <Text style={s.summaryLabel}>Distance</Text>
                    </View>
                    <View style={s.summaryDivider} />
                    <View style={s.summaryItem}>
                      <Ionicons name="time-outline" size={16} color={COLORS.green700} />
                      <Text style={s.summaryValue}>{formatTime(route.estimatedTimeSeconds)}</Text>
                      <Text style={s.summaryLabel}>Est. time</Text>
                    </View>
                    <View style={s.summaryDivider} />
                    <View style={s.summaryItem}>
                      <Ionicons name="shield-checkmark-outline" size={16} color={COLORS.green700} />
                      <Text style={s.summaryValue}>{route.avoidedObstaclesCount ?? 0}</Text>
                      <Text style={s.summaryLabel}>Avoided</Text>
                    </View>
                  </View>
                </View>
              )}
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

      </View>

      {/* Save place modal */}
      {saveTarget && (
        <SavePlaceModal
          label={saveLabel}
          onLabelChange={(t) => { setSaveLabel(t); setSaveError(''); }}
          saving={savingPlace}
          error={saveError}
          onSave={handleSavePlace}
          onCancel={() => { setSaveTarget(null); setSaveError(''); }}
        />
      )}

      {/* Guest preferences overlay */}
      {showPrefs && (
        <View style={s.prefsOverlay}>
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
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },
  mapLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Full-screen overlay container (box-none lets taps pass to map)
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },

  topArea: { paddingTop: 8 },

  // ── Search card (default state) ────────────────────────────────────────────
  searchCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: COLORS.white,
    borderRadius: 26,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  searchWrap: {
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 10,
    height: 52, 
    paddingHorizontal: 16,
  },
  searchInput: { 
    flex: 1, 
    height: 52, 
    fontSize: 16, 
    color: COLORS.gray800, 
    fontWeight: '500' 
  },

  // ── Suggestions dropdown ───────────────────────────────────────────────────
  suggestionsBox: {
    marginTop: 4,
    maxHeight: 220,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
    paddingTop: 4,
  },
  suggestionItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.gray200,
  },
  suggestionText: { flex: 1, fontSize: 15, color: COLORS.gray800 },

  // ── Plan Route chip ────────────────────────────────────────────────────────
  planRouteChip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 10, height: 40, borderRadius: 10,
    backgroundColor: COLORS.green700,
  },
  planRouteChipText: { color: COLORS.white, fontWeight: '700', fontSize: 14 },

  // ── Route panel ────────────────────────────────────────────────────────────
  routeCard: {
    marginHorizontal: 12,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
    gap: 4,
  },
  routeCardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 4,
  },
  routeCardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.gray800 },
  inputRow: { flexDirection: 'row', alignItems: 'center', height: 44, gap: 10 },
  dot: {
    width: 11, height: 11, borderRadius: 6, borderWidth: 2.5,
    borderColor: COLORS.white, flexShrink: 0,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
  },
  dotOrigin: { backgroundColor: COLORS.green700 },
  dotDest: { backgroundColor: COLORS.red500 },
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
  currentLocBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingLeft: 22, paddingVertical: 2,
  },
  currentLocText: { fontSize: 13, color: COLORS.blue600, fontWeight: '500' },
  fieldSuggestions: {
    position: 'absolute', top: 42, left: 0, right: 0, zIndex: 100,
    backgroundColor: COLORS.white, borderRadius: 8, maxHeight: 150,
    borderWidth: 1, borderColor: COLORS.gray200,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 4,
  },
  routeBtn: {
    marginTop: 8, height: 44, borderRadius: 11, backgroundColor: COLORS.green700,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  routeBtnDisabled: { backgroundColor: COLORS.gray300 },
  routeBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  errorText: { fontSize: 12, color: COLORS.red500 },

  // ── Saved places ──────────────────────────────────────────────────────────
  savedChips: { flexDirection: 'row', paddingVertical: 6, gap: 6 },
  savedChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: COLORS.green50, borderRadius: 100,
    borderWidth: 1, borderColor: COLORS.green200,
  },
  savedChipText: { fontSize: 12, fontWeight: '600', color: COLORS.green700 },
  bookmarkBtn: {
    width: 36, height: 36, borderRadius: 9, borderWidth: 1,
    borderColor: COLORS.green200, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.green50, flexShrink: 0,
  },
  presetRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  presetChip: {
    flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center',
    borderWidth: 1.5, borderColor: COLORS.gray300, backgroundColor: COLORS.white,
  },
  presetChipActive: { borderColor: COLORS.green600, backgroundColor: COLORS.green50 },
  presetChipText: { fontSize: 14, fontWeight: '600', color: COLORS.gray600 },
  presetChipTextActive: { color: COLORS.green700 },

  // ── Route summary ──────────────────────────────────────────────────────────
  summaryCard: {
    marginTop: 10,
    backgroundColor: COLORS.green50,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.green200,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  summaryItem: { alignItems: 'center', gap: 2, flex: 1 },
  summaryDivider: { width: 1, height: 32, backgroundColor: COLORS.green200 },
  summaryValue: { fontSize: 14, fontWeight: '700', color: COLORS.gray800 },
  summaryLabel: { fontSize: 10, color: COLORS.gray400, fontWeight: '500' },

  // ── Pin mode banner ────────────────────────────────────────────────────────
  pinBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 12, marginTop: 8,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: COLORS.green50, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.green200,
  },
  pinBannerText: { flex: 1, fontSize: 13, color: COLORS.green700, fontWeight: '500' },

  // ── Guest preferences overlay ──────────────────────────────────────────────
  prefsOverlay: {
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
