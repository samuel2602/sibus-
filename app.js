// Official AMB company and route catalog is loaded from data/companies.js.
let currentCompany = null;
let currentTab = 'inicio';
let activeRouteId = null;
let activeDirection = 'outbound';
let locationRequested = false;
let lastSearchHistoryValue = '';
let leafletMap = null;
let activeRouteLayer = null;
let activeStopsLayer = null;
let userLocationLayer = null;
let userCoordinates = null;
let mapPointSelectionTarget = null;
const importedRouteGeometry = new Map();
const pendingGeometryLoads = new Set();

window.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    renderCompanyCards();
    updateClock();
    window.setInterval(updateClock, 60000);
    renderQuickFavorites();
    const search = document.getElementById('destination-search');
    ['trip-origin', 'trip-destination'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', event => {
            delete event.currentTarget.dataset.latitude;
            delete event.currentTarget.dataset.longitude;
        });
    });
    let searchTimer;
    search?.addEventListener('input', () => {
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(() => {
            renderSearchResults(search.value);
            const term = search.value.trim();
            if (term && term !== lastSearchHistoryValue) { HistoryService.add({ type: 'search', label: `Busqueda: ${term}` }); lastSearchHistoryValue = term; }
        }, 600);
    });
});

function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function normalizeSearch(value) {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
}

function renderCompanyCards() {
    const grid = document.getElementById('companies-grid');
    if (!grid) return;
    grid.innerHTML = DataProvider.getCompanies().map(comp => `
        <button type="button" class="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100 flex flex-col justify-between hover:shadow-md transition text-left" onclick="openCompanyDetail('${escapeHTML(comp.id)}')" aria-label="Ver empresa ${escapeHTML(comp.name)}">
            <div class="relative h-24 overflow-hidden flex items-center justify-center bg-slate-50 text-sibus-blue">
                ${comp.image ? `<img src="${escapeHTML(comp.image)}" class="h-full w-full object-cover" alt="Bus de ${escapeHTML(comp.name)}" loading="lazy">` : '<i data-lucide="bus-front" class="h-10 w-10"></i>'}
                <span class="absolute top-2 right-2 bg-sibus-darkBlue text-white text-[9px] px-2 py-0.5 rounded-full font-bold">${comp.routes.length} códigos AMB</span>
            </div>
            <div class="p-3 text-center flex flex-col items-center justify-between flex-1 w-full bg-white">
                <span class="py-1 text-sibus-darkBlue text-sm font-bold">${escapeHTML(comp.name)}</span>
                <span class="mt-2 w-full py-1.5 px-3 rounded-full text-white text-xs font-bold bg-sibus-blue">Ver rutas &rarr;</span>
            </div>
        </button>`).join('');
    lucide.createIcons();
}

