#!/usr/bin/env python3
"""Disposable PostgreSQL + Spring + Vite. Writes only freshly created lab databases.
Default: run verification and stop. --serve: keep the seeded single-note lab open until Ctrl-C.
"""
import argparse, json, os, signal, socket, subprocess, tempfile, time, urllib.request, uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser()
p.add_argument('--serve', action='store_true')
p.add_argument('--open-browser', action='store_true', help='Open a separate Chrome profile for this served lab')
p.add_argument('--delay', action='store_true', help='Serve a designated-note-only 10s response/ACK lab')
p.add_argument('--creation', action='store_true', help='Compatibility flag; runs the current Workspace-wide flow')
p.add_argument('--workspace', action='store_true')
p.add_argument('--conflicts', action='store_true', help='Also run manuscript conflict selection and UI regressions')
p.add_argument('--db-port', type=int, default=25442)
p.add_argument('--api-port', type=int, default=18766)
p.add_argument('--ui-port', type=int, default=25175)
a = p.parse_args()
if a.delay: a.serve = True
if a.conflicts: a.workspace = True
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

def api(method,path,body=None,operation_id=None):
    raw=None if body is None else json.dumps(body).encode()
    req=urllib.request.Request(f'http://127.0.0.1:{a.api_port}/api'+path,data=raw,headers={'Content-Type':'application/json',**({'Idempotency-Key':operation_id} if operation_id else {})},method=method)
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
    if a.delay:
        for _ in range(2):
            note=api('PUT','/notes/'+note['id'],{'title':note['title'],'content':note['content']+' 실험 기준','expectedVersion':note['version']},str(uuid.uuid4()))
    config=work/'vite.config.mjs'
    config.write_text("import config from "+json.dumps(str(ROOT/'frontend/vite.config.ts'))+"\nexport default {...config,cacheDir:"+json.dumps(str(work/'vite-cache'))+"}\n")
    ui_env={**base,'SEAM_NOTE_API_TARGET':f'http://127.0.0.1:{a.api_port}'}
    if a.delay:
        ui_env['VITE_SYNC_DELAY_NOTE_ID']=note['id']
        config.write_text('import config from '+json.dumps(str(ROOT/'frontend/vite.config.ts'))+'\nimport delay from '+json.dumps(str(ROOT/'scripts/sync-delay-proxy.mjs'))+'\nexport default {...config,cacheDir:'+json.dumps(str(work/'vite-cache'))+',plugins:[...config.plugins,delay('+json.dumps({'noteId':note['id'],'apiOrigin':f'http://127.0.0.1:{a.api_port}'})+')],server:{...config.server,proxy:{}}}\n')
    vite=start(['pnpm','exec','vite','--config',config,'--host','127.0.0.1','--port',a.ui_port,'--strictPort'],'vite.log',ui_env,ROOT/'frontend')
    wait_http(f'http://127.0.0.1:{a.ui_port}/',vite)
    fixture={'noteId':note['id'],'folderId':folder['id'],'origin':f'http://127.0.0.1:{a.ui_port}','apiOrigin':f'http://127.0.0.1:{a.api_port}','dbPort':a.db_port,'dbName':'seam_note_manual_lab','workDirectory':str(work)}
    (work/'fixture.json').write_text(json.dumps(fixture,ensure_ascii=False,indent=2))
    print('Lab note:',fixture['origin']+'/notes/'+note['id'],flush=True)
    print('Isolated fixture/logs:',work,flush=True)
    if a.serve:
        if a.open_browser:
            start(['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','--no-first-run','--no-default-browser-check','--user-data-dir='+str(work/'chrome-manual'),fixture['origin']+'/notes/'+note['id']],'chrome-manual.log')
        if a.delay:
            print('Development-only delay panel: arm A or B, edit the test note, then click the regular sync button. Initial server version: 2.',flush=True)
            print('Dedicated manual Chrome profile:',work/'chrome-manual',flush=True)
        print('Use the regular Workspace sync button for the fresh lab note. Ctrl-C stops the lab; development services are untouched.',flush=True)
        while True: time.sleep(1)
    else:
        playwright=base.get('SEAM_NOTE_PLAYWRIGHT_MODULE','/Users/jueon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
        test_env={**base,'SEAM_NOTE_PLAYWRIGHT_BASE':base.get('SEAM_NOTE_PLAYWRIGHT_BASE',playwright),'SEAM_NOTE_PLAYWRIGHT_MODULE':str(ROOT/'frontend/tests/browser/helpers/onlineChrome.cjs'),'SEAM_NOTE_LAB_FIXTURE':str(work/'fixture.json')}
        with open(work/'browser.log','w') as log:
            run(['node',ROOT/'frontend/tests/browser/workspaceSyncLive.cjs'],cwd=ROOT,env=test_env,stdout=log,stderr=subprocess.STDOUT)
        result=json.loads((work/'browser-results.json').read_text())
        output=Path(base.get('SEAM_NOTE_VERIFICATION_OUTPUT',str(ROOT/'docs/verification/2026-10-27-workspace-ui-results.json')))
        output.parent.mkdir(parents=True,exist_ok=True)
        output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
        print('Workspace real production/Spring/PostgreSQL verification passed. Result:',output,flush=True)
        if a.conflicts:
            for name in ['conflictResolutionLive','conflictResolutionUi','multiTabConflictAfter']:
                with open(work/(name+'.log'),'w') as log:
                    run(['node',ROOT/f'frontend/tests/browser/{name}.cjs'],cwd=ROOT,
                        env={**test_env,'SEAM_NOTE_MULTITAB_REPORT':str(ROOT/'docs/verification/2026-10-27-conflict-auto-reconcile.json')},stdout=log,stderr=subprocess.STDOUT)
            print('Manuscript conflict selection and real UI verification passed.',flush=True)
        # Existing UI regressions use mock APIs on the dedicated origin.
        for name in (['outboxStorage','localDraftStorage','noteDrafts','noteRouting','workspaceCreateDelete','workspaceReadonly','sidebarDraftTitles','manualSaveUx'] + (['inlineFolderCreation','folderExpansion','folderMenu','folderRenameFocus'] if a.workspace else [])):
            env={**test_env,'SEAM_NOTE_UI_URL':fixture['origin']}
            with open(work/(name+'.log'),'w') as log:
                run(['node',ROOT/f'frontend/tests/browser/{name}.cjs'],env=env,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
        print('Existing browser regressions passed.',flush=True)
        if a.workspace:
            with open(work/'pwa-regression.log','w') as log:
                run(['node',ROOT/'frontend/tests/browser/pwaOffline.cjs'],env={**test_env,'SEAM_NOTE_PWA_VERIFICATION_OUTPUT':str(ROOT/'docs/verification/2026-10-27-workspace-ui-pwa-results.json'),'SEAM_NOTE_PWA_SCREENSHOT_DIR':str(work)},cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
            print('Production PWA regressions passed.',flush=True)
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
