/* idk∗wtnt visualizer engine
   A WebGL canvas for the monitor: fourteen scenes that change every 16 bars, coloured from the cover art,
   pulsing on the beat. For your own uploads the beat comes from the real audio; Spotify doesn't let
   websites hear its audio, so for Spotify a tempo clock follows the song's position instead.

   Viz.mount(el)                    put the canvas in an element
   Viz.track({id, cover})           a new song: picks the palette and the first scene
   Viz.clock(() => seconds)         beat from a playback position (Spotify)
   Viz.audio(audioElement)          beat from real audio (uploads)
   Viz.play(true | false)           run / idle
   Viz.set({scene, speed, punch, bpm, palette})   tuning: scene 'auto' or 0-13, palette [[r,g,b] x3] (0-1)
   Viz.SCENES                       the scene names, in number order
*/
(function(){
  const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FS = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;uniform float uTime,uBeat,uBass,uHigh;uniform int uScene;uniform vec3 uC1,uC2,uC3;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p*=2.02;a*=.5;}return v;}
vec3 pal(float t){t=fract(t)*3.;if(t<1.)return mix(uC1,uC2,smoothstep(0.,1.,t));if(t<2.)return mix(uC2,uC3,smoothstep(0.,1.,t-1.));return mix(uC3,uC1,smoothstep(0.,1.,t-2.));}
vec3 tunnel(vec2 uv){float r=length(uv),a=atan(uv.y,uv.x);float z=.3/max(r,.001)+uTime*.6+uBass*.35;
  float rings=smoothstep(.42,.5,abs(fract(z*2.)-.5)*2.);float spokes=smoothstep(.92,1.,abs(sin(a*6.+uTime*.3)));
  vec3 c=pal(z*.25+a*.05)*(rings*.9+spokes*.35);c*=smoothstep(0.,.25,r);c+=pal(uTime*.05)*uBeat*.5*(1.-r);return c;}
vec3 grid(vec2 uv){vec3 c=vec3(0.);float hor=-.05;
  if(uv.y<hor){float d=hor-uv.y;vec2 g=vec2(uv.x/d,1./d+uTime*2.);vec2 f=abs(fract(g*.5)-.5);
    float l=smoothstep(.05+uBeat*.04,0.,min(f.x,f.y)*d*3.);c=uC2*l*(1.-exp(-d*6.));c+=uC1*.15*exp(-d*3.);}
  else{vec2 s=uv-vec2(0.,.25);float sun=smoothstep(.36,.35,length(s));float bands=clamp(step(.5,fract(uv.y*14.-uTime*.5))+step(.3,uv.y),0.,1.);
    c=mix(uC1,uC3,uv.y*1.5)*sun*bands*(1.+uBeat*.6);c+=uC1*.25*exp(-abs(uv.y-hor)*12.);}
  return c;}
vec3 flow(vec2 uv){vec2 p=uv*2.;float t=uTime*.15;vec2 q=vec2(fbm(p+t),fbm(p+vec2(5.2,1.3)-t));
  float f=fbm(p+3.*q+uBass*.6);vec3 c=pal(f+t*.3)*(f*1.5);c+=uC3*pow(f,4.)*uBeat*1.8;return c;}
vec3 kaleido(vec2 uv){float r=length(uv),a=atan(uv.y,uv.x);float n=8.;a=mod(a,6.2832/n);a=abs(a-3.1416/n);
  vec2 p=r*vec2(cos(a),sin(a));p.x-=uTime*.2;float s=abs(sin(p.x*10.+uTime))*abs(cos(p.y*14.));
  float ray=smoothstep(.025,0.,abs(p.y-.02*sin(p.x*20.+uTime*3.)));
  vec3 c=pal(p.x+r)*s*(1.2-r)+uC3*ray*(.6+uBeat);c*=1.+uBeat*.4;return c;}
vec2 h2(vec2 p){p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));return fract(sin(p)*43758.5453);}
vec3 ink(vec2 uv){vec2 p=uv*1.6;float t=uTime*.08;vec2 q=vec2(fbm(p+vec2(0.,t)),fbm(p+vec2(3.1,-t)));
  vec2 r=vec2(fbm(p+4.*q+vec2(1.7,9.2)+.15*t),fbm(p+4.*q+vec2(8.3,2.8)-.12*t));float f=fbm(p+4.*r+uBass*.5);
  vec3 c=mix(vec3(0.),pal(f*.8+t),smoothstep(.35,.9,f));c+=uC3*smoothstep(.75,1.1,length(r))*(.4+uBeat);return c*1.3;}