function openCompanyDetail(companyId) {
    currentCompany = SIBUS_DATA.find(company => company.id === companyId);
    if (!currentCompany) return;
    activeRouteId = null;
    activeRouteLayer?.clearLayers();
    activeStopsLayer?.clearLayers();
    document.getElementById('route-map-card')?.classList.add('hidden');
    const bannerImage = document.getElementById('company-banner-bg');
    bannerImage.src = currentCompany.image || '';
    bannerImage.alt = currentCompany.image ? `Imagen de ${currentCompany.name}` : '';
    bannerImage.classList.toggle('hidden', !currentCompany.image);
    document.getElementById('company-banner-logo').innerHTML = currentCompany.logoSvg;
    document.getElementById('company-detail-subtitle').textContent = `Códigos publicados por el AMB para ${currentCompany.name}. Su vigencia y recorrido requieren confirmación.`;
    const leftBtn = document.getElementById('header-left-btn');
    leftBtn.setAttribute('aria-label', 'Volver al inicio');
    leftBtn.innerHTML = '<i data-lucide="chevron-left" class="w-7 h-7"></i>';
    leftBtn.onclick = goHome;
    document.getElementById('routes-list').innerHTML = currentCompany.routes.map(route => `
        <article class="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-sm">
            <div class="flex items-center justify-between gap-3">
                <button type="button" class="flex min-w-0 flex-1 items-center gap-3 text-left" onclick="selectRoute('${escapeHTML(route.id)}','${escapeHTML(route.name)}')">
                    <div class="w-16 h-14 rounded-xl shrink-0 bg-slate-50 text-sibus-blue flex items-center justify-center"><i data-lucide="route" class="h-6 w-6"></i></div>
                    <span class="min-w-0"><span class="block font-bold text-slate-800 text-sm">${escapeHTML(route.name)}</span><span class="block text-[11px] text-slate-500 mt-0.5">${escapeHTML(route.detail)}</span><span class="block mt-1 text-[10px] text-amber-700">${escapeHTML(route.status)}</span></span>
                </button>
                <button type="button" onclick="toggleFavorite('${escapeHTML(route.id)}')" class="shrink-0 rounded-xl p-2 text-yellow-600" aria-label="${FavoritesService.has(route.id) ? 'Quitar de' : 'Agregar a'} favoritos"><i data-lucide="star" class="w-5 h-5 ${FavoritesService.has(route.id) ? 'fill-yellow-400' : ''}"></i></button>
            </div>
        </article>`).join('');
    hideViews();
    document.getElementById('view-company-detail').classList.remove('hidden');
    lucide.createIcons();
}

function hideViews() {
    ['home','company-detail','map','favoritos','perfil','historial'].forEach(name => document.getElementById(`view-${name}`)?.classList.add('hidden'));
}

function goHome() {
    currentCompany = null;
    const leftBtn = document.getElementById('header-left-btn');
    leftBtn.setAttribute('aria-label', 'Abrir menú');
    leftBtn.innerHTML = '<i data-lucide="menu" class="w-6 h-6"></i>';
    leftBtn.onclick = toggleSideMenu;
    hideViews();
    document.getElementById('view-home').classList.remove('hidden');
    updateNavHighlight('inicio');
    lucide.createIcons();
}

function switchTab(tab) {
    currentTab = tab;
    updateNavHighlight(tab);
    hideViews();
    if (tab === 'inicio') return goHome();
    if (tab === 'mapa' || tab === 'rutas') {
        document.getElementById('view-map').classList.remove('hidden');
        initializeMap();
        if (activeRouteId) renderRouteOnMap(activeRouteId);
    }
    if (tab === 'favoritos') { renderFavoritesView(); document.getElementById('view-favoritos').classList.remove('hidden'); }
    if (tab === 'perfil') document.getElementById('view-perfil').classList.remove('hidden');
    if (tab === 'historial') { renderHistory(); document.getElementById('view-historial').classList.remove('hidden'); }
    lucide.createIcons();
}

function updateNavHighlight(activeTab) {
    ['inicio','mapa','rutas','favoritos','historial'].forEach(tab => {
        const button = document.getElementById(`nav-${tab}`);
        if (button) button.className = `flex flex-col items-center transition ${tab === activeTab ? 'text-sibus-blue active-tab' : 'text-slate-400 hover:text-sibus-blue'}`;
    });
}

function selectRoute(routeId, routeName) {
    activeRouteId = routeId;
    activeDirection = 'outbound';
    const route = findRoute(routeId);
    if (route) HistoryService.add({ type: 'route', id: route.id, label: routeName });
    document.getElementById('active-route-title').textContent = `Ruta seleccionada: ${routeName}`;
    switchTab('mapa');
}

function findRoute(routeId) {
    for (const company of SIBUS_DATA) {
        const route = company.routes.find(item => item.id === routeId);
        if (route) return { ...route, companyName: company.name, companyId: company.id };
    }
    return null;
}

