# SIBUS-M: datos e integraciones

Aplicación frontend en HTML, CSS y JavaScript. Se conserva la estructura existente y no se agregan dependencias de compilación.

## Catálogo de empresas y rutas

La fuente del catálogo de empresas y códigos está en `data/companies.js`. Contiene 23 empresas y códigos del [visor de transporte público colectivo del AMB](https://www.ambq.gov.co/transporte/transporte-publico-colectivo/). Un código publicado no demuestra por sí mismo que la ruta siga operando: cada registro lleva `dataStatus: needs-verification`, fuente del índice y `lastVerified`. El archivo GeoJSON asociado conserva la URL KMZ y `sourceDate`. La fecha `lastVerified` corresponde a la comprobación del índice, no a una confirmación de vigencia del servicio.

No se reutilizan los recorridos descriptivos de muestra del catálogo anterior. Origen, destino, horario, tarifa y paradas quedan pendientes hasta cargar fuentes verificables. Las imágenes locales disponibles en `imagenes/` se asignan solo a las empresas identificables en cada foto; las demás conservan un icono neutral. No se presentan estas fotos como logos oficiales.

Para agregar una empresa, añade su registro a `data/companies.js` y una entrada a `AMB_ROUTE_INDEX` solo si aparece en fuente oficial. Para agregar un código, añádelo en la cadena de esa empresa; el modelo genera un ID estable y metadatos de fuente. Mantén los códigos únicos dentro de cada empresa.

## Paraderos y recorridos

Los 93 códigos del visor coinciden con KMZ publicados en los directorios del AMB. Se descargaron y convirtieron a GeoJSON los 93 archivos; sus índices muestran fecha de modificación 2026-05-20. Todos están marcados `needs-verification`: la fecha del archivo no confirma que el servicio siga vigente. Los archivos contienen geometrías de recorrido, pero no puntos de paradero; por eso origen, destino y paradas quedan vacíos. Modelo de paradero para futuros datos oficiales: `{id, routeId, name, latitude, longitude, order, source, sourceDate}`. GeoJSON usa el orden `[longitud, latitud]`.

### Importar un KMZ o KML oficial

El conversor `tools/kmz_to_geojson.py` utiliza únicamente la biblioteca estándar de Python. Desde la raíz del proyecto ejecuta:

```powershell
python tools/kmz_to_geojson.py .\ruta-oficial.kmz `
  --company-id la-carolina `
  --route-id la-carolina-d6-4150 `
  --route-code D6-4150 `
  --source https://www.ambq.gov.co/ruta-de-buses/LA-CAROLINA/ `
  --source-date 2026-05-20
```

El resultado se guarda en `data/routes/<company-id>/<route-id>.geojson`, que coincide con el `geometryUrl` del catálogo. También admite `.kml`, varias entradas en una misma importación, y `--output` para elegir otra ubicación. Usa `--status pilot` para un archivo de recorrido piloto y deja `needs-verification` por defecto. Verifica el contenido y la fecha de la fuente antes de marcar una ruta vigente. Si el KML tiene puntos de parada, se conservan como Features GeoJSON; la interfaz muestra la geometría importada y los datos de paradas solo cuando están modelados en el catálogo.

Para sincronizar todos los KMZ cuyo nombre coincida con el índice local, ejecuta `python tools/sync_amb_kmz.py`. El script revisa directorios actuales e históricos del AMB, conserva cada KMZ bajo `data/routes/<company-id>/` y genera su GeoJSON vinculado. Si un código no tiene una coincidencia exacta, se informa sin crear un archivo aproximado.

Para añadir paradas, agrega objetos con ID, nombre, orden, coordenadas y los metadatos de fuente en `stops` de la ruta en `data/companies.js`. Para procesar un recorrido actualizado, vuelve a generar su mismo GeoJSON y conserva el vínculo a la fuente y fecha nueva.

Al cargar geometría, `geometry` puede estar en la ruta o por sentido dentro de `directions.outbound` y `directions.inbound` (también `ida` y `regreso`). Los paraderos pueden estar en `stops` de la ruta o del sentido. El mapa ajustará el encuadre al recorrido y mostrará los marcadores disponibles.

## Mapa

La vista interactiva usa Leaflet 1.9.4 y el fondo raster estándar de OpenStreetMap. La URL de teselas y atribución están en `SIBUS_CONFIG` dentro de `services.js`. Mantén visible la atribución. La capa pública de teselas OSM es de mejor esfuerzo y está sujeta a [su política de uso](https://operations.osmfoundation.org/policies/tiles/); antes de escalar el servicio, considera un proveedor de teselas alojado o infraestructura propia.

El mapa inicia centrado en Barranquilla y permite zoom y desplazamiento. Al seleccionar una empresa se limpia la selección anterior; al elegir una ruta se dibuja solo su GeoJSON y se ajusta el mapa. Sin archivo importado, muestra el mapa base y avisa que el trazado está pendiente.

Desde Inicio, el usuario puede elegir origen y destino tocando el mapa. Con coordenadas y paraderos ordenados de una ruta, `RoutePlanner.plan` busca opciones directas y limita la caminata según la preferencia seleccionada. Aún no hay geocodificación de direcciones ni planificación de transbordos, y no se calculan tiempos de viaje.

## GPS y API

`services.js` contiene `SIBUS_CONFIG`, `DataProvider`, `RoutePlanner`, `MapRenderer`, servicios de almacenamiento local y el contrato `RealtimeBusService`. El tiempo real permanece desactivado. Un proveedor futuro debe implementar `connect`, `disconnect`, `subscribeToBus`, `subscribeToRoute` y `getActiveBuses`.

Modelo sugerido para una posición: `{busId, routeId, latitude, longitude, speed, heading, timestamp, status}`. `BusPosition.parse` valida coordenadas y marca temporal y admite los estados `ACTIVE`, `STOPPED`, `OFFLINE` y `UNKNOWN`. No describas como tiempo real una posición ausente o vencida. No guardes secretos en el frontend.

Favoritos e historial usan `localStorage`. Al agregar backend o autenticación, reemplaza los adaptadores de servicio conservando sus interfaces.
