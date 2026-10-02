/** SIBUS-M service boundaries. Replace local providers with API adapters when available. */
const SIBUS_CONFIG = Object.freeze({ apiUrl: '', realtimeUrl: '', realtimeEnabled: false, routePlannerEnabled: true, reportsEnabled: false, authEnabled: false, mapProvider: 'openstreetmap', tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', mapAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' });
const DataProvider = {
  getCompanies() { return typeof SIBUS_DATA === 'undefined' ? [] : SIBUS_DATA; },
  getRoutes(companyId = null) { return this.getCompanies().filter(company => !companyId || company.id === companyId).flatMap(company => (Array.isArray(company.routes) ? company.routes : []).map(route => ({ ...route, companyId: company.id, companyName: company.name }))); },
  getRoute(id) { return this.getRoutes().find(route => route.id === id) || null; },
  async getRouteGeometry(id) {
    const route = this.getRoute(id);
    if (route?.geometry) return route.geometry;
    if (!route?.geometryUrl) return null;
    try {
      const response = await fetch(route.geometryUrl);
      if (!response.ok) return null;
      return await response.json();
    } catch { return null; }
  },
  getStopsByRoute(id, direction = 'outbound') {
    const route = this.getRoute(id);
    if (!route) return [];
    const directions = route.directions || {};
    const data = direction === 'inbound' ? directions.inbound || directions.regreso : directions.outbound || directions.ida;
    if (route.directions || route.ida || route.regreso) return Array.isArray(data?.stops) ? data.stops : [];
    return Array.isArray(route.stops) ? route.stops : [];
  },
  getStops(routeId = null) {
    return this.getRoutes().filter(route => !routeId || route.id === routeId).flatMap(route => {
      const hasDirections = Boolean(route.directions || route.ida || route.regreso);
      const directions = hasDirections ? ['outbound', 'inbound'] : ['outbound'];
      const unique = new Map();
      directions.forEach(direction => this.getStopsByRoute(route.id, direction).forEach((stop, index) => {
        const coordinates = stopLatLng(stop);
        const key = stop.id || `${coordinates?.join(',') || 'no-coordinates'}:${stop.name || stop.nombre || index}`;
        unique.set(key, { ...stop, routeId: route.id, companyId: route.companyId, routeName: route.name, companyName: route.companyName });
      }));
      return [...unique.values()];
    });
  },
  getNearbyStops(location, radiusMeters = 1000) {
    if (!Number.isFinite(location?.latitude) || !Number.isFinite(location?.longitude)) return [];
    return this.getStops().map(stop => {
      const coordinates = stopLatLng(stop);
      return { ...stop, distanceMeters: coordinates ? distanceBetween(location.latitude, location.longitude, coordinates[0], coordinates[1]) : Infinity };
    })
      .filter(stop => Number.isFinite(stop.distanceMeters) && stop.distanceMeters <= radiusMeters)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  },
  getRealtimeBuses(routeId) {
    if (!SIBUS_CONFIG.realtimeEnabled) return Promise.resolve([]);
    return RealtimeBusService.getActiveBuses().then(buses => buses.map(BusPosition.parse).filter(bus => bus && (!routeId || bus.routeId === routeId)));
  }
};
function stopLatLng(stop) {
  if (!stop) return null;
  const rawLatitude = stop.latitude ?? stop.lat, rawLongitude = stop.longitude ?? stop.lng;
  if (rawLatitude != null && rawLongitude != null && rawLatitude !== '' && rawLongitude !== '') {
    const latitude = Number(rawLatitude), longitude = Number(rawLongitude);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) return [latitude, longitude];
  }
  if (stop.geometry?.type === 'Point' && Array.isArray(stop.geometry.coordinates)) {
    const [lng, lat] = stop.geometry.coordinates;
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
  }
  return null;
}
function distanceBetween(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return Infinity;
  const radians = value => value * Math.PI / 180;
  const dLat = radians(lat2 - lat1), dLon = radians(lon2 - lon1);
  const arc = Math.min(1, Math.max(0, Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2));
  return 6371000 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}