function initializeMap() {
    const status = document.getElementById('map-status');
    if (!window.L) {
        if (status) status.textContent = 'No se pudo cargar Leaflet. Revisa la conexión e inténtalo de nuevo.';
        return;
    }
    if (!leafletMap) {
        leafletMap = L.map('leaflet-map', { zoomControl: false, preferCanvas: true }).setView([10.9639, -74.7964], 12);
        L.tileLayer(SIBUS_CONFIG.tileUrl, {
            maxZoom: 19,
            attribution: SIBUS_CONFIG.mapAttribution
        }).addTo(leafletMap).on('tileerror', () => {
            if (status) status.textContent = 'No se pudieron cargar algunas teselas del mapa. Comprueba tu conexión.';
        });
        L.control.zoom({ position: 'bottomright' }).addTo(leafletMap);
        leafletMap.on('click', event => {
            if (!mapPointSelectionTarget) return;
            const input = document.getElementById(mapPointSelectionTarget === 'origin' ? 'trip-origin' : 'trip-destination');
            input.value = `${event.latlng.lat.toFixed(5)}, ${event.latlng.lng.toFixed(5)}`;
            input.dataset.latitude = event.latlng.lat;
            input.dataset.longitude = event.latlng.lng;
            mapPointSelectionTarget = null;
            const mapStatus = document.getElementById('map-status');
            if (mapStatus) mapStatus.textContent = 'Punto seleccionado. Regresa a Inicio para buscar.';
        });
        activeRouteLayer = L.featureGroup().addTo(leafletMap);
        activeStopsLayer = L.layerGroup().addTo(leafletMap);
        window.setTimeout(() => leafletMap?.invalidateSize(), 120);
    } else {
        window.setTimeout(() => leafletMap?.invalidateSize(), 120);
    }
    if (userCoordinates) {
        renderUserLocation();
        leafletMap.setView(userCoordinates, 15);
    }
    const route = activeRouteId ? findRoute(activeRouteId) : null;
    if (status) status.textContent = route ? 'Mapa de Barranquilla · recorrido seleccionado' : 'Mapa de Barranquilla · selecciona una empresa y una ruta';
}

function routeDirectionData(route, direction = activeDirection) {
    const directions = route?.directions || {};
    return direction === 'inbound'
        ? directions.inbound || directions.regreso || null
        : directions.outbound || directions.ida || null;
}

function geometryForRoute(route, direction = activeDirection) {
    const directionData = routeDirectionData(route, direction);
    if (route?.directions || route?.ida || route?.regreso) return directionData?.geometry || null;
    return route?.geometry || null;
}

function routeStops(route, direction = activeDirection) {
    const directionData = routeDirectionData(route, direction);
    if (route?.directions || route?.ida || route?.regreso) return directionData?.stops || [];
    return route?.stops || [];
}

function stopCoordinates(stop) {
    if (stop.latitude != null && stop.longitude != null && stop.latitude !== '' && stop.longitude !== '' && Number.isFinite(Number(stop.latitude)) && Number.isFinite(Number(stop.longitude))) return [Number(stop.latitude), Number(stop.longitude)];
    if (stop.lat != null && stop.lng != null && stop.lat !== '' && stop.lng !== '' && Number.isFinite(Number(stop.lat)) && Number.isFinite(Number(stop.lng))) return [Number(stop.lat), Number(stop.lng)];
    if (stop.geometry?.type === 'Point' && Array.isArray(stop.geometry.coordinates)) return [stop.geometry.coordinates[1], stop.geometry.coordinates[0]];
    return null;
}

