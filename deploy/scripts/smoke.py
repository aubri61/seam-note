#!/usr/bin/env python3
"""Explicit synthetic writes only. Never reset a DB or delete an existing folder."""
import argparse, base64, getpass, json, ssl, uuid, urllib.request, urllib.error
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--base-url', required=True, help='HTTPS origin, including /api')
p.add_argument('--validation-user', help='Password is entered at a hidden prompt, never as an argument')
p.add_argument('--allow-local-http', action='store_true')
p.add_argument('--ca-file', help='Optional test CA for isolated local HTTPS; never disables verification')
p.add_argument('--confirm-synthetic-writes', action='store_true', required=True)
a = p.parse_args()
from urllib.parse import urlsplit
url = urlsplit(a.base_url)
if url.username or url.password or url.query or url.fragment or url.path.rstrip('/') != '/api':
    p.error('Use an origin ending in /api, without credentials or query')
if url.scheme != 'https' and not (a.allow_local_http and url.scheme == 'http' and url.hostname in ('127.0.0.1','localhost')):
    p.error('HTTPS is required outside the isolated local fixture')
context = ssl.create_default_context(cafile=a.ca_file)
auth = None
if a.validation_user:
    auth = 'Basic ' + base64.b64encode((a.validation_user + ':' + getpass.getpass('Validation password: ')).encode()).decode()

def call(method, path, body=None, key=None, anonymous=False):
    headers = {'Content-Type': 'application/json'}
    if auth and not anonymous: headers['Authorization'] = auth
    if key: headers['Idempotency-Key'] = key
    req = urllib.request.Request(a.base_url.rstrip('/') + path, method=method, headers=headers,
        data=None if body is None else json.dumps(body).encode())
    try: response = urllib.request.urlopen(req, context=context, timeout=20)
    except urllib.error.HTTPError as error: response = error
    with response:
        raw = response.read()
        return response.status, json.loads(raw) if raw else None, response.headers.get('Idempotency-Key')

def check(condition, label):
    if not condition: raise RuntimeError(label)
    print('PASS:', label)

if auth:
    check(call('GET', '/workspace/tree', anonymous=True)[0] == 401, 'anonymous API blocked')
check(call('GET','/workspace/tree')[0] == 200, 'workspace GET')
folder_id, note_id, create_key, put_key = (str(uuid.uuid4()) for _ in range(4))
created = False
try:
    status, _, _ = call('POST','/folders',{'id':folder_id,'name':'DEPLOY-SYNTHETIC-' + folder_id},str(uuid.uuid4()))
    check(status == 201,'folder POST'); created = True
    rich = lambda text: json.dumps({'type':'doc','content':[{'type':'paragraph','content':[{'type':'text','text':text}]}]}, separators=(',',':'))
    payload = {'id':note_id,'folderId':folder_id,'title':'Synthetic deployment check','content':rich('synthetic only')}
    first = call('POST','/notes',payload,create_key)
    check(first[0] == 201 and first[2] == create_key,'note POST and creation ACK')
    check(call('POST','/notes',payload,create_key) == first,'creation ledger replay')
    update = {'title':'Synthetic updated','content':rich('updated synthetic only'),'expectedVersion':0}
    saved = call('PUT','/notes/' + note_id,update,put_key)
    check(saved[0] == 200 and saved[1]['version'] == 1 and saved[2] == put_key,'PUT version and ACK')
    check(call('PUT','/notes/' + note_id,update,put_key) == saved,'update ledger replay')
    check(call('PUT','/notes/' + note_id,update,str(uuid.uuid4()))[0] == 409,'expectedVersion conflict')
    check(call('PUT','/notes/' + note_id,{**update,'title':'different'},put_key)[0] == 409,'idempotency key payload mismatch')
    check(call('GET','/notes/' + note_id)[1]['version'] == 1,'note GET')
    check(call('GET','/folders/' + folder_id + '/notes')[0] == 200,'folder notes GET')
    check(call('PATCH','/folders/' + folder_id,{'name':'Synthetic renamed'})[0] == 200,'folder PATCH')
finally:
    if created:
        check(call('DELETE','/folders/' + folder_id)[0] == 204,'own synthetic folder cleanup')
        check(call('GET','/notes/' + note_id)[0] == 404,'cascade note DELETE')
