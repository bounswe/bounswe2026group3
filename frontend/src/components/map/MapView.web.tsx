/// <reference lib="dom" />
// @ts-ignore
import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, StyleSheet, Switch,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, ZoomControl,
  useMap, useMapEvents,
} from 'react-leaflet';

import {
  fetchObstacleDetail, fetchObstacles, searchLocations,
  type Obstacle, type ObstacleDetail, type SearchResult,
} from '../../api/map';
import { calculateRoute, type GuestPreferences, type RouteResult } from '../../api/routes';
import { isLoggedIn } from '../../services/auth';
import { useLocation } from '../../hooks/useLocation';
import { COLORS } from '../../constants/theme';

// ── Leaflet icon setup ─────────────────────────────────────────────────────

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const BOUN_CENTER: [number, number] = [41.0847, 29.0503];
const DEFAULT_ZOOM = 16;
const HIGH_DETAIL_ZOOM = 18;
const DEFAULT_BBOX = { north: 41.095, south: 41.074, east: 29.065, west: 29.035 };

const CATEGORY_COLOR: Record<string, string> = {
  BROKEN_RAMP: COLORS.red500,
  NARROW_SIDEWALK: COLORS.orange500,
  DAMAGED_SURFACE: COLORS.orange500,
  ROAD_CONSTRUCTION: '#EAB308',
  BLOCKED_PATH: COLORS.red600,
  OTHER: COLORS.gray500,
};

const STATUS_LABEL: Record<string, string> = {
  UNVERIFIED: 'Unverified', PASSIVE: 'Passive', VERIFIED: 'Verified',
  RESOLVED_AWAITING_VALIDATION: 'Awaiting Validation', CLOSED: 'Closed',
};

const STATUS_COLOR: Record<string, string> = {
  UNVERIFIED: COLORS.gray400, PASSIVE: COLORS.gray400, VERIFIED: COLORS.green500,
  RESOLVED_AWAITING_VALIDATION: COLORS.blue500, CLOSED: COLORS.gray500,
};

