import subprocess,tempfile,unittest
from pathlib import Path
from scripts.centcom_writeback import publish

def git(folder,*args):
    return subprocess.check_output(['git','-C',str(folder),*args],stderr=subprocess.STDOUT,text=True).strip()

class WritebackTest(unittest.TestCase):
    def test_competing_collector_commit_is_preserved(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as tmp:
            root=Path(tmp);remote=root/'remote.git';first=root/'centcom';other=root/'other'
            subprocess.run(['git','init','--bare',str(remote)],check=True,capture_output=True)
            subprocess.run(['git','clone',str(remote),str(first)],check=True,capture_output=True)
            git(first,'config','user.name','test');git(first,'config','user.email','test@example.invalid')
            git(first,'switch','-c','main');(first/'base').write_text('base')
            git(first,'add','.');git(first,'commit','-m','base');git(first,'push','origin','main')
            subprocess.run(['git','clone','--branch','main',str(remote),str(other)],check=True,capture_output=True)
            git(other,'config','user.name','test');git(other,'config','user.email','test@example.invalid')
            (first/'centcom-status.json').write_text('new heartbeat');git(first,'add','.');git(first,'commit','-m','CENTCOM heartbeat')
            (other/'analysts.json').write_text('other collector');git(other,'add','.');git(other,'commit','-m','analyst update');git(other,'push','origin','main')
            publish(first)
            git(other,'pull','--ff-only');self.assertEqual((other/'analysts.json').read_text(),'other collector')
            self.assertEqual((other/'centcom-status.json').read_text(),'new heartbeat')

if __name__=='__main__':unittest.main()

