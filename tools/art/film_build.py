# Cut a story film from animated shots (run in the Higgsfield sandbox; see README "Story films").
# python3 film_build.py NAME "clip:seconds,clip:seconds,..." [narration.wav offset]
# Clips are read from vid/<clip>.mp4; each shot shows for `seconds` (1 s crossfades sit on the
# boundaries; a clip too short for its slot is slowed to fit). Output: out/NAME.mp4.
import subprocess, sys
X = 1.0
name, spec = sys.argv[1], sys.argv[2]
aud = sys.argv[3] if len(sys.argv) > 3 else None
off = float(sys.argv[4]) if len(sys.argv) > 4 else 0
shots = [(s.split(':')[0], float(s.split(':')[1])) for s in spec.split(',')]
def dur(p):
    return float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',p]))
ins, fl = [], []
n = len(shots)
for i, (c, sec) in enumerate(shots):
    need = sec + (X if i < n - 1 else 0)
    have = dur(f'vid/{c}.mp4') - 0.1
    k = max(1.0, need / have)
    ins += ['-i', f'vid/{c}.mp4']
    fl.append(f'[{i}:v]setpts={k:.4f}*(PTS-STARTPTS),fps=24,scale=1280:720:flags=lanczos,setsar=1,trim=0:{need:.3f},setpts=PTS-STARTPTS,format=yuv420p[v{i}]')
cur, t = 'v0', shots[0][1]
for i in range(1, n):
    fl.append(f'[{cur}][v{i}]xfade=transition=fade:duration={X}:offset={t:.3f}[x{i}]')
    cur, t = f'x{i}', t + shots[i][1]
total = t
fl.append(f'[{cur}]fade=t=in:st=0:d=1.2,fade=t=out:st={total-1.4:.3f}:d=1.4[vout]')
cmd = ['ffmpeg','-v','error','-y'] + ins
maps = ['-map','[vout]']
if aud:
    cmd += ['-i', aud]
    ms = int(off * 1000)
    fl.append(f'[{n}:a]adelay={ms}|{ms},apad,atrim=0:{total:.3f},afade=t=out:st={total-1.0:.3f}:d=1.0[aout]')
    maps += ['-map','[aout]','-c:a','aac','-b:a','128k','-ac','2']
cmd += ['-filter_complex', ';'.join(fl)] + maps + ['-c:v','libx264','-preset','veryfast','-crf','24','-movflags','+faststart','-t',f'{total:.3f}',f'out/{name}.mp4']
subprocess.check_call(cmd)
print(name, round(total,2), round(dur(f'out/{name}.mp4'),2))