const makeCircleIcon = (color: string) =>
  L.divIcon({
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>`,
    className: '',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });

const ORIGIN_ICON = makeCircleIcon(COLORS.green700);
const DEST_ICON   = makeCircleIcon(COLORS.red500);

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function formatTime(sec: number): string {
  const mins = Math.round(sec / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), rem = mins % 60;
  return rem > 0 ? `${h}h ${rem}min` : `${h}h`;
}

// ── Sub-components inside MapContainer ─────────────────────────────────────

function BoundsWatcher({
  onChange,
}: {
  onChange: (b: L.LatLngBounds, z: number) => void;
}) {
  const map = useMapEvents({
    moveend: () => onChange(map.getBounds(), map.getZoom()),
    zoomend: () => onChange(map.getBounds(), map.getZoom()),
  });
  useEffect(() => {
    onChange(map.getBounds(), map.getZoom());
  }, []);
  return null;
}

function FitBounds({
  origin,
  dest,
  route,
}: {
  origin: [number, number] | null;
  dest: [number, number] | null;
  route: [number, number][] | null;
}) {
  const map = useMap();
  const prevBothSet = useRef(false);

  useEffect(() => {
    const bothSet = origin !== null && dest !== null;
    if (bothSet && !prevBothSet.current) {
      map.fitBounds([origin, dest], { padding: [60, 60] });
    }
    prevBothSet.current = bothSet;
  }, [origin, dest]);

  useEffect(() => {
    if (route && route.length > 1) {
      map.fitBounds(route as L.LatLngBoundsExpression, { padding: [60, 60] });
      setTimeout(() => map.invalidateSize(), 100);
    }
  }, [route]);

  return null;
}

function FlyToPoint({ point }: { point: [number, number] | null }) {
  const map = useMap();
  const flownRef = useRef<string | null>(null);
  useEffect(() => {
    if (!point) { flownRef.current = null; return; }
    const key = `${point[0]},${point[1]}`;
    if (flownRef.current === key) return;
    flownRef.current = key;
    map.flyTo(point, 17);
  }, [point]);
  return null;
}

// ── Popup content ──────────────────────────────────────────────────────────

function ObstaclePopup({
  obs, detail, loading,
}: {
  obs: Obstacle; detail: ObstacleDetail | undefined; loading: boolean;
}) {
  const color = CATEGORY_COLOR[obs.category] ?? COLORS.gray500;
  const statusColor = STATUS_COLOR[obs.status] ?? COLORS.gray400;

  return (
    <div style={{ minWidth: 200, maxWidth: 240, fontFamily: 'system-ui, sans-serif' }}>
      {detail?.photos?.[0] && (
        <img
          src={detail.photos[0].imageUrl} alt="obstacle"
          style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 4, marginBottom: 8, display: 'block' }}
        />
      )}
      <strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>{obs.title}</strong>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ background: color, color: '#fff', borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 600 }}>
          {obs.category.replace(/_/g, ' ')}
        </span>
        <span style={{ background: statusColor, color: '#fff', borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 600 }}>
          {STATUS_LABEL[obs.status] ?? obs.status}
        </span>
      </div>
      {obs.description && (
        <p style={{ margin: '0 0 6px', fontSize: 12, color: '#444', lineHeight: 1.4 }}>{obs.description}</p>
      )}
      {loading && <div style={{ color: '#888', fontSize: 11, marginTop: 4 }}>Loading details...</div>}
      {!loading && detail && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#555', fontSize: 12, marginTop: 4, borderTop: '1px solid #eee', paddingTop: 6 }}>
          <span>upvotes: {detail.upvoteCount ?? 0}</span>
        </div>
      )}
    </div>
  );
}

// ── Types ───────────────────────────────────────────────────────────────────

interface MapPoint { lat: number; lng: number; label: string; }

// ── Main component ──────────────────────────────────────────────────────────

export default function MapView() {
  const mapRef = useRef<L.Map | null>(null);

  // Obstacle state
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [showPassive, setShowPassive] = useState(false);
  const [currentBounds, setCurrentBounds] = useState<L.LatLngBounds | null>(null);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [boundsKey, setBoundsKey] = useState('');
  const [detailMap, setDetailMap] = useState<Record<string, ObstacleDetail | 'loading'>>({});

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
  const [destFlyTarget, setDestFlyTarget] = useState<[number, number] | null>(null);

  // Guest preferences
  const [showPrefs, setShowPrefs] = useState(false);
  const [prefs, setPrefs] = useState<GuestPreferences>({
    avoidStairs: true,
    avoidSteepSlopes: false,
    maxSlopeGradient: 8,
  });

  // Location
  const { location: currentLocation, loading: locationLoading, refetch: refetchLocation } = useLocation();

  const prefetchedRef = useRef(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Prefetch obstacles
  useEffect(() => {
    prefetchedRef.current = true;
    fetchObstacles(DEFAULT_BBOX, false).then((data) => {
      setObstacles((prev) => (prev.length === 0 ? data : prev));
    });
  }, []);

  // Re-fetch on bounds/passive change
  useEffect(() => {
    if (!currentBounds) return;
    let cancelled = false;
    fetchObstacles(
      {
        north: currentBounds.getNorth(), south: currentBounds.getSouth(),
        east: currentBounds.getEast(), west: currentBounds.getWest(),
      },
      showPassive,
    ).then((data) => { if (!cancelled) setObstacles(data); });
    return () => { cancelled = true; };
  }, [boundsKey, showPassive]);

  const handleBoundsChange = useCallback((b: L.LatLngBounds, z: number) => {
    setCurrentBounds(b);
    setZoom(z);
    const key = `${b.getNorth().toFixed(4)},${b.getSouth().toFixed(4)},${b.getEast().toFixed(4)},${b.getWest().toFixed(4)}`;
    setBoundsKey(key);
  }, []);

  const handlePinClick = useCallback(async (id: string) => {
    setDetailMap((prev) => {
      if (prev[id]) return prev;
      return { ...prev, [id]: 'loading' };
    });
    const detail = await fetchObstacleDetail(id);
    setDetailMap((prev) => {
      if (!detail) { const next = { ...prev }; delete next[id]; return next; }
      return { ...prev, [id]: detail };
    });
  }, []);

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
    setQuery(item.name);
    setSuggestions([]);
    setShowSuggestions(false);
    const point: MapPoint = { lat: item.latitude, lng: item.longitude, label: item.name };
    setDest(point);
    setRoute(null);
    setRouteError(null);
    setOrigin(null);
    setOriginQ('');
    setShowRoutePanel(false);
    setDestFlyTarget([item.latitude, item.longitude]);
  }, []);

  // ── Route planning ─────────────────────────────────────────────────────────

  const handleUseCurrentLocation = useCallback(async () => {
    if (currentLocation) {
      const point: MapPoint = { lat: currentLocation.lat, lng: currentLocation.lng, label: 'Current Location' };
      setOrigin(point);
      setOriginQ('Current Location');
    } else {
      await refetchLocation();
    }
  }, [currentLocation, refetchLocation]);

  const handleOriginSearch = useCallback(async () => {
    if (!originQ.trim()) return;
    const results = await searchLocations(originQ.trim());
    if (results.length > 0) {
      const r = results[0];
      setOrigin({ lat: r.latitude, lng: r.longitude, label: r.name });
      setOriginQ(r.name);
    }
  }, [originQ]);

  const doCalculate = useCallback(async (guestPrefs?: GuestPreferences) => {
    if (!origin || !dest) return;
    setShowPrefs(false);
    setRouteLoading(true);
    setRouteError(null);
    setRoute(null);
    const result = await calculateRoute({
      originLat: origin.lat, originLng: origin.lng,
      destinationLat: dest.lat, destinationLng: dest.lng,
      preferences: guestPrefs,
    });
    setRouteLoading(false);
    if (result) setRoute(result);
    else setRouteError('Could not calculate route. Please try again.');
  }, [origin, dest]);

  const handleGetRoute = useCallback(() => {
    if (!origin || !dest) { setRouteError('Please set both origin and destination.'); return; }
    if (isLoggedIn()) doCalculate();
    else setShowPrefs(true);
  }, [origin, dest, doCalculate]);

  const handleCloseRoutePanel = useCallback(() => {
    setShowRoutePanel(false);
    setOrigin(null);
    setOriginQ('');
    setRoute(null);
    setRouteError(null);
  }, []);

  const handleClearAll = useCallback(() => {
    setQuery('');
    setDest(null);
    setOrigin(null);
    setOriginQ('');
    setRoute(null);
    setRouteError(null);
    setShowRoutePanel(false);
    setDestFlyTarget(null);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  const originLL: [number, number] | null = origin ? [origin.lat, origin.lng] : null;
  const destLL: [number, number] | null = dest ? [dest.lat, dest.lng] : null;

  return (
    <View style={s.container}>
      {/* Full-screen map */}
      <View style={StyleSheet.absoluteFill}>
        <MapContainer
          center={BOUN_CENTER}
          zoom={DEFAULT_ZOOM}
          zoomControl={false}
          style={{ width: '100%', height: '100%' }}
          ref={mapRef}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          <ZoomControl position="bottomright" />
          <BoundsWatcher onChange={handleBoundsChange} />
          <FlyToPoint point={destFlyTarget} />
          <FitBounds origin={originLL} dest={destLL} route={route?.waypoints ?? null} />

          {/* Obstacle markers */}
          {obstacles.map((obs) => {
            if (obs.isIndoor && zoom < HIGH_DETAIL_ZOOM) return null;
            const isPassive = obs.status === 'PASSIVE';
            const color = CATEGORY_COLOR[obs.category] ?? COLORS.gray500;
            const cached = detailMap[obs.id];
            const detail = cached && cached !== 'loading' ? (cached as ObstacleDetail) : undefined;
            const detailLoading = cached === 'loading';

            return (
              <CircleMarker
                key={obs.id}
                center={[obs.latitude, obs.longitude]}
                radius={10}
                pathOptions={{
                  color, fillColor: color,
                  fillOpacity: isPassive ? 0.4 : 0.85,
                  weight: isPassive ? 1 : 2,
                  opacity: isPassive ? 0.5 : 1,
                }}
                eventHandlers={{ click: () => handlePinClick(obs.id) }}
              >
                <Popup>
                  <ObstaclePopup obs={obs} detail={detail} loading={detailLoading} />
                </Popup>
              </CircleMarker>
            );
          })}

          {/* Destination pin */}
          {destLL && <Marker position={destLL} icon={DEST_ICON} />}

          {/* Origin pin */}
          {originLL && <Marker position={originLL} icon={ORIGIN_ICON} />}

          {/* Route line */}
          {route && route.waypoints.length > 1 && (
            <Polyline
              positions={route.waypoints}
              pathOptions={{ color: COLORS.blue500, weight: 5, opacity: 0.85, lineJoin: 'round' }}
            />
          )}
        </MapContainer>
      </View>

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

        <View style={s.chipRow} pointerEvents="box-none">
          <TouchableOpacity
            style={[s.passiveChip, showPassive && s.passiveChipActive]}
            onPress={() => setShowPassive((v: boolean) => !v)}
          >
            <View style={[s.chipDot, showPassive && s.chipDotActive]} />
            <Text style={[s.chipText, showPassive && s.chipTextActive]}>Passive</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* "Plan Route" chip */}
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

          <View style={s.fieldRow}>
            <View style={[s.dot, s.dotDest]} />
            <Text style={s.fieldText} numberOfLines={1}>{dest?.label ?? ''}</Text>
          </View>

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

  chipRow: { flexDirection: 'row', marginTop: 8 },
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
  fieldDivider: { height: 1, backgroundColor: COLORS.gray200, marginVertical: 2 },
  routeBtn: {
    marginTop: 6, height: 44, borderRadius: 11, backgroundColor: COLORS.green700,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  routeBtnDisabled: { backgroundColor: COLORS.gray300 },
  routeBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  errorText: { fontSize: 12, color: COLORS.red500 },

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
