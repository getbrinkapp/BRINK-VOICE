"""Extract the supplied outlined PDF into SVG, preserving paths and source colors.
Requires pypdf; no raster tracing or fonts. Run from the project root.
"""
from pathlib import Path
from pypdf import PdfReader
from xml.sax.saxutils import escape

page = PdfReader('build/branding/voice-logo-source.pdf').pages[0]
height = float(page.mediabox.height)
paths = []
commands = []
color = 'black'
points = []

def num(value):
    return format(float(value), '.8g')

for args, op in page.get_contents().operations:
    if op == b'gs':
        state = page['/Resources']['/ExtGState'][args[0]].get_object()
        assert state.get('/SMask', '/None') == '/None'
    elif op == b'rg':
        color = 'rgb(' + ' '.join(num(float(v)*100)+'%' for v in args) + ')'
    elif op in (b'm', b'l', b'c'):
        commands.append(op.decode().upper() + ' '.join(num(v) for v in args))
        points.extend((float(args[i]), height-float(args[i+1])) for i in range(0,len(args),2))
    elif op == b'h':
        commands.append('Z')
    elif op == b're':
        x,y,w,h=map(float,args)
        commands.append(f'M{num(x)} {num(y)}h{num(w)}v{num(h)}h{num(-w)}Z')
        points.extend([(x,height-y),(x+w,height-y-h)])
    elif op == b'f*':
        paths.append((color,' '.join(commands),list(points)))
        commands=[];points=[]
    else:
        raise ValueError(f'Unsupported source operator: {op!r}')
assert len(paths)==3, 'The supplied logo contains background, waveform and wordmark paths.'

def svg(selected, padding=0):
    pts=[p for _,_,points in selected for p in points]
    x0=min(x for x,y in pts);y0=min(y for x,y in pts)
    x1=max(x for x,y in pts);y1=max(y for x,y in pts)
    dx=(x1-x0)*padding;dy=(y1-y0)*padding
    box=' '.join(num(v) for v in [x0-dx,y0-dy,x1-x0+2*dx,y1-y0+2*dy])
    body='\n'.join(f'<path fill="{color}" fill-rule="evenodd" d="{escape(d)}"/>' for color,d,_ in selected)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{box}"><g transform="translate(0 {num(height)}) scale(1 -1)">\n{body}\n</g></svg>\n'

for filename,selected,padding in [('voice-logo.svg',paths,0),('voice-mark.svg',paths[:2],0),('voice-wordmark.svg',paths[2:],0)]:
    Path('app/assets/'+filename).write_text(svg(selected,padding))
Path('build/branding/voice-app-icon.svg').write_text(svg(paths[:2],.1))
print('Extracted official icon and wordmark as SVG paths.')
