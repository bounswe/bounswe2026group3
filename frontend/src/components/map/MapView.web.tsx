/// <reference lib="dom" />
// @ts-ignore
import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, ZoomControl, useMap, useMapEvents } from 'react-leaflet';

import { fetchObstacleDetail, fetchObstacles, searchLocations, type Obstacle, type ObstacleDetail } from '../../api/map';
import { calculateRoute, type GuestPreferences, type RouteResult } from '../../api/routes';
import { isLoggedIn } from '../../services/auth';
import { COLORS } from '../../constants/theme';

// Fix default Leaflet marker icons (broken in bundler environments)
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const BOUN_CENTER: [number, number] = [41.0847, 29.0503];
const DEFAULT_ZOOM = 16;
const HIGH_DETAIL_ZOOM = 18;

// ── Colors ───────────────────────────────────────────────────────────────────

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
  UNVERIFIED: COLORS.gray400, PASSIVE: COLORS.gray400,
  VERIFIED: COLORS.green500, RESOLVED_AWAITING_VALIDATION: COLORS.blue500, CLOSED: COLORS.gray500,
};

// ── Leaflet icon helpers ──────────────────────────────────────────────────────

const makeCircleIcon = (color: string) =>
  L.divIcon({
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>`,
    className: '', iconSize: [14, 14], iconAnchor: [7, 7],
  });

const ORIGIN_ICON = makeCircleIcon(COLORS.green700);
const DEST_ICON   = makeCircleIcon(COLORS.red500);

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

// ── Types ─────────────────────────────────────────────────────────────────────

interface MapPoint { lat: number; lng: number; label: string; }

// ── Sub-components (must live inside MapContainer) ───────────────────────────

function BoundsWatcher({ onChange }: { onChange: (b: L.LatLngBounds, z: number) => void }) {
  const map = useMapEvents({
    moveend: () => onChange(map.getBounds(), map.getZoom()),
    zoomend: () => onChange(map.getBounds(), map.getZoom()),
  });
  useEffect(() => { onChange(map.getBounds(), map.getZoom()); }, []);
  return null;
}

function PinDropper({ active, onDrop }: { active: boolean; onDrop: (ll: L.LatLng) => void }) {
  useMapEvents({ click: (e) => { if (active) onDrop(e.latlng); } });
  return null;
}

function FitBounds({ origin, dest }: { origin: [number, number] | null; dest: [number, number] | null }) {
  const map = useMap();
  const prevBothSet = useRef(false);
  useEffect(() => {
    const bothSet = origin !== null && dest !== null;
    if (bothSet && !prevBothSet.current) {
      map.fitBounds([origin, dest], { padding: [60, 60] });
    }
    prevBothSet.current = bothSet;
  }, [origin, dest]);
  return null;
}

function FlyToPoint({ point }: { point: [number, number] | null }) {
  const map = useMap();
  const prev = useRef<string>('');
  useEffect(() => {
    if (!point) return;
    const key = `${point[0]},${point[1]}`;
    if (key === prev.current) return;
    prev.current = key;
    map.flyTo(point, 17);
  }, [point]);
  return null;
}

// ── Obstacle popup ────────────────────────────────────────────────────────────

function ObstaclePopup({ obs, detail, loading }: { obs: Obstacle; detail: ObstacleDetail | undefined; loading: boolean }) {
  const color = CATEGORY_COLOR[obs.category] ?? COLORS.gray500;
  const statusColor = STATUS_COLOR[obs.status] ?? COLORS.gray400;
  return (
    <div style={{ minWidth: 200, maxWidth: 240, fontFamily: 'system-ui, sans-serif' }}>
      {detail?.photos?.[0] && (
        <img src={detail.photos[0].imageUrl} alt="obstacle"
          style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 4, marginBottom: 8, display: 'block' }} />
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
      {obs.description ? <p style={{ margin: '0 0 6px', fontSize: 12, color: '#444', lineHeight: 1.4 }}>{obs.description}</p> : null}
      {loading && <div style={{ color: '#888', fontSize: 11, marginTop: 4 }}>Loading details…</div>}
      {!loading && detail && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#555', fontSize: 12, marginTop: 4, borderTop: '1px solid #eee', paddingTop: 6 }}>
          <span>👍 {detail.upvoteCount ?? 0} upvote{detail.upvoteCount !== 1 ? 's' : ''}</span>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MapView() {
  const mapRef = useRef<L.Map | null>(null);

  // Obstacle state
  const [obstacles, setObstacles]   = useState<Obstacle[]>([]);
  const [showPassive, setShowPassive] = useState(false);
  const [zoom, setZoom]               = useState(DEFAULT_ZOOM);
  const [boundsKey, setBoundsKey]     = useState('');
  const [detailMap, setDetailMap]     = useState<Record<string, ObstacleDetail | 'loading'>>({});

  // Search / route state
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [originQ, setOriginQ] = useState('');
  const [destQ,   setDestQ]   = useState('');
  const [origin, setOrigin]   = useState<MapPoint | null>(null);
  const [dest,   setDest]     = useState<MapPoint | null>(null);
  const [pinMode, setPinMode] = useState<'origin' | 'dest' | null>(null);
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);

  const [route,        setRoute]        = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError,   setRouteError]   = useState<string | null>(null);
  const [showPrefs,    setShowPrefs]    = useState(false);
  const [prefs, setPrefs] = useState<GuestPreferences>({
    avoidStairs: true, avoidSteepSlopes: false, maxSlopeGradient: 8,
  });
  const [locLoading, setLocLoading] = useState(false);

  // ── Obstacles ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!boundsKey) return;
    // boundsKey encodes north,south,east,west
    const [north, south, east, west] = boundsKey.split(',').map(Number);
    let cancelled = false;
    fetchObstacles({ north, south, east, west }, showPassive).then(data => {
      if (!cancelled) setObstacles(data);
    });
    return () => { cancelled = true; };
  }, [boundsKey, showPassive]);

  const handleBoundsChange = useCallback((b: L.LatLngBounds, z: number) => {
    setZoom(z);
    setBoundsKey(`${b.getNorth().toFixed(4)},${b.getSouth().toFixed(4)},${b.getEast().toFixed(4)},${b.getWest().toFixed(4)}`);
  }, []);

  const handlePinClick = useCallback(async (id: string) => {
    setDetailMap(prev => {
      if (prev[id]) return prev;
      return { ...prev, [id]: 'loading' };
    });
    const detail = await fetchObstacleDetail(id);
    setDetailMap(prev => {
      if (!detail) { const next = { ...prev }; delete next[id]; return next; }
      return { ...prev, [id]: detail };
    });
  }, []);

  // ── Search ─────────────────────────────────────────────────────────────────

  const searchAndSet = useCallback(async (q: string, kind: 'origin' | 'dest') => {
    if (!q.trim()) return;
    const results = await searchLocations(q.trim());
    if (!results.length) return;
    const r = results[0];
    const point: MapPoint = { lat: r.latitude, lng: r.longitude, label: r.name };
    if (kind === 'origin') { setOrigin(point); setOriginQ(r.name); }
    else                   { setDest(point);   setDestQ(r.name);   }
    setFlyTarget([r.latitude, r.longitude]);
    setRouteError(null);
  }, []);

  // ── GPS / current location (web: browser geolocation) ─────────────────────

  const handleUseCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) { setRouteError('Geolocation not supported by your browser.'); return; }
    setLocLoading(true);
    setRouteError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const label = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
        setOrigin({ lat: latitude, lng: longitude, label });
        setOriginQ(label);
        setFlyTarget([latitude, longitude]);
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
        setLocLoading(false);
      },
      () => { setRouteError('Could not get your location.'); setLocLoading(false); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  // ── Pin drop ───────────────────────────────────────────────────────────────

  const handleMapClick = useCallback(async (ll: L.LatLng) => {
    const coordLabel = `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`;
    const point: MapPoint = { lat: ll.lat, lng: ll.lng, label: coordLabel };
    if (pinMode === 'origin') { setOrigin(point); setOriginQ(coordLabel); }
    else                       { setDest(point);   setDestQ(coordLabel);   }
    setPinMode(null);
    setRouteError(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${ll.lat}&lon=${ll.lng}&format=json&accept-language=en`,
        { headers: { 'User-Agent': 'AccessMap/1.0' } },
      );
      if (res.ok) {
        const data = await res.json();
        const short = ((data.display_name ?? coordLabel) as string).split(',').slice(0, 3).join(',').trim();
        const named: MapPoint = { lat: ll.lat, lng: ll.lng, label: short };
        if (pinMode === 'origin') { setOrigin(named); setOriginQ(short); }
        else                       { setDest(named);   setDestQ(short);   }
      }
    } catch {}
  }, [pinMode]);

  // ── Route calculation ──────────────────────────────────────────────────────

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
    else        setRouteError('Could not calculate route. Please try again.');
  }, [origin, dest]);

  const handleGetRoute = useCallback(() => {
    if (!origin || !dest) { setRouteError('Please set both origin and destination.'); return; }
    if (isLoggedIn()) doCalculate();
    else setShowPrefs(true);
  }, [origin, dest, doCalculate]);

  // ── Derived values ─────────────────────────────────────────────────────────

  const originLL: [number, number] | null = origin ? [origin.lat, origin.lng] : null;
  const destLL:   [number, number] | null = dest   ? [dest.lat,   dest.lng]   : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={s.container}>

      {/* ── Full-screen map ── */}
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
          <PinDropper active={!!pinMode} onDrop={handleMapClick} />
          <FitBounds origin={originLL} dest={destLL} />
          <FlyToPoint point={flyTarget} />

          {/* Origin / destination markers */}
          {originLL && <Marker position={originLL} icon={ORIGIN_ICON} />}
          {destLL   && <Marker position={destLL}   icon={DEST_ICON}   />}

          {/* Route polyline */}
          {route && route.waypoints.length > 1 && (
            <Polyline
              positions={route.waypoints}
              pathOptions={{ color: COLORS.blue500, weight: 5, opacity: 0.85, lineJoin: 'round' }}
            />
          )}

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
        </MapContainer>
      </View>

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
                onPress={() => setPinMode(pinMode === 'origin' ? null : 'origin')}
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
                onPress={() => setPinMode(pinMode === 'dest' ? null : 'dest')}
              >
                <Ionicons name="location-outline" size={18} color={pinMode === 'dest' ? COLORS.red500 : COLORS.gray400} />
              </TouchableOpacity>
            </View>

            {/* Pin mode hint */}
            {pinMode && (
              <View style={s.pinHintRow}>
                <Ionicons name="finger-print-outline" size={13} color={COLORS.green700} />
                <Text style={s.pinHintText}>Click map to set {pinMode === 'origin' ? 'origin' : 'destination'}</Text>
                <TouchableOpacity onPress={() => setPinMode(null)}>
                  <Ionicons name="close-outline" size={16} color={COLORS.gray400} />
                </TouchableOpacity>
              </View>
            )}

            {/* Get Route button */}
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
              style={s.passiveRow}
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

  // Search overlay
  searchOverlay: {
    position: 'absolute', top: 12, left: 12, right: 12, zIndex: 1000,
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
  passiveRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 7, paddingHorizontal: 4 },

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