function renderRouteOnMap(routeId) {
    if (!leafletMap || !window.L) return;
    const route = findRoute(routeId);
    const card = document.getElementById('route-map-card');
    const status = document.getElementById('map-status');
    if (!route || !card) return;
    if (importedRouteGeometry.has(route.id)) route.geometry = importedRouteGeometry.get(route.id);
    if (!route.geometry && route.geometryUrl && !pendingGeometryLoads.has(route.id)) {
        pendingGeometryLoads.add(route.id);
        fetch(route.geometryUrl).then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        }).then(geojson => {
            importedRouteGeometry.set(route.id, geojson);
            if (activeRouteId === route.id) renderRouteOnMap(route.id);
        }).catch(() => {}).finally(() => pendingGeometryLoads.delete(route.id));
    }
    activeRouteLayer.clearLayers();
    activeStopsLayer.clearLayers();
    const geometry = geometryForRoute(route);
    const declaredStops = routeStops(route);
    const stops = declaredStops.length ? declaredStops : (geometry?.type === 'FeatureCollection' ? geometry.features
        .filter(feature => feature.geometry?.type === 'Point')
        .map((feature, index) => ({
            id: `${route.id}-stop-${index + 1}`,
            name: feature.properties?.name || feature.properties?.Name || `Parada ${index + 1}`,
            geometry: feature.geometry,
            order: index + 1,
            source: feature.properties?.source || route.source,
            sourceDate: feature.properties?.sourceDate || route.sourceDate
        })) : []);
    const directionData = routeDirectionData(route);
    const geometryMetadata = geometry?.features?.find(feature => feature.properties?.source || feature.properties?.sourceDate)?.properties || {};
    const geometrySourceDate = geometryMetadata.sourceDate || route.sourceDate || null;
    const geometrySourceUrl = geometryMetadata.source || route.source;
    let hasGeometry = false;
    if (geometry) {
        try {
            const routeGeometry = geometry.type === 'FeatureCollection'
                ? { ...geometry, features: geometry.features.filter(feature => feature.geometry?.type !== 'Point') }
                : geometry;
            const layer = routeGeometry.type ? L.geoJSON(routeGeometry, { style: { color: route.color || '#0B3878', weight: 5, opacity: 0.9 } })
                : Array.isArray(geometry) ? L.polyline(geometry, { color: route.color || '#0B3878', weight: 5, opacity: 0.9 }) : null;
            if (layer) {
                activeRouteLayer.addLayer(layer);
                const layerBounds = layer.getBounds?.();
                hasGeometry = !layerBounds || layerBounds.isValid();
                if (!hasGeometry) activeRouteLayer.clearLayers();
            }
        } catch (error) {
            console.warn('Invalid route geometry', error);
        }
    }
    const directions = route.directions || {};
    const hasBothDirections = Boolean((directions.outbound || directions.ida) && (directions.inbound || directions.regreso));
    const stopRows = stops.map((stop, index) => {
        const coordinates = stopCoordinates(stop);
        if (coordinates && coordinates.every(Number.isFinite)) {
            const marker = L.marker(coordinates, { icon: L.divIcon({ className: 'sibus-stop-icon', html: '<span></span>', iconSize: [16, 16], iconAnchor: [8, 8] }) });
            const distance = userCoordinates ? distanceInMeters(userCoordinates, coordinates) : null;
            const details = [route.name, route.companyName, stop.address || stop.direccion, distance === null ? '' : `${formatDistance(distance)} desde tu ubicación`].filter(Boolean);
            marker.bindPopup(`<strong>${escapeHTML(stop.name || stop.nombre || `Parada ${index + 1}`)}</strong><br>${details.map(escapeHTML).join('<br>')}`);
            activeStopsLayer.addLayer(marker);
            return { ...stop, coordinates, distance };
        }
        return { ...stop, coordinates: null, distance: null };
    });
    if (hasGeometry) {
        const bounds = activeRouteLayer.getBounds();
        if (bounds.isValid()) leafletMap.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 });
    } else if (stopRows.some(stop => stop.coordinates)) {
        const bounds = L.latLngBounds(stopRows.filter(stop => stop.coordinates).map(stop => stop.coordinates));
        if (bounds.isValid()) leafletMap.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 });
    }
    if (status) status.textContent = hasGeometry ? `Recorrido de ${route.name}` : `Ruta sin geometría: ${route.name}`;
    card.classList.remove('hidden');
    card.innerHTML = `
        <div class="flex items-start justify-between gap-2">
            <div class="min-w-0"><p class="text-[10px] font-bold uppercase tracking-wide text-sibus-blue">${escapeHTML(route.companyName)}</p><h2 class="truncate text-sm font-extrabold text-slate-900">${escapeHTML(route.name)}</h2></div>
            <button type="button" onclick="toggleFavorite('${escapeHTML(route.id)}')" class="rounded-lg p-1 text-yellow-600" aria-label="Guardar ruta favorita"><i data-lucide="star" class="h-5 w-5 ${FavoritesService.has(route.id) ? 'fill-yellow-400' : ''}"></i></button>
        </div>
        ${hasBothDirections ? `<div class="mt-2 flex gap-2"><button onclick="setRouteDirection('outbound')" class="rounded-lg px-3 py-1 text-xs ${activeDirection === 'outbound' ? 'bg-sibus-blue text-white' : 'bg-slate-100 text-slate-700'}">Ida</button><button onclick="setRouteDirection('inbound')" class="rounded-lg px-3 py-1 text-xs ${activeDirection === 'inbound' ? 'bg-sibus-blue text-white' : 'bg-slate-100 text-slate-700'}">Regreso</button></div>` : ''}
        <p class="mt-2 text-[11px] text-slate-600">${escapeHTML(directionData?.name || route.detail || 'Información de recorrido pendiente')}</p>
        <p class="mt-1 text-[10px] text-slate-600">Origen: ${escapeHTML(route.origin || 'No disponible')} · Destino: ${escapeHTML(route.destination || 'No disponible')}</p>
        <p class="mt-1 text-[10px] ${hasGeometry ? 'text-emerald-700' : 'text-amber-800'}">${hasGeometry ? 'Recorrido cargado' : 'Información de ruta pendiente de actualización.'} · ${stopRows.length ? `${stopRows.length} paradas` : 'Paradas no disponibles'}</p>
        ${stopRows.length ? `<div class="mt-2 max-h-20 space-y-1 overflow-auto border-t pt-2">${stopRows.map((stop, index) => `<button class="block w-full truncate text-left text-[10px] text-slate-700" ${stop.coordinates ? `onclick="focusStop(${stop.coordinates[0]},${stop.coordinates[1]})"` : 'disabled'}>${index + 1}. ${escapeHTML(stop.name || stop.nombre || `Parada ${index + 1}`)}${stop.distance === null ? '' : ` · ${formatDistance(stop.distance)}`}</button>`).join('')}</div>` : ''}
        <p class="mt-1 text-[10px] text-slate-500">${escapeHTML(route.fare || 'Tarifa no disponible')} · ${escapeHTML(route.schedule || 'Horarios no disponibles')} · Tiempo real no disponible</p>
        <p class="mt-1 text-[10px] text-slate-500"><a class="font-semibold text-sibus-blue underline" href="${escapeHTML(geometrySourceUrl)}" target="_blank" rel="noopener noreferrer">Fuente KMZ del AMB</a> · fecha fuente ${escapeHTML(geometrySourceDate || 'no indicada')} · consulta ${escapeHTML(route.lastVerified || 'sin fecha')} · vigencia por confirmar</p>`;
    lucide.createIcons();
}

