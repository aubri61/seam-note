#!/usr/bin/env python3
"""Disposable production-profile TLS/HTTPS test. Uses synthetic credentials and loopback ports only.
Requires Docker Compose v2, openssl, and a locally built seam-note-backend:deploy-validation.
Never uses deploy/.env or a cloud connection. Removes only its own project/volumes.
"""
import base64, json, os, socket, ssl, subprocess, tempfile, time, urllib.request, urllib.error, uuid
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
work = Path(tempfile.mkdtemp(prefix='seam-deploy-stack-'))
project = 'seam-deploy-test-' + uuid.uuid4().hex[:8]
results = []

def run(*args, **kw):
    return subprocess.run(args, check=True, text=True, capture_output=True, **kw).stdout.strip()

def compose(*args):
    return run('docker','compose','--project-name',project,'--env-file',str(work/'.env'),'-f',str(work/'compose.yml'),*args)

def check(label, condition):
    if not condition: raise AssertionError(label)
    results.append(label); print('PASS:',label,flush=True)

def wait(fn, label, seconds=120):
    deadline=time.time()+seconds
    while time.time()<deadline:
        try:
            if fn(): return
        except (OSError,subprocess.CalledProcessError): pass
        time.sleep(1)
    raise RuntimeError('Timeout: '+label)

def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0)); return sock.getsockname()[1]

