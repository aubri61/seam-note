#!/usr/bin/env python3
"""Read-only public HTTPS checks; never accepts or logs credentials."""
import argparse
import http.client
import json
import socket
import ssl
from urllib.parse import urlsplit

parser = argparse.ArgumentParser()
parser.add_argument('origin', help='HTTPS origin without credentials or path')
args = parser.parse_args()
url = urlsplit(args.origin)
if url.scheme != 'https' or url.username or url.password or url.path not in ('', '/') or url.query or url.fragment or url.port:
    parser.error('Use a plain HTTPS origin')
host = url.hostname
results = []


def check(name, condition, **details):
    results.append({'name': name, 'passed': bool(condition), **details})
    if not condition:
        raise AssertionError(name)


try:
    context = ssl.create_default_context()
    with socket.create_connection((host, 443), timeout=15) as raw:
        with context.wrap_socket(raw, server_hostname=host) as connection:
            cert = connection.getpeercert()
            check('trusted TLS certificate and hostname', True,
                  protocol=connection.version(),
                  subjectAltName=cert.get('subjectAltName'),
                  issuer=cert.get('issuer'),
                  notBefore=cert.get('notBefore'), notAfter=cert.get('notAfter'))
    redirect = http.client.HTTPConnection(host, timeout=15)
    try:
        redirect.request('GET', '/api/workspace/tree')
        response = redirect.getresponse()
        target = urlsplit(response.getheader('Location', ''))
        check('HTTP redirects to the same HTTPS host',
              response.status in (301, 302, 307, 308) and target.scheme == 'https' and target.hostname == host,
              status=response.status, location=response.getheader('Location'))
    finally:
        redirect.close()
    for path in ['/api/workspace/tree', '/actuator/health/readiness']:
        https = http.client.HTTPSConnection(host, timeout=15, context=context)
        try:
            https.request('GET', path)
            response = https.getresponse()
            check('anonymous request blocked: ' + path,
                  response.status == 401 and response.getheader('WWW-Authenticate', '').startswith('Basic '),
                  status=response.status)
            check('response cannot be cached: ' + path,
                  'no-store' in response.getheader('Cache-Control', ''),
                  cacheControl=response.getheader('Cache-Control'))
        finally:
            https.close()
except Exception as error:
    # Only exception class: URL errors can contain request/user data in other callers.
    print(json.dumps({'origin': args.origin, 'results': results, 'error': type(error).__name__}, indent=2))
    raise SystemExit(1)
print(json.dumps({'origin': args.origin, 'results': results}, indent=2))