vec3 caustics(vec2 uv){vec2 p=mod(uv*7.54+vec2(0.,uTime*.15),6.2831)-250.;vec2 i=p;float c=1.;
  for(int n=0;n<5;n++){float t=uTime*.5*(1.-3.5/float(n+1));i=p+vec2(cos(t-i.x)+sin(t+i.y),sin(t-i.y)+cos(t+i.x));
    c+=1./length(vec2(p.x/(sin(i.x+t)/.005),p.y/(cos(i.y+t)/.005)));}
  c/=5.;c=1.17-pow(c,1.4);float v=clamp(pow(abs(c),8.),0.,1.);return uC1*.1+pal(v*.5+uTime*.03)*v*(1.+uBeat*.7);}
vec3 lava(vec2 uv){vec2 p=uv*2.5+vec2(0.,-uTime*.1);float f=0.,a=.5;
  for(int i=0;i<5;i++){f+=a*pow(1.-abs(noise(p)*2.-1.),3.);p=p*2.03+vec2(uTime*.05);a*=.5;}
  return pal(f*.6)*pow(f,2.5)*(1.6+uBeat)+uC3*pow(f,6.)*2.;}
vec3 curtains(vec2 uv){vec3 c=vec3(0.);
  for(int i=0;i<3;i++){float fi=float(i);float x=uv.x*1.5+fi*.7;float w=fbm(vec2(x*1.2,uTime*.12+fi));
    float y=uv.y+.25-w*.7+fi*.1;float rays=.55+.45*fbm(vec2(x*9.,uTime*.3+fi));
    float k=y>0.?exp(-y*3.2):exp(-pow(y*14.,2.));c+=pal(fi*.33+x*.1+uTime*.02)*k*rays*(.6+uBeat*.6);}
  c+=step(.996,hash(floor(gl_FragCoord.xy*.5)))*.5;return c;}
vec3 cells(vec2 uv){vec2 p=uv*4.;p+=vec2(fbm(p*.5+uTime*.1),fbm(p*.5-uTime*.1))*.6;vec2 ip=floor(p),fp=fract(p);float d1=8.,d2=8.;
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 g=vec2(float(i),float(j));vec2 o=.5+.5*sin(uTime*.6+6.2831*h2(ip+g));
    vec2 r=g+o-fp;float d=dot(r,r);if(d<d1){d2=d1;d1=d;}else if(d<d2){d2=d;}}
  float e=sqrt(d2)-sqrt(d1);float vein=smoothstep(.08+uBeat*.06,0.,e);
  return pal(sqrt(d1)+uTime*.05)*(.12+.3*(1.-sqrt(d1)))+uC3*vein*(.8+uBeat);}
vec3 topo(vec2 uv){vec2 p=uv*1.5;float f=fbm(p+vec2(uTime*.05,0.)+fbm(p*1.5-uTime*.04));
  float l=abs(fract(f*12.-uTime*.2)-.5);return pal(f*1.5)*smoothstep(.09,.02,l)*(.8+uBeat*.7)+pal(f)*.06;}
vec3 truchet(vec2 uv){vec2 p=uv*6.;p.y+=uTime*.3;vec2 ip=floor(p),fp=fract(p)-.5;
  if(hash(ip+floor(uTime*.25))>.5)fp.x=-fp.x;float d=min(abs(length(fp-.5)-.5),abs(length(fp+.5)-.5));
  return pal(hash(ip)*.5+uTime*.03)*smoothstep(.09+uBeat*.05,.04,d)+uC1*.04;}
vec3 moire(vec2 uv){float r1=length(uv-vec2(.25*sin(uTime*.3),.15*cos(uTime*.4)));float r2=length(uv+vec2(.25*sin(uTime*.27),.15*cos(uTime*.35)));
  float m=sin(r1*60.-uTime*2.)*sin(r2*60.+uTime*1.5);return pal(m*.3+uTime*.04)*smoothstep(0.,.9,m)*(1.+uBeat*.8);}
