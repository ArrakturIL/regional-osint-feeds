"""Publish a collector commit without overwriting concurrent collector updates."""
import subprocess,time
from pathlib import Path

def publish(repo=Path('.')):
    def git(*args,check=True):
        return subprocess.run(['git','-C',str(repo),*args],check=check)
    for attempt in range(3):
        if git('push','origin','HEAD:main',check=False).returncode==0:return
        if attempt==2:raise RuntimeError('CENTCOM publish failed after three non-force attempts')
        git('fetch','origin','main')
        if git('rebase','origin/main',check=False).returncode:
            git('rebase','--abort')
            raise RuntimeError('Conflicting edits: original collector commit retained; no overwrite')
        time.sleep(attempt+1)

if __name__=='__main__':publish()

