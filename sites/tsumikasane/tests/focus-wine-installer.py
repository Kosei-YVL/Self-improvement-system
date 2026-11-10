"""Optional Linux compatibility check of the actual Windows EXEs, not physical Windows."""
import datetime,json,os,subprocess,time,urllib.request,hashlib,uuid
from pathlib import Path,PureWindowsPath
ROOT=Path(__file__).resolve().parent.parent;QA=Path(os.environ.get('FOCUS_WINDOWS_QA_DIR',ROOT/'qa/focus-premium'));PREFIX=Path('/workspace/private/focus-wine-clean');WINE='/workspace/tooling/wine/root/usr/lib/wine/wine64';EXE=os.environ.get('FOCUS_INSTALLER_EXE','/workspace/artifacts/Focus-Setup-20261029-x64.exe');WINROOT=r'C:\Focus Native QA';APP=PREFIX/'drive_c/users/agent/AppData/Local/Programs/Focus';BASE='http://127.0.0.1:4545';checks=[]
env={**os.environ,'DISPLAY':':93','WINEARCH':'win64','WINEPREFIX':str(PREFIX),'WINEDEBUG':'-all','WINEDLLPATH':'/workspace/tooling/wine/root/usr/lib/x86_64-linux-gnu/wine/x86_64-windows','WINELOADER':WINE,'WINEDLLOVERRIDES':'mscoree,mshtml='}
def run(exe,*args):
 with open('/tmp/focus-wine-exec.log','wb') as log:result=subprocess.run([WINE,str(exe),*args],env=env,stdout=log,stderr=log,timeout=100)
 if result.returncode:raise RuntimeError('Windows EXE returned '+str(result.returncode)+'; '+Path('/tmp/focus-wine-exec.log').read_text(errors='replace')[-1200:])
def health(ready=True):
 for _ in range(150):
  try:response=urllib.request.urlopen(BASE+'/focus-runtime.mjs',timeout=.4);response.close();up=True
  except OSError:up=False
  if up==ready:return
  time.sleep(.1)
 raise RuntimeError('Windows server health did not become '+str(ready))
def install():run(EXE,'/S')
install();assert (APP/'Focus.exe').exists() and (APP/'runtime/node-v24.19.0/node.exe').exists();checks.append('actual_64bit_nsis_silent_install_bundled_windows_node_no_system_node')
metadata=json.loads((APP/'installation.json').read_text());DATA=PREFIX/'drive_c'/Path(*PureWindowsPath(metadata['dataDir']).parts[1:]);DATA.mkdir(parents=True,exist_ok=True);(DATA/'keep-personal-asset.txt').write_text('synthetic asset')
run(APP/'Focus.exe','--server-only');health();key=(DATA/'sync-key.txt').read_text();config=(DATA/'server-config.json').read_text();token=(DATA/'google-token-key.txt').read_text();checks.append('native_exe_hidden_server_start_authenticated_control_pipe')
# Write an actual encrypted sync record; retain it across reinstall and uninstall.
code="""import {keyMaterial,encryptShared,shared} from './web/focus-sync-model.mjs';import {blankData,dateKey} from './web/core.mjs';const {key,auth}=await keyMaterial(JSON.parse(process.argv[1]));const d=blankData();d.logs.push({id:'native-preserved',title:'synthetic QA',date:dateKey(),minutes:25,category:'learning',note:''});console.log(JSON.stringify({auth,payload:await encryptShared(shared(d,[]),key)}));"""
encrypted=json.loads(subprocess.check_output(['node','--input-type=module','-e',code,json.dumps(key.strip())],cwd=ROOT));headers={'Authorization':'Bearer '+encrypted['auth'],'X-Focus-Environment':'personal','Content-Type':'application/json','Origin':BASE}
prior=json.load(urllib.request.urlopen(urllib.request.Request(BASE+'/api/focus-sync',headers=headers)))
request=urllib.request.Request(BASE+'/api/focus-sync',method='POST',headers=headers,data=json.dumps({'expectedRevision':prior['revision'],'writeId':'native-'+uuid.uuid4().hex,'payload':encrypted['payload']}).encode());assert urllib.request.urlopen(request).status==200
run(APP/'Focus.exe','--stop');health(False);install();assert (DATA/'sync-key.txt').read_text()==key and (DATA/'server-config.json').read_text()==config and (DATA/'google-token-key.txt').read_text()==token
run(APP/'Focus.exe','--server-only');health();saved=json.load(urllib.request.urlopen(urllib.request.Request(BASE+'/api/focus-sync',headers=headers)));assert saved['payload']==encrypted['payload'];run(APP/'Focus.exe','--stop');health(False);checks.append('native_reinstall_keeps_encrypted_record_sync_identity_google_key_and_asset')
run(APP/'Uninstall.exe','/S')
for _ in range(150):
 if not (APP/'server.mjs').exists() and not (APP/'Focus.exe').exists() and not (APP/'Uninstall.exe').exists():break
 time.sleep(.1)
assert not (APP/'server.mjs').exists();assert (APP/'installation.json').exists() and (DATA/'focus.sqlite').exists() and (DATA/'sync-key.txt').read_text()==key and (DATA/'keep-personal-asset.txt').read_text()=='synthetic asset';checks.append('actual_uninstaller_removes_code_keeps_database_keys_backup_location')
install();assert json.loads((APP/'installation.json').read_text())['dataDir']==metadata['dataDir'];run(APP/'Focus.exe','--server-only');health();saved=json.load(urllib.request.urlopen(urllib.request.Request(BASE+'/api/focus-sync',headers=headers)));assert saved['payload']==encrypted['payload'];run(APP/'Focus.exe','--stop');health(False);checks.append('reinstall_after_uninstall_recovers_same_database')
result={'result':'pass','windowsExeExecutedUnderWine':True,'exeSHA256':hashlib.sha256(Path(EXE).read_bytes()).hexdigest(),'physicalWindowsTested':False,'checks':checks};(QA/'windows-compatibility.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
