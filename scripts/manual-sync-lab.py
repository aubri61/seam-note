#!/usr/bin/env python3
"""Disposable PostgreSQL + Spring + Vite. Writes only freshly created lab databases.
Default: run verification and stop. --serve: keep the seeded single-note lab open until Ctrl-C.
"""
import argparse, hashlib, json, os, signal, socket, subprocess, tempfile, time, urllib.request, uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser()
p.add_argument('--serve', action='store_true')
p.add_argument('--creation', action='store_true')
p.add_argument('--db-port', type=int, default=25442)
p.add_argument('--api-port', type=int, default=18766)
p.add_argument('--ui-port', type=int, default=25175)
a = p.parse_args()
if len({a.db_port,a.api_port,a.ui_port}) != 3 or {a.db_port,a.api_port,a.ui_port} & {15439,18765,5173}:
    raise SystemExit('Use three distinct research ports, never development ports.')
for port in [a.db_port,a.api_port,a.ui_port]:
    with socket.socket() as s: s.bind(('127.0.0.1',port))
work = Path(tempfile.mkdtemp(prefix='seam-note-manual-sync-',dir='/private/tmp'))
children, opened, pg_started = [], [], False
base = os.environ.copy()

def run(args, **kwargs):
    return subprocess.run([str(x) for x in args], check=True, **kwargs)
