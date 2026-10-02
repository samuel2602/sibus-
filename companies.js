// Companies and route identifiers transcribed from the AMB public collective-transport route index.
// The index establishes a published code, not current operation or complete geometry.
const AMB_ROUTE_INDEX = Object.freeze({
  'flota-angulo': 'A7-4112',
  'transmecar': 'C17-4160|D10-4172|D11-4153|D9-4152',
  'flota-roja': 'A8-4113',
  'transdiaz': 'A10-4114 A|A10-4114 B|A11-4115|B16-4130',
  'cootrab': 'C5-4135|C6-4137',
  'embusa': 'B9-4125',
  'monterrey': 'B11-4166|B12-4127|B8-4124|B11-B-4192',
  'la-carolina': 'A16-4161 A|A16-4161 B|D6-4150|D7-4151',
  'cootransporcar': 'C8-4139',
  'coochofal': 'A15-4159|C2-4133|C2-B-4187|C3-4134|C4-4135|C9-4140|C18-4141|D20-4185',
  'trasalfa': 'D15-4157|D14-4156|B2-B-4118',
  'coolitoral': 'A1-4106 A|A1-4106 B|A2-4107|A3-4108|A4-4109|B1-4117|B2A-4177|B3-4119|B17-4163|C19-4178|PT1-4101|PT2-4102|PT3-4103|PT4-4104|PT5-4105',
  'cootrántico': 'A18-4183|B4-4120|B5-4121|B5-B-4190|B6-4122|B7-4123|B20-4180|B20-B-4191',
  'transportes-lolaya': 'B10-4126|B10-B-4193|D8-4165',
  'cootransco': 'C7-4138',
  'cootrasol': 'D3-4147|D4-4148|D5-4149',
  'sobusa': 'B18-4175 A|B18-4175 B|C11-4168|C12-4169 A|C12-4169 B|C13-4143|C14-4170|C16-4167 A|C16-4167 B',
  'transoledad': 'D13-4155',
  'transurbar': 'A14-4116|D19-4184|D16-4173',
  'sodetrans': 'B13-4128|B13-B-4189|B14-4174|B15-4129 A|B15-4129 B|C21-4182 A|C21-4182 B',
  'cootransnorte': 'A6-4111|A5-4110',
  'trasalianco': 'B19-4176|D18-4179|D12-4154|D17-4158',
  'cooasatlán': 'C1-4132|C1-B-4186|C20-4181|C20-B-4187'
});

const COMPANY_IMAGES = Object.freeze({
  'cooasatlán': 'imagenes/cooasoatlan.webp',
  coochofal: 'imagenes/COOCHOFAL.jpg',
  coolitoral: 'imagenes/COOLITORAL.jfif',
  cootrab: 'imagenes/COOTRAB.jpg',
  cootransnorte: 'imagenes/COOTRANSNORTE.jfif',
  cootransporcar: 'imagenes/COOTRANSPORCAR.jfif',
  'cootrántico': 'imagenes/COOTRANTICO.jfif',
  embusa: 'imagenes/EMBUSA.jpg'
});

const SIBUS_DATA = [
  ['cooasatlán','Cooasatlán','COOASOATLAN'], ['coochofal','Coochofal','COOCHOFAL'],
  ['coolitoral','Coolitoral','COOLITORAL'], ['cootrab','Cootrab','COOTRAB'],
  ['cootransnorte','Cootransnorte','COOTRANSNORTE'], ['cootransporcar','Cootransporcar','COOTRANSPORCAR'],
  ['cootrántico','Cootrántico','COOTRANTICO'], ['embusa','Embusa','EMBUSA'],
  ['flota-angulo','Flota Angulo','FLOTA-ANGULO'], ['flota-roja','Flota Roja','FLOTA-ROJA'],
  ['la-carolina','La Carolina','LA-CAROLINA'], ['monterrey','Monterrey','MONTERREY'],
  ['sobusa','Sobusa','SOBUSA'], ['sodetrans','Sodetrans','SODETRANS'],
  ['transdiaz','Transdiaz','TRANSDIAZ'], ['transoledad','Transoledad','TRANSOLEDAD'],
  ['transurbar','Transurbar','TRANSURBAR'], ['trasalfa','Trasalfa','TRASALFA'],
  ['cootrasol','Cootrasol','COOTRASOL'], ['cootransco','Cootransco','COOTRANSCO'],
  ['transmecar','Transmecar','TRANSMECAR'], ['trasalianco','Trasalianco','TRASALIANCO'],
  ['transportes-lolaya','Transportes Lolaya','LOLAYA']
].map(([id, name, directory]) => {
  const codes = (AMB_ROUTE_INDEX[id] || '').split('|').filter(Boolean);
  return {
    id, name, fullName: name, color: '#0B2852', btnColor: '#0B2852',
    image: COMPANY_IMAGES[id] || null,
    routeSource: 'https://www.ambq.gov.co/transporte/transporte-publico-colectivo/',
    directorySource: `https://www.ambq.gov.co/ruta-de-buses/${directory}/`,
    logoSvg: `<div class="flex items-center gap-2 text-sibus-darkBlue font-bold"><i data-lucide="bus-front" class="h-5 w-5"></i><span>${name}</span></div>`,
    routes: codes.map((officialCode, index) => {
      const code = officialCode.split('-')[0];
      const slug = officialCode.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      return {
        id: `${id}-${slug}`, companyId: id, code, officialCode, name: officialCode,
        origin: null, destination: null,
        detail: 'Inicio, destino, paradas y trazado: pendiente de datos oficiales.',
        status: 'Registrada en el visor AMB · vigencia por confirmar',
        source: 'https://www.ambq.gov.co/transporte/transporte-publico-colectivo/',
        sourceDate: null, lastVerified: '2026-10-02', dataStatus: 'needs-verification',
        geometryUrl: `./data/routes/${id}/${id}-${slug}.geojson`,
        stops: [], geometry: null, order: index + 1
      };
    })
  };
});

window.SIBUS_DATA = SIBUS_DATA;
