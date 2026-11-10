"""Start the exact built package and stop it after the requested checks."""
import subprocess,sys,time,urllib.request
from pathlib import Path
root=Path(__file__).resolve().parent.parent
server=subprocess.Popen(['node','server.mjs'],cwd=root/'focus-test',stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
try:
 for _ in range(100):
  if server.poll() is not None:raise RuntimeError(server.stderr.read().decode())
  try:
   urllib.request.urlopen('http://127.0.0.1:4545/focus.html',timeout=.2).close();break
  except OSError:time.sleep(.05)
 else:raise RuntimeError('Focus server did not start')
 for script in sys.argv[1:]:
  parts=script.split(':');subprocess.run(['python','tests/'+parts[0]+'.py',*parts[1:]],cwd=root,check=True)
finally:
 server.terminate()
 try:server.wait(timeout=5)
 except subprocess.TimeoutExpired:server.kill();server.wait()