def start(args, logfile, env=None, cwd=ROOT):
    log = open(work/logfile,'w'); opened.append(log)
    child = subprocess.Popen([str(x) for x in args], cwd=cwd, env=env or base, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    children.append(child); return child

def wait_http(url, child, timeout=90):
    deadline = time.time()+timeout
    while time.time()<deadline:
        if child.poll() is not None: raise RuntimeError('Lab process exited; inspect '+str(work))
        try:
            with urllib.request.urlopen(url,timeout=2) as response:
                if response.status==200: return
        except (OSError,TimeoutError): pass
        time.sleep(.2)
    raise RuntimeError('Timed out waiting for isolated lab; logs: '+str(work))

def api(method,path,body=None):
    raw=None if body is None else json.dumps(body).encode()
    req=urllib.request.Request(f'http://127.0.0.1:{a.api_port}/api'+path,data=raw,headers={'Content-Type':'application/json'},method=method)
    with urllib.request.urlopen(req,timeout=10) as response:
        return json.loads(response.read())

try:
    with open(work/'init.log','w') as log:
        run(['initdb','-D',work/'pgdata','-U','postgres','-A','trust','--no-locale','-E','UTF8'],stdout=log)
    run(['pg_ctl','-D',work/'pgdata','-l',work/'postgres.log','-o',f'-h 127.0.0.1 -p {a.db_port} -k {work}','start'],stdout=subprocess.DEVNULL)
    pg_started=True
    for db in ['seam_note_manual_test','seam_note_manual_lab']:
        run(['createdb','-h','127.0.0.1','-p',a.db_port,'-U','postgres',db])
    test_env={**base,'TEST_DB_URL':f'jdbc:postgresql://127.0.0.1:{a.db_port}/seam_note_manual_test','TEST_DB_USERNAME':'postgres','TEST_DB_PASSWORD':''}
    with open(work/'gradle.log','w') as log:
        run(['./gradlew',*(['bootJar'] if a.serve else ['test','bootJar','--rerun-tasks']),'--offline'],cwd=ROOT/'backend',env=test_env,stdout=log,stderr=subprocess.STDOUT)
    db_url=f'jdbc:postgresql://127.0.0.1:{a.db_port}/seam_note_manual_lab'
    server=start(['java','-jar',ROOT/'backend/build/libs/backend-0.0.1-SNAPSHOT.jar',f'--server.port={a.api_port}',f'--spring.datasource.url={db_url}','--spring.datasource.username=postgres','--spring.datasource.password=','--spring.devtools.restart.enabled=false'],'spring.log')
    wait_http(f'http://127.0.0.1:{a.api_port}/api/workspace/tree',server)
    folder=api('POST','/folders',{'id':str(uuid.uuid4()),'name':'수동 동기화 실험 전용'})
    note=api('POST','/notes',{'id':str(uuid.uuid4()),'folderId':folder['id'],'title':'실험 원고','content':'격리된 초기 본문'})
    config=work/'vite.config.mjs'
    config.write_text("import config from "+json.dumps(str(ROOT/'frontend/vite.config.ts'))+"\nexport default {...config,cacheDir:"+json.dumps(str(work/'vite-cache'))+"}\n")
    ui_env={**base,'SEAM_NOTE_API_TARGET':f'http://127.0.0.1:{a.api_port}'}
    vite=start(['pnpm','exec','vite','--config',config,'--host','127.0.0.1','--port',a.ui_port,'--strictPort'],'vite.log',ui_env,ROOT/'frontend')
    wait_http(f'http://127.0.0.1:{a.ui_port}/',vite)
    fixture={'noteId':note['id'],'folderId':folder['id'],'origin':f'http://127.0.0.1:{a.ui_port}','apiOrigin':f'http://127.0.0.1:{a.api_port}','dbPort':a.db_port,'dbName':'seam_note_manual_lab','workDirectory':str(work)}
    (work/'fixture.json').write_text(json.dumps(fixture,ensure_ascii=False,indent=2))
    print('Lab note:',fixture['origin']+'/notes/'+note['id'],flush=True)
    print('Isolated fixture/logs:',work,flush=True)
    if a.serve:
        print('The fresh lab note uses the regular manual-save button. Ctrl-C stops the lab; development services are untouched.',flush=True)
        while True: time.sleep(1)
    else:
        playwright=base.get('SEAM_NOTE_PLAYWRIGHT_MODULE','/Users/jueon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
        test_env={**base,'SEAM_NOTE_PLAYWRIGHT_MODULE':playwright,'SEAM_NOTE_LAB_FIXTURE':str(work/'fixture.json')}
        with open(work/'browser.log','w') as log:
            run(['node',ROOT/('frontend/tests/browser/offlineCreationLive.cjs' if a.creation else 'frontend/tests/browser/manualSyncLive.cjs')],cwd=ROOT,env=test_env,stdout=log,stderr=subprocess.STDOUT)
        result=json.loads((work/'browser-results.json').read_text())
        if a.creation:
            print('Offline creation real API/PWA verification passed.',flush=True)
            with open(work/'manual-update-regression.log','w') as log:
                run(['node',ROOT/'frontend/tests/browser/manualSyncLive.cjs'],cwd=ROOT,env=test_env,stdout=log,stderr=subprocess.STDOUT)
            manual_result=json.loads((work/'browser-results.json').read_text())
            (ROOT/'docs/verification/2026-10-26-offline-creation-update-results.json').write_text(json.dumps(manual_result,ensure_ascii=False,indent=2)+'\n')
            result=None
        if result is not None:
            sql="select json_build_object('noteVersion',n.version,'noteId',n.id,'ledger',coalesce((select json_agg(json_build_object('operationId',operation_id,'version',(response_json::jsonb->>'version')::bigint)) from note_update_operations where note_id=n.id),'[]'::json)) from notes n where id='"+note['id']+"'::uuid"
            raw=subprocess.check_output(['psql','-h','127.0.0.1','-p',str(a.db_port),'-U','postgres','-d','seam_note_manual_lab','-Atc',sql],text=True)
            result['postgres']=json.loads(raw)
            assert result['postgres']['noteVersion']==result['finalVersion']
            result['environment']={'postgres':subprocess.check_output(['psql','-h','127.0.0.1','-p',str(a.db_port),'-U','postgres','-d','seam_note_manual_lab','-Atc','show server_version'],text=True).strip(),'dbName':'seam_note_manual_lab','dbPort':a.db_port,'apiPort':a.api_port,'uiPort':a.ui_port,'fixtureNoteId':note['id']}
            result['sourceHashes']={str(f.relative_to(ROOT)):hashlib.sha256(f.read_bytes()).hexdigest() for f in [ROOT/'frontend/src/features/local-drafts/draftDatabase.ts',ROOT/'frontend/src/features/local-drafts/draftSession.ts',ROOT/'frontend/src/features/manual-sync/manualSync.ts']}
            output=Path(base.get('SEAM_NOTE_VERIFICATION_OUTPUT',str(ROOT/'docs/verification/2026-10-26-manual-save-results.json')));output.parent.mkdir(parents=True,exist_ok=True)
            output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
            print('Verified real PUT + PostgreSQL + ack. Result:',output,flush=True)
        # Existing UI regressions use mock APIs on the dedicated origin.
        for name in (['outboxStorage','localDraftStorage','noteDrafts','noteRouting','workspaceCreateDelete','workspaceReadonly','sidebarDraftTitles','manualSaveUx']):
            env={**test_env,'SEAM_NOTE_UI_URL':fixture['origin']}
            with open(work/(name+'.log'),'w') as log:
                run(['node',ROOT/f'frontend/tests/browser/{name}.cjs'],env=env,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
        print('Seven existing browser regressions and manual-save UX passed.',flush=True)
except KeyboardInterrupt:
    print('Stopping isolated lab.',flush=True)
finally:
    for child in reversed(children):
        # Vite's pnpm parent may spawn a child; below pg_ctl only targets our dedicated cluster.
        try: os.killpg(child.pid,signal.SIGTERM)
        except ProcessLookupError: pass
    for child in children:
        try: child.wait(timeout=15)
        except subprocess.TimeoutExpired: child.kill();child.wait()
    if pg_started: subprocess.run(['pg_ctl','-D',str(work/'pgdata'),'-m','fast','stop'],check=False,stdout=subprocess.DEVNULL)
    for log in opened: log.close()