float hexd(vec2 p){p=abs(p);return max(dot(p,normalize(vec2(1.,1.73))),p.x);}
vec3 hexes(vec2 uv){vec2 p=uv*7.;vec2 r=vec2(1.,1.73),h=r*.5;vec2 a=mod(p,r)-h,b=mod(p-h,r)-h;vec2 g=dot(a,a)<dot(b,b)?a:b;vec2 id=p-g;
  float edge=.5-hexd(g);float dist=length(id)/7.;float wave=sin(dist*8.-uTime*3.)*.5+.5;float lit=smoothstep(.7,1.,wave)+uBeat*exp(-dist*2.);
  return pal(dist+uTime*.05)*(smoothstep(0.,.05,edge)*lit*.9+smoothstep(.05,0.,edge)*.25);}
vec3 opart(vec2 uv){float w=sin(uv.x*3.+uTime*.6)*.15+sin(uv.y*2.+uTime*.4)*.1+fbm(uv*1.5+uTime*.1)*.3;
  float l=smoothstep(-.2,.2,sin((uv.y+w)*40.+uBass*2.));return mix(uC1*.08,pal(uv.x*.3+uTime*.05)*(1.+uBeat*.5),l);}
void main(){vec2 uv=(gl_FragCoord.xy-.5*uRes)/uRes.y;uv*=1.-uBeat*.04;vec3 c;
  if(uScene==0)c=tunnel(uv);else if(uScene==1)c=grid(uv);else if(uScene==2)c=flow(uv);else if(uScene==3)c=kaleido(uv);
  else if(uScene==4)c=ink(uv);else if(uScene==5)c=caustics(uv);else if(uScene==6)c=lava(uv);else if(uScene==7)c=curtains(uv);
  else if(uScene==8)c=cells(uv);else if(uScene==9)c=topo(uv);else if(uScene==10)c=truchet(uv);else if(uScene==11)c=moire(uv);
  else if(uScene==12)c=hexes(uv);else c=opart(uv);
  c+=uHigh*.06*hash(gl_FragCoord.xy+uTime);c*=1.-.35*dot(uv*.8,uv*.8);gl_FragColor=vec4(c,1.);}`;

  const SCENES = ['tunnel','grid','flow','kaleido','ink','caustics','lava','curtains','cells','topo','truchet','moire','hexes','op-art'];
  const S = { gl:null, cv:null, u:{}, run:false, raf:0, t0:performance.now(), time:0, last:0,
    pal:[[.16,.43,1],[.12,.86,.78],[.31,1,.47]], base:0, cfg:{ scene:'auto', speed:1, punch:1, bpm:124 }, getPos:null, an:null, data:null, avg:0, env:0, lastHit:0, bpm:124 };

  function compile(gl, type, src){ const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }

  function mount(el, size){
    if (S.gl) return true;
    const cv = document.createElement('canvas'); cv.width = (size && size.w) || 640; cv.height = (size && size.h) || 360; cv.className = 'viz-canvas';
    const gl = cv.getContext('webgl', { antialias:false, alpha:false, powerPreference:'low-power' });
    if (!gl) return false;
    try {
      const pr = gl.createProgram();
      gl.attachShader(pr, compile(gl, gl.VERTEX_SHADER, VS)); gl.attachShader(pr, compile(gl, gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
      gl.useProgram(pr);
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      ['uRes','uTime','uBeat','uBass','uHigh','uScene','uC1','uC2','uC3'].forEach(n => S.u[n] = gl.getUniformLocation(pr, n));
      gl.uniform2f(S.u.uRes, cv.width, cv.height);
    } catch (e) { console.warn('viz', e); return false; }
    S.gl = gl; S.cv = cv; el.prepend(cv);   // under the now-playing text
    document.addEventListener('visibilitychange', () => { if (!document.hidden && S.run) loop(); });
    return true;
  }

  // three colours from the cover: the most colourful pixels of a tiny copy, brightened
  function palette(url){
    if (!url) return;
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = c.height = 12; const x = c.getContext('2d');
        x.drawImage(img, 0, 0, 12, 12); const d = x.getImageData(0, 0, 12, 12).data, px = [];
        for (let i = 0; i < d.length; i += 4){
          const r = d[i] / 255, g = d[i+1] / 255, b = d[i+2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          px.push({ c:[r, g, b], s:(mx - mn) * (0.4 + mx) });
        }
        px.sort((a, b) => b.s - a.s);
        const pick = [px[0], px[Math.floor(px.length * .08)], px[Math.floor(px.length * .2)]].map(p => {
          const m = Math.max(...p.c, .001), k = Math.min(1.6, 1 / m); return p.c.map(v => Math.min(1, v * k));
        });
        if (px[0].s > .08){ S.pal = pick; if (S.onPalette) S.onPalette(pick); }
      } catch (e) { /* the image server didn't allow reading its pixels: keep the current colours */ }
    };
    img.src = url;
  }

  function track(info){
    let h = 0; const id = String(info && (info.id || info.cover) || Math.random()); for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
    S.base = Math.abs(h) % SCENES.length; S.env = 0;
    if (info && info.cover) palette(info.cover);
  }
  function clock(getPos){ S.getPos = getPos; S.an = null; }
  let ctx = null, srcNode = null;
  function audio(el){
    try {
      if (!ctx){ ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      if (!srcNode){ srcNode = ctx.createMediaElementSource(el); const an = ctx.createAnalyser(); an.fftSize = 512; an.smoothingTimeConstant = .75;
        srcNode.connect(an); an.connect(ctx.destination); S.analyser = an; S.data = new Uint8Array(an.frequencyBinCount); }
      if (ctx.state === 'suspended') ctx.resume();
      S.an = S.analyser; S.getPos = () => el.currentTime;
    } catch (e) { console.warn('viz audio', e); }
  }
  function play(on){ S.run = !!on; if (S.run) loop(); }

  function loop(){
    cancelAnimationFrame(S.raf);
    S.raf = requestAnimationFrame(frame);
  }
  function frame(now){
    const gl = S.gl; if (!gl) return;
    const dt = Math.min(.1, (now - (S.last || now)) / 1000); S.last = now;
    // if the monitor isn't on screen, draw slowly
    if (!S.cv.isConnected || document.hidden) return;
    let beat = 0, bass = 0, high = .3, pos = S.getPos ? S.getPos() : now / 1000;
    if (S.run && S.an){
      S.an.getByteFrequencyData(S.data);
      let lo = 0, hi = 0; for (let i = 1; i < 8; i++) lo += S.data[i]; for (let i = 60; i < 140; i++) hi += S.data[i];
      lo /= 7 * 255; hi /= 80 * 255; S.avg = S.avg * .95 + lo * .05;
      if (lo > S.avg * 1.25 && lo > .35 && now - S.lastHit > 260){ S.env = 1; S.lastHit = now; }
      S.env *= Math.pow(.02, dt); beat = S.env; bass = lo; high = hi; S.level = lo;
    } else if (S.run){
      const ph = pos * S.cfg.bpm / 60; beat = Math.exp(-(ph % 1) * 5); bass = beat * .8; high = .4 + .3 * Math.sin(ph * 3.1);
    }
    beat = Math.min(2, beat * S.cfg.punch); bass *= S.cfg.punch; S.beat = beat;
    S.time += dt * (S.run ? 1 : .15) * S.cfg.speed;
    const bars = Math.floor(Math.max(0, pos) * S.cfg.bpm / 60 / 64);
    gl.uniform1f(S.u.uTime, S.time); gl.uniform1f(S.u.uBeat, beat); gl.uniform1f(S.u.uBass, bass); gl.uniform1f(S.u.uHigh, high);
    S.scene = S.cfg.scene === 'auto' ? (S.base + bars) % SCENES.length : +S.cfg.scene;
    gl.uniform1i(S.u.uScene, S.scene);
    gl.uniform3fv(S.u.uC1, S.pal[0]); gl.uniform3fv(S.u.uC2, S.pal[1]); gl.uniform3fv(S.u.uC3, S.pal[2]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (S.run) S.raf = requestAnimationFrame(frame);
  }

  function set(c){ Object.assign(S.cfg, c || {}); if (c && c.palette) S.pal = c.palette; if (S.gl && !S.run) loop(); }
  function size(w, h){ if (!S.gl) return; S.cv.width = w; S.cv.height = h; S.gl.viewport(0, 0, w, h); S.gl.uniform2f(S.u.uRes, w, h); if (!S.run) loop(); }
  function state(){ return { ...S.cfg, palette: S.pal, scene_now: S.scene, beat: S.beat || 0, level: S.level || 0 }; }
  window.Viz = { SCENES, mount, track, clock, audio, play, set, state, size, onPalette(fn){ S.onPalette = fn; }, get running(){ return S.run; } };
})();