// Plans direct rides from verified route stops; it does not estimate times or invent transfers.
const RoutePlanner = {
  plan({ origin, destination, walkingLimitMeters = 500 } = {}) {
    if (!origin || !destination) return { status: 'missing-input', alternatives: [] };
    if (![origin.latitude, origin.longitude, destination.latitude, destination.longitude].every(Number.isFinite)) {
      return { status: 'insufficient-data', alternatives: [], walkingLimitMeters, reason: 'Resolve origin and destination to coordinates before planning.' };
    }
    const alternatives = [];
    for (const route of DataProvider.getRoutes()) {
      const hasDirections = Boolean(route.directions || route.ida || route.regreso);
      const directionNames = hasDirections
        ? ['outbound', 'inbound'].filter(direction => DataProvider.getStopsByRoute(route.id, direction).length)
        : ['outbound'];
      for (const direction of directionNames) {
        const stops = DataProvider.getStopsByRoute(route.id, direction);
        const originOptions = stops.map((stop, index) => ({ stop, index, coordinates: stopLatLng(stop) })).filter(item => item.coordinates).map(item => ({ ...item, distance: distanceBetween(origin.latitude, origin.longitude, item.coordinates[0], item.coordinates[1]) })).filter(item => item.distance <= walkingLimitMeters);
        const destinationOptions = stops.map((stop, index) => ({ stop, index, coordinates: stopLatLng(stop) })).filter(item => item.coordinates).map(item => ({ ...item, distance: distanceBetween(destination.latitude, destination.longitude, item.coordinates[0], item.coordinates[1]) })).filter(item => item.distance <= walkingLimitMeters);
        for (const start of originOptions) for (const end of destinationOptions) {
          if (end.index <= start.index) continue;
          alternatives.push({ routeId: route.id, routeName: route.name, companyId: route.companyId, companyName: route.companyName, direction, originStop: start.stop, destinationStop: end.stop, walkingToStopMeters: Math.round(start.distance), walkingFromStopMeters: Math.round(end.distance), fare: route.fare ?? null, estimate: true });
        }
      }
    }
    alternatives.sort((a, b) => (a.walkingToStopMeters + a.walkingFromStopMeters) - (b.walkingToStopMeters + b.walkingFromStopMeters));
    return { status: alternatives.length ? 'found' : 'no-route', alternatives: alternatives.slice(0, 10), walkingLimitMeters };
  }
};
const MapRenderer = {
  hasConfiguredProvider() { return Boolean(SIBUS_CONFIG.mapProvider); },
  canRenderRoute(route) { return Boolean((route?.geometry || route?.geometryUrl) && this.hasConfiguredProvider()); },
  status() { return this.hasConfiguredProvider() ? 'Esperando datos de recorrido.' : 'Mapa listo para un proveedor y geometrías verificadas.'; }
};
const StorageService = {
  read(key, fallback = []) { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch { return fallback; } },
  write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
};
const FavoritesService = {
  list() { const rows = StorageService.read('sibus:favorites', []); return Array.isArray(rows) ? rows : []; },
  has(id) { return this.list().some(item => item.id === id); },
  toggle(item) { const all = this.list(); const exists = all.some(saved => saved.id === item.id && saved.type === item.type); return StorageService.write('sibus:favorites', exists ? all.filter(saved => !(saved.id === item.id && saved.type === item.type)) : [item, ...all]); }
};
const HistoryService = {
  list() { const rows = StorageService.read('sibus:history', []); return Array.isArray(rows) ? rows : []; },
  add(item) { const rows = [{ ...item, at: new Date().toISOString() }, ...this.list()].slice(0, 30); StorageService.write('sibus:history', rows); },
  clear() { StorageService.write('sibus:history', []); }
};
const RealtimeBusService = {
  provider: null,
  connect(provider) { if (!SIBUS_CONFIG.realtimeEnabled || !provider) return Promise.resolve(false); this.provider = provider; return provider.connect(); },
  disconnect() { if (this.provider) this.provider.disconnect(); this.provider = null; },
  subscribeToBus(id, callback) { return this.provider?.subscribeToBus(id, callback) || (() => {}); },
  subscribeToRoute(id, callback) { return this.provider?.subscribeToRoute(id, callback) || (() => {}); },
  getActiveBuses() { return this.provider?.getActiveBuses() || Promise.resolve([]); }
};
const BusPosition = {
  parse(value) {
    if (!value || !value.busId || !value.routeId) return null;
    const latitude = Number(value.latitude), longitude = Number(value.longitude), timestamp = Number(value.timestamp);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !Number.isFinite(timestamp)) return null;
    const allowed = ['ACTIVE', 'STOPPED', 'OFFLINE', 'UNKNOWN'];
    return { ...value, latitude, longitude, timestamp, status: allowed.includes(value.status) ? value.status : 'UNKNOWN' };
  }
};
// Contract for future providers: connect, disconnect, subscribeToBus, subscribeToRoute, getActiveBuses.
// Accept positions only after BusPosition.parse; never synthesize fallback coordinates.
