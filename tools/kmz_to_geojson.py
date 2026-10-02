#!/usr/bin/env python3
"""Convert official KML/KMZ route files into a GeoJSON FeatureCollection."""

import argparse
import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


def local_name(tag):
    return tag.rsplit('}', 1)[-1]


def coordinates(text):
    result = []
    for token in (text or '').split():
        parts = token.split(',')
        if len(parts) < 2:
            continue
        try:
            lon, lat = float(parts[0]), float(parts[1])
            if -180 <= lon <= 180 and -90 <= lat <= 90:
                point = [lon, lat]
                if len(parts) > 2 and parts[2]:
                    point.append(float(parts[2]))
                result.append(point)
        except ValueError:
            continue
    return result


def parse_geometry(element):
    children = list(element)
    tag = local_name(element.tag)
    if tag == 'Point':
        node = next((item for item in children if local_name(item.tag) == 'coordinates'), None)
        points = coordinates(node.text if node is not None else '')
        return {'type': 'Point', 'coordinates': points[0]} if points else None
    if tag == 'LineString':
        node = next((item for item in children if local_name(item.tag) == 'coordinates'), None)
        points = coordinates(node.text if node is not None else '')
        return {'type': 'LineString', 'coordinates': points} if len(points) >= 2 else None
    if tag == 'Polygon':
        rings = []
        for node in element.iter():
            if local_name(node.tag) == 'coordinates':
                ring = coordinates(node.text)
                if len(ring) >= 4:
                    rings.append(ring)
        return {'type': 'Polygon', 'coordinates': rings} if rings else None
    if tag == 'MultiGeometry':
        geometries = [parse_geometry(child) for child in children]
        geometries = [geometry for geometry in geometries if geometry]
        if len(geometries) == 1:
            return geometries[0]
        return {'type': 'GeometryCollection', 'geometries': geometries} if geometries else None
    return None


def placemark_features(root, input_name, metadata):
    features = []
    for placemark in (node for node in root.iter() if local_name(node.tag) == 'Placemark'):
        properties = dict(metadata)
        properties['sourceFile'] = input_name
        for node in placemark:
            name = local_name(node.tag)
            if name in ('name', 'description') and node.text:
                properties[name] = node.text.strip()
            elif name == 'ExtendedData':
                for data in node.iter():
                    if local_name(data.tag) == 'Data':
                        key = data.attrib.get('name')
                        value = next((child.text for child in data if local_name(child.tag) == 'value'), None)
                        if key and value:
                            properties[key] = value.strip()
        geometries = [parse_geometry(node) for node in placemark if local_name(node.tag) in ('Point', 'LineString', 'Polygon', 'MultiGeometry')]
        geometries = [geometry for geometry in geometries if geometry]
        if not geometries:
            continue
        geometry = geometries[0] if len(geometries) == 1 else {'type': 'GeometryCollection', 'geometries': geometries}
        features.append({'type': 'Feature', 'properties': properties, 'geometry': geometry})
    return features


def read_kml(path):
    if path.suffix.lower() == '.kmz':
        with zipfile.ZipFile(path) as archive:
            candidates = [name for name in archive.namelist() if name.lower().endswith('.kml')]
            if not candidates:
                raise ValueError('KMZ archive has no KML file')
            data = archive.read(candidates[0])
    elif path.suffix.lower() == '.kml':
        data = path.read_bytes()
    else:
        raise ValueError(f'Unsupported input: {path}')
    return ET.fromstring(data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('inputs', nargs='+', type=Path, help='KML/KMZ file(s)')
    parser.add_argument('--company-id', required=True)
    parser.add_argument('--route-id', required=True)
    parser.add_argument('--route-code', required=True)
    parser.add_argument('--source', required=True, help='Official source URL')
    parser.add_argument('--source-date', help='Publication/update date as YYYY-MM-DD')
    parser.add_argument('--status', default='needs-verification', choices=['needs-verification', 'pilot', 'verified-current'])
    parser.add_argument('--output', type=Path, help='Output GeoJSON path; defaults to data/routes/<company>/<route>.geojson')
    args = parser.parse_args()

    slug = re.sub(r'[^\w-]+', '-', args.route_id.lower(), flags=re.UNICODE).strip('-')
    output = args.output or Path('data/routes') / args.company_id / f'{slug}.geojson'
    metadata = {
        'companyId': args.company_id,
        'routeId': args.route_id,
        'routeCode': args.route_code,
        'source': args.source,
        'sourceDate': args.source_date,
        'lastVerified': __import__('datetime').date.today().isoformat(),
        'status': args.status,
        'coordinateOrder': 'longitude,latitude'
    }
    features = []
    try:
        for path in args.inputs:
            features.extend(placemark_features(read_kml(path), path.name, metadata))
    except (OSError, zipfile.BadZipFile, ET.ParseError, ValueError) as error:
        print(f'Import failed: {error}', file=sys.stderr)
        return 2
    if not features:
        print('Import failed: no supported KML geometry was found.', file=sys.stderr)
        return 2
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({'type': 'FeatureCollection', 'features': features}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Wrote {len(features)} feature(s) to {output}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