http_port, https_port = free_port(), free_port()
assert http_port != https_port
certs=work/'certs';certs.mkdir(mode=0o755)
try:
    # CA and server cert are exclusive to this disposable test.
    run('openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(certs/'ca.key'),'-out',str(certs/'supabase-ca.crt'),'-days','1','-subj','/CN=Seam disposable test CA')
    run('openssl','req','-newkey','rsa:2048','-nodes','-keyout',str(certs/'server.key'),'-out',str(certs/'server.csr'),'-subj','/CN=postgres')
    (certs/'ext.cnf').write_text('subjectAltName=DNS:postgres\nextendedKeyUsage=serverAuth\n')
    run('openssl','x509','-req','-in',str(certs/'server.csr'),'-CA',str(certs/'supabase-ca.crt'),'-CAkey',str(certs/'ca.key'),'-CAcreateserial','-out',str(certs/'server.crt'),'-days','1','-extfile',str(certs/'ext.cnf'))
    password_hash=run('docker','run','--rm','caddy:2.10.2-alpine','caddy','hash-password','--plaintext','synthetic-only')
    (work/'.env').write_text("BACKEND_IMAGE=seam-note-backend:deploy-validation\nDB_HOST=postgres\nDB_PORT=5432\nDB_NAME=seam_deploy_test\nDB_USERNAME=postgres\nDB_PASSWORD=synthetic-only\nAPI_HOST=localhost\nFRONTEND_ORIGIN=https://seam.example.test\nACME_EMAIL=local@example.test\nVALIDATION_USERNAME=reviewer\nVALIDATION_PASSWORD_HASH='"+password_hash+"'\n")
    os.chmod(work/'.env',0o600)
    text=(ROOT/'deploy/compose.yml').read_text().replace("'80:80'",f"'127.0.0.1:{http_port}:80'").replace("'443:443'",f"'127.0.0.1:{https_port}:443'")
    text=text.replace('  caddy:\n', '''  postgres:
    image: postgres:17
    environment:
      POSTGRES_DB: seam_deploy_test
      POSTGRES_PASSWORD: synthetic-only
    volumes:
      - ./certs:/certs:ro
    entrypoint: ["/bin/bash", "-ec"]
    command:
      - 'install -o postgres -g postgres -m 600 /certs/server.key /tmp/test-server.key; exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/certs/server.crt -c ssl_key_file=/tmp/test-server.key'
  caddy:
''')
    (work/'compose.yml').write_text(text)
    (work/'Caddyfile').write_text((ROOT/'deploy/Caddyfile').read_text().replace('{$API_HOST} {','{$API_HOST} {\n\ttls internal'))
    compose('config','--quiet')
    compose('run','--rm','--no-deps','caddy','caddy','validate','--config','/etc/caddy/Caddyfile','--adapter','caddyfile')
    check('production Compose and Caddy config validate',True)
    compose('up','-d','postgres')
    wait(lambda: 'accepting connections' in compose('exec','-T','postgres','pg_isready','-U','postgres'),'PostgreSQL')
    compose('up','-d','backend')
    ready=lambda: 'UP' in compose('exec','-T','backend','curl','-fsS','http://localhost:8080/actuator/health/readiness')
    wait(ready,'production readiness')
    check('prod boot, verify-full JDBC TLS and JPA validation',True)
    sql=lambda query: compose('exec','-T','postgres','psql','-U','postgres','-d','seam_deploy_test','-Atc',query)
    check('Flyway V1-V5 in private schema',sql('SELECT count(*) FROM seam_note.flyway_schema_history WHERE success AND version IS NOT NULL')=='5')
    check('no manuscript tables in public schema',sql("SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename IN ('notes','folders','creation_operations','note_update_operations')")=='0')
    check('JDBC connection uses database TLS',int(sql("SELECT count(*) FROM pg_stat_ssl WHERE ssl AND pid IN (SELECT pid FROM pg_stat_activity WHERE application_name LIKE 'PostgreSQL JDBC%')"))>0)
    compose('up','-d','caddy')
    cid=compose('ps','-q','caddy')
    wait(lambda: run('docker','cp',cid+':/data/caddy/pki/authorities/local/root.crt',str(work/'https-ca.crt')) is not None,'Caddy CA')
    context=ssl.create_default_context(cafile=str(work/'https-ca.crt'))
    origin=f'https://localhost:{https_port}'
    auth='Basic '+base64.b64encode(b'reviewer:synthetic-only').decode()
    def call(method,path,body=None,key=None,anonymous=False,headers=None):
        h={'Content-Type':'application/json',**({} if anonymous else {'Authorization':auth}),**(headers or {})}
        if key: h['Idempotency-Key']=key
        req=urllib.request.Request(origin+path,headers=h,method=method,data=None if body is None else json.dumps(body).encode())
        try: response=urllib.request.urlopen(req,context=context,timeout=15)
        except urllib.error.HTTPError as error: response=error
        with response:
            raw=response.read();return response.status,json.loads(raw) if raw else None,response.headers
    check('HTTPS rejects anonymous GET',call('GET','/api/workspace/tree',anonymous=True)[0]==401)
    check('HTTPS rejects anonymous writes',call('POST','/api/notes',{},anonymous=True)[0]==401)
    check('authenticated health endpoint stays private',call('GET','/actuator/health')[0]==404)
    check('cross-origin authenticated write blocked',call('POST','/api/folders',{},headers={'Origin':'https://evil.example'})[0]==403)
    status,_,headers=call('GET','/api/workspace/tree')
    check('authenticated GET is never cached',status==200 and headers.get('Cache-Control')=='no-store')
    folder,note,key,update_key=[str(uuid.uuid4()) for _ in range(4)]
    check('HTTPS Folder POST',call('POST','/api/folders',{'id':folder,'name':'synthetic'},str(uuid.uuid4()))[0]==201)
    rich=json.dumps({'type':'doc','content':[{'type':'paragraph'}]})
    payload={'id':note,'folderId':folder,'title':'synthetic','content':rich}
    first=call('POST','/api/notes',payload,key)
    replay=call('POST','/api/notes',payload,key)
    check('HTTPS creation replay and ACK',first[0]==201 and first[1]==replay[1] and replay[2].get('Idempotency-Key')==key)
    update={'title':'changed','content':rich,'expectedVersion':0}
    first=call('PUT','/api/notes/'+note,update,update_key)
    replay=call('PUT','/api/notes/'+note,update,update_key)
    check('HTTPS PUT replay and ACK',first[0]==200 and first[1]==replay[1] and replay[2].get('Idempotency-Key')==update_key)
    check('HTTPS expectedVersion conflict',call('PUT','/api/notes/'+note,update,str(uuid.uuid4()))[0]==409)
    check('backend port has no host binding',run('docker','inspect','--format','{{json .HostConfig.PortBindings}}',compose('ps','-q','backend')) in ('{}','null'))
    compose('restart','backend');wait(ready,'readiness after restart')
    check('container restart preserves note and ledger',call('GET','/api/notes/'+note)[1]['version']==1 and call('PUT','/api/notes/'+note,update,update_key)[1]==first[1])
    compose('stop','postgres')
    wait(lambda: '503' in compose('exec','-T','backend','curl','-sS','-o','/dev/null','-w','%{http_code}','http://localhost:8080/actuator/health/readiness'),'DB-down readiness',40)
    check('database failure returns readiness 503',True)
    compose('start','postgres');wait(ready,'database recovery')
    check('DB restart preserves data',call('GET','/api/notes/'+note)[1]['version']==1)
    # Wrong CA fails closed. No fallback to sslmode=require.
    ca=certs/'supabase-ca.crt';original=ca.read_bytes();ca.write_bytes(b'not-a-certificate')
    compose('restart','backend')
    # Assert an actual driver failure, rather than guessing startup from elapsed time.
    def ca_rejected():
        logs=compose('logs','--no-color','--tail','250','backend')
        return 'Loading the SSL root certificate' in logs and 'TrustManager failed' in logs
    wait(ca_rejected,'invalid CA rejection',60)
    check('invalid DB CA rejects JDBC startup',True)
    ca.write_bytes(original)
    report={'scope':'LOCAL Docker PostgreSQL 17 + prod profile + Caddy internal test CA; NOT Supabase/EC2/Vercel','checks':results,'count':len(results),'cloudTestsRun':False}
    output=ROOT/'docs/verification/2026-10-29-deployment-local.json';output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print('Report:',output,flush=True)
finally:
    # Logs contain only generated synthetic fixtures; still keep them outside Git.
    try: (work/'compose.log').write_text(compose('logs','--no-color'))
    except subprocess.CalledProcessError: pass
    try: compose('down','--volumes','--remove-orphans')
    except subprocess.CalledProcessError: pass
    print('Local test artifacts:',work,flush=True)