function setRouteDirection(direction) {
    activeDirection = direction;
    if (activeRouteId) renderRouteOnMap(activeRouteId);
}
function focusStop(latitude, longitude) { leafletMap?.setView([latitude, longitude], 16); }
function chooseMapPoint(target) {
    mapPointSelectionTarget = target;
    switchTab('mapa');
    const status = document.getElementById('map-status');
    if (status) status.textContent = `Toca el mapa para elegir ${target === 'origin' ? 'el origen' : 'el destino'}.`;
}
function distanceInMeters(a, b) {
    const radians = value => value * Math.PI / 180;
    const dLat = radians(b[0] - a[0]), dLng = radians(b[1] - a[1]);
    const h = Math.min(1, Math.max(0, Math.sin(dLat / 2) ** 2 + Math.cos(radians(a[0])) * Math.cos(radians(b[0])) * Math.sin(dLng / 2) ** 2));
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function formatDistance(meters) { return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`; }
function renderUserLocation() {
    if (!leafletMap || !userCoordinates) return;
    if (userLocationLayer) userLocationLayer.remove();
    userLocationLayer = L.circleMarker(userCoordinates, { radius: 8, color: '#fff', weight: 3, fillColor: '#0B3878', fillOpacity: 1 }).addTo(leafletMap).bindPopup('Mi ubicación');
}

function renderSearchResults(query) {
    const target = document.getElementById('search-results');
    if (!target) return;
    const value = normalizeSearch(query);
    if (!value) { target.innerHTML = ''; return; }
    const results = [];
    SIBUS_DATA.forEach(company => {
        if (normalizeSearch(company.name).includes(value) || normalizeSearch(company.fullName).includes(value)) results.push({ type: 'company', company });
        company.routes.forEach(route => {
            if (normalizeSearch(`${route.name} ${route.officialCode} ${route.detail} ${route.id}`).includes(value)) results.push({ type: 'route', company, route });
            routeStops(route, 'outbound').forEach((stop, index) => {
                const label = stop.name || stop.nombre || `Parada ${index + 1}`;
                if (normalizeSearch(label).includes(value)) results.push({ type: 'stop', company, route, stop, label });
            });
        });
    });
    target.innerHTML = results.length ? results.slice(0, 8).map(result => result.type === 'company'
        ? `<button class="w-full rounded-xl border border-slate-100 p-3 text-left" onclick="openCompanyDetail('${escapeHTML(result.company.id)}')"><span class="block text-xs font-bold text-sibus-darkBlue">Empresa &middot; ${escapeHTML(result.company.name)}</span><span class="text-[10px] text-slate-500">${result.company.routes.length} rutas en el cat&aacute;logo</span></button>`
        : result.type === 'stop'
            ? `<button class="w-full rounded-xl border border-slate-100 p-3 text-left" onclick="selectRoute('${escapeHTML(result.route.id)}','${escapeHTML(result.route.name)}'); focusNamedStop('${escapeHTML(result.stop.id || result.label)}')"><span class="block text-xs font-bold text-sibus-darkBlue">Parada &middot; ${escapeHTML(result.label)}</span><span class="text-[10px] text-slate-500">${escapeHTML(result.company.name)} &middot; ${escapeHTML(result.route.name)}</span></button>`
            : `<button class="w-full rounded-xl border border-slate-100 p-3 text-left" onclick="selectRoute('${escapeHTML(result.route.id)}','${escapeHTML(result.route.name)}')"><span class="block text-xs font-bold text-sibus-darkBlue">${escapeHTML(result.route.name)}</span><span class="text-[10px] text-slate-500">${escapeHTML(result.company.name)} &middot; ${escapeHTML(result.route.detail)}</span></button>`).join('')
        : '<p class="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">No hay coincidencias en el cat&aacute;logo disponible.</p>';
}

function searchTrips() {
    const originInput = document.getElementById('trip-origin');
    const destinationInput = document.getElementById('trip-destination');
    const origin = originInput.value.trim();
    const destination = destinationInput.value.trim();
    if (!origin || !destination) {
        document.getElementById('search-results').innerHTML = '<p class="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Indica un origen y un destino para buscar coincidencias en el cat&aacute;logo.</p>';
        return;
    }
    HistoryService.add({ type: 'trip', label: `${origin} to ${destination}` });
    const originCoordinates = [originInput.dataset.latitude, originInput.dataset.longitude].map(Number);
    const destinationCoordinates = [destinationInput.dataset.latitude, destinationInput.dataset.longitude].map(Number);
    if (originCoordinates.every(Number.isFinite) && destinationCoordinates.every(Number.isFinite)) {
        const plan = RoutePlanner.plan({
            origin: { latitude: originCoordinates[0], longitude: originCoordinates[1] },
            destination: { latitude: destinationCoordinates[0], longitude: destinationCoordinates[1] },
            walkingLimitMeters: Number(document.getElementById('walking-limit').value)
        });
        const results = document.getElementById('search-results');
        if (!plan.alternatives.length) {
            results.innerHTML = '<p class="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">No encontramos una ruta directa con los paraderos y sentidos cargados. Puede faltar información de recorridos o requerirse un transbordo.</p>';
            return;
        }
        results.innerHTML = plan.alternatives.map(option => `<button class="w-full rounded-xl border border-slate-100 bg-white p-3 text-left" onclick="selectRoute('${escapeHTML(option.routeId)}','${escapeHTML(option.routeName)}')"><span class="block text-xs font-bold">${escapeHTML(option.routeName)} · ${escapeHTML(option.companyName)}</span><span class="text-[10px] text-slate-500">Estimación por paraderos · caminar ${option.walkingToStopMeters} m y ${option.walkingFromStopMeters} m · tarifa ${option.fare == null ? 'no disponible' : escapeHTML(option.fare)}</span></button>`).join('');
        return;
    }
    const matches = [];
    SIBUS_DATA.forEach(company => company.routes.forEach(route => {
        const text = `${route.name} ${route.detail}`.toLocaleLowerCase('es');
        if (text.includes(origin.toLocaleLowerCase('es')) && text.includes(destination.toLocaleLowerCase('es'))) matches.push({ company, route });
    }));
    const walkingLimit = document.getElementById('walking-limit').value;
    document.getElementById('search-results').innerHTML = `<p class="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">${matches.length ? `${matches.length} coincidencia(s) de texto; no es una ruta calculada. Faltan paraderos, geometr&iacute;as y distancias verificadas. Preferencia de caminata: ${walkingLimit} m.` : 'No hay coincidencias verificables para este origen y destino. Faltan datos de recorridos para calcular alternativas.'}</p>` + matches.slice(0, 5).map(({company, route}) => `<button class="w-full rounded-xl border border-slate-100 p-3 text-left" onclick="selectRoute('${escapeHTML(route.id)}','${escapeHTML(route.name)}')"><span class="block text-xs font-bold">${escapeHTML(route.name)}</span><span class="text-[10px] text-slate-500">${escapeHTML(company.name)} &middot; ${escapeHTML(route.detail)}</span></button>`).join('');
}

function requestLocation() {
    const status = document.getElementById('location-status');
    const mapStatus = document.getElementById('map-status');
    if (!navigator.geolocation) {
        status.textContent = 'Este navegador no permite obtener la ubicacion.';
        if (mapStatus) mapStatus.textContent = status.textContent;
        return;
    }
    if (locationRequested) return;
    locationRequested = true;
    status.textContent = 'Solicitando permiso de ubicacion...';
    if (mapStatus) mapStatus.textContent = status.textContent;
    navigator.geolocation.getCurrentPosition(position => {
        const { latitude, longitude } = position.coords;
        document.getElementById('trip-origin').value = 'Mi ubicacion';
        document.getElementById('trip-origin').dataset.latitude = latitude;
        document.getElementById('trip-origin').dataset.longitude = longitude;
        userCoordinates = [latitude, longitude];
        status.textContent = `Ubicacion recibida (${latitude.toFixed(4)}, ${longitude.toFixed(4)}).`;
        if (mapStatus) mapStatus.textContent = leafletMap ? 'Mi ubicacion visible en el mapa' : 'Ubicacion guardada en esta sesion. Abre Mapa para verla.';
        if (leafletMap) {
            renderUserLocation();
            leafletMap.setView(userCoordinates, 15);
            if (activeRouteId) renderRouteOnMap(activeRouteId);
        }
    }, error => {
        const messages = { 1: 'Permiso de ubicacion rechazado.', 2: 'Ubicacion no disponible.', 3: 'Se agoto el tiempo para obtener la ubicacion.' };
        status.textContent = messages[error.code] || 'No se pudo obtener la ubicacion.';
        if (mapStatus) mapStatus.textContent = status.textContent;
        locationRequested = false;
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
}
function useCurrentLocation() { requestLocation(); }
function recenterMap() {
    if (userCoordinates && leafletMap) { leafletMap.setView(userCoordinates, 15); return; }
    requestLocation();
}
function focusNamedStop(id) {
    const route = activeRouteId ? findRoute(activeRouteId) : null;
    const stop = routeStops(route || {}, activeDirection).find((item, index) => String(item.id || item.name || item.nombre || `Parada ${index + 1}`) === String(id));
    const coordinates = stop && stopCoordinates(stop);
    if (coordinates) focusStop(...coordinates);
}

function toggleFavorite(routeId) {
    const route = findRoute(routeId);
    if (!route) return;
    FavoritesService.toggle({ type: 'route', id: route.id, label: route.name, companyName: route.companyName, detail: route.detail });
    if (currentCompany && !document.getElementById('view-company-detail').classList.contains('hidden')) openCompanyDetail(currentCompany.id);
    else if (activeRouteId === routeId && leafletMap) renderRouteOnMap(routeId);
    renderQuickFavorites();
}
function renderQuickFavorites() {
    const host = document.getElementById('quick-favorites');
    const entries = FavoritesService.list().slice(0, 3);
    if (host) host.innerHTML = entries.length ? `<h2 class="text-sm font-bold text-sibus-darkBlue">Tus favoritos</h2>${entries.map(item => `<button class="mr-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold" onclick="selectRoute('${escapeHTML(item.id)}','${escapeHTML(item.label)}')">&#9733; ${escapeHTML(item.label)}</button>`).join('')}` : '';
}
function renderFavoritesView() {
    const container = document.getElementById('favorites-container');
    const favorites = FavoritesService.list();
    container.innerHTML = favorites.length ? favorites.map(item => `<article class="bg-white rounded-2xl p-3.5 border shadow-sm flex justify-between items-center"><button class="min-w-0 flex-1 text-left" onclick="selectRoute('${escapeHTML(item.id)}','${escapeHTML(item.label)}')"><p class="text-xs font-bold text-sibus-blue">${escapeHTML(item.companyName || 'SIBUS-M')}</p><h3 class="font-bold text-slate-800 text-sm">${escapeHTML(item.label)}</h3><p class="text-[11px] text-slate-500">${escapeHTML(item.detail || '')}</p></button><button class="p-2 text-slate-500" onclick="toggleFavorite('${escapeHTML(item.id)}')" aria-label="Quitar favorito">&times;</button></article>`).join('') : '<p class="text-xs text-slate-500 text-center py-8">A&uacute;n no tienes favoritos. Guarda una ruta desde su ficha.</p>';
}
function renderHistory() {
    const host = document.getElementById('history-container');
    const rows = HistoryService.list();
    host.innerHTML = rows.length ? rows.map(item => `<div class="rounded-xl border border-slate-100 bg-white p-3"><p class="text-xs font-semibold text-slate-800">${escapeHTML(item.label)}</p><p class="mt-1 text-[10px] text-slate-500">${new Date(item.at).toLocaleString('es-CO')}</p></div>`).join('') : '<p class="py-8 text-center text-xs text-slate-500">No hay b&uacute;squedas recientes.</p>';
}
function clearHistory() { HistoryService.clear(); renderHistory(); }

function toggleSideMenu() {
    const drawer = document.getElementById('side-drawer');
    const content = document.getElementById('drawer-content');
    const opening = drawer.classList.contains('pointer-events-none');
    drawer.classList.toggle('pointer-events-none', !opening);
    drawer.classList.toggle('opacity-0', !opening);
    drawer.classList.toggle('opacity-100', opening);
    content.classList.toggle('-translate-x-full', !opening);
}
function showTarifas() { alert('La tarifa mostrada en esta maqueta requiere confirmaci&oacute;n con la informaci&oacute;n oficial vigente.'); }
function updateClock() {
    const timeElem = document.getElementById('time-display');
    if (timeElem) timeElem.textContent = new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit' }).format(new Date());
}

