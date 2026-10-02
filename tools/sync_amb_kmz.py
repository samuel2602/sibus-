#!/usr/bin/env python3
"""Download AMB KMZ files matching the local route index and convert them to GeoJSON."""

import html
import json
import re
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urljoin
from urllib.request import Request, urlopen

from kmz_to_geojson import main as convert_main

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://www.ambq.gov.co/'
USER_AGENT = 'SIBUS-M route-data importer/1.0 (official AMB public KMZ index)'


def request(url):
    req = Request(url, headers={'User-Agent': USER_AGENT})
    with urlopen(req, timeout=25) as response:
        return response.read()


def get_catalog():
    js = ROOT / 'data' / 'companies.js'
    script = "const fs=require('fs'),vm=require('vm');const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(process.argv[1],'utf8')+';globalThis.out=SIBUS_DATA.map(x=>({id:x.id,name:x.name,directorySource:x.directorySource,routes:x.routes.map(r=>({id:r.id,officialCode:r.officialCode,geometryUrl:r.geometryUrl}))}))',c);process.stdout.write(JSON.stringify(c.out));"
    result = subprocess.run(['node', '-e', script, str(js)], check=True, capture_output=True, text=True, encoding='utf-8')
    return json.loads(result.stdout)


def norm(value):
    value = unquote(value)
    value = re.sub(r'(?i)\.kmz$', '', value)
    return re.sub(r'[^A-Z0-9]', '', value.upper())


def index_entries(page):
    text = page.decode('utf-8', errors='replace')
    entries = {}
    for row in re.split(r'</tr\s*>', text, flags=re.I):
        anchor = re.search(r'<a\b[^>]*href=["\']([^"\']+\.kmz)["\'][^>]*>(.*?)</a>', row, flags=re.I | re.S)
        if not anchor:
            continue
        href = html.unescape(anchor.group(1))
        label = html.unescape(re.sub(r'<[^>]+>', '', anchor.group(2))).strip()
        date_match = re.search(r'(20\d{2}-\d{2}-\d{2})\s+(\d{2}:\d{2})', re.sub(r'<[^>]+>', ' ', row))
        source_date = date_match.group(1) if date_match else None
        entries[norm(label)] = {'url': href, 'date': source_date, 'filename': label}
    return entries


def main():
    catalog = get_catalog()
    counts = {'downloaded': 0, 'missing': 0, 'failed': 0}
    cache = {}
    for company in catalog:
        directory_urls = [
            company['directorySource'],
            urljoin(BASE, f"rutas-de-buses/{company['directorySource'].rstrip('/').split('/')[-1]}/")
        ]
        dirs = []
        for directory_url in directory_urls:
            if directory_url in cache:
                dirs.append((directory_url, cache[directory_url]))
                continue
            try:
                entries = index_entries(request(directory_url))
                cache[directory_url] = entries
                dirs.append((directory_url, entries))
            except (HTTPError, URLError, TimeoutError, OSError) as error:
                print(f"INDEX unavailable {directory_url}: {error}", file=sys.stderr)
                cache[directory_url] = {}
                dirs.append((directory_url, {}))
            time.sleep(.15)

        for route in company['routes']:
            expected = norm(route['officialCode'])
            match = next(((directory_url, entries[expected]) for directory_url, entries in dirs if expected in entries), None)
            if not match:
                counts['missing'] += 1
                print(f"MISSING {company['name']} {route['officialCode']}")
                continue
            directory_url, entry = match
            file_url = urljoin(directory_url, entry['url'])
            out_dir = ROOT / 'data' / 'routes' / company['id']
            out_dir.mkdir(parents=True, exist_ok=True)
            kmz_path = out_dir / f"{route['id']}.kmz"
            geojson_path = ROOT / route['geometryUrl'].removeprefix('./')
            try:
                kmz_path.write_bytes(request(file_url))
                sys.argv = [
                    str(ROOT / 'tools' / 'kmz_to_geojson.py'), str(kmz_path),
                    '--company-id', company['id'], '--route-id', route['id'], '--route-code', route['officialCode'],
                    '--source', file_url, '--status', 'needs-verification', '--output', str(geojson_path)
                ]
                if entry['date']:
                    sys.argv.extend(['--source-date', entry['date']])
                if convert_main() != 0:
                    counts['failed'] += 1
                    continue
                counts['downloaded'] += 1
            except (HTTPError, URLError, TimeoutError, OSError) as error:
                counts['failed'] += 1
                print(f"DOWNLOAD failed {company['name']} {route['officialCode']}: {error}", file=sys.stderr)
            time.sleep(.2)
    print('Summary:', json.dumps(counts))
    return 0 if counts['failed'] == 0 else 1


if __name__ == '__main__':
    raise SystemExit(main())
