import { useCallback, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import WebView from 'react-native-webview';
import { COLORS } from '../../constants/theme';

interface Props {
  center: { lat: number; lng: number };
  onLocationPick: (loc: { lat: number; lng: number }) => void;
}

const PICKER_HTML = `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{margin:0;padding:0;width:100%;height:100%}</style>
</head><body>
<div id="map"></div>
<script>
var map = L.map('map',{zoomControl:true});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
var marker = null;
map.on('click', function(e){
  if(marker) map.removeLayer(marker);
  marker = L.marker(e.latlng).addTo(map);
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type:'PIN_DROP', lat:e.latlng.lat, lng:e.latlng.lng
  }));
});
window.flyTo = function(lat,lng,zoom){
  map.setView([lat,lng],zoom||17);
};
window.ReactNativeWebView.postMessage(JSON.stringify({type:'READY'}));
</script>
</body></html>`;

export default function LocationPicker({ center, onLocationPick }: Props) {
  const webViewRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const source = useMemo(() => ({ html: PICKER_HTML }), []);

  const handleMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'READY') {
        readyRef.current = true;
        webViewRef.current?.injectJavaScript(
          `window.flyTo(${center.lat},${center.lng},17); true;`
        );
      } else if (msg.type === 'PIN_DROP') {
        const loc = { lat: msg.lat, lng: msg.lng };
        setPin(loc);
        onLocationPick(loc);
      }
    } catch {}
  }, [center, onLocationPick]);

  return (
    <View style={s.container}>
      <Text style={s.hint}>Tap on the map to drop a pin</Text>
      <View style={s.mapWrap}>
        <WebView
          ref={webViewRef}
          source={source}
          style={{ flex: 1 }}
          onMessage={handleMessage}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          nestedScrollEnabled
        />
      </View>
      {pin && (
        <Text style={s.coords}>
          {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { marginTop: 10 },
  hint: { fontSize: 12, color: COLORS.gray500, marginBottom: 6 },
  mapWrap: { height: 250, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.gray300 },
  coords: { fontSize: 13, color: COLORS.gray600, marginTop: 6, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
});
