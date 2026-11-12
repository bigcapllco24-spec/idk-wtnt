/* idk∗wtnt visualizer engine
   A WebGL canvas for the monitor: four scenes that change every 16 bars, coloured from the cover art,
   pulsing on the beat. For your own uploads the beat comes from the real audio; Spotify doesn't let
   websites hear its audio, so for Spotify a tempo clock follows the song's position instead.

   Viz.mount(el)                    put the canvas in an element
   Viz.track({id, cover})           a new song: picks the palette and the first scene
   Viz.clock(() => seconds)         beat from a playback position (Spotify)
   Viz.audio(audioElement)          beat from real audio (uploads)
   Viz.play(true | false)           run / idle
*/
(function(){
  const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FS = `precision mediump float;
uniform vec2 uRes;uniform float uTime,uBeat,uBass,uHigh;uniform int uScene;uniform vec3 uC1,uC2,uC3;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p*=2.02;a*=.5;}return v;}
vec3 pal(float t){t=fract(t);return t<.5?mix(uC1,uC2,t*2.):mix(uC2,uC3,(t-.5)*2.);}
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
void main(){vec2 uv=(gl_FragCoord.xy-.5*uRes)/uRes.y;uv*=1.-uBeat*.04;vec3 c;
  if(uScene==0)c=tunnel(uv);else if(uScene==1)c=grid(uv);else if(uScene==2)c=flow(uv);else c=kaleido(uv);
  c+=uHigh*.06*hash(gl_FragCoord.xy+uTime);c*=1.-.35*dot(uv*.8,uv*.8);gl_FragColor=vec4(c,1.);}`;

  const S = { gl:null, cv:null, u:{}, run:false, raf:0, t0:performance.now(), time:0, last:0,
    pal:[[.16,.43,1],[.12,.86,.78],[.31,1,.47]], base:0, getPos:null, an:null, data:null, avg:0, env:0, lastHit:0, bpm:124 };

  function compile(gl, type, src){ const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }

  function mount(el){
    if (S.gl) return true;
    const cv = document.createElement('canvas'); cv.width = 640; cv.height = 360; cv.className = 'viz-canvas';
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
        if (px[0].s > .08) S.pal = pick;
      } catch (e) { /* the image server didn't allow reading its pixels: keep the current colours */ }
    };
    img.src = url;
  }

  function track(info){
    let h = 0; const id = String(info && (info.id || info.cover) || Math.random()); for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
    S.base = Math.abs(h) % 4; S.env = 0;
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
      S.env *= Math.pow(.02, dt); beat = S.env; bass = lo; high = hi;
    } else if (S.run){
      const ph = pos * S.bpm / 60; beat = Math.exp(-(ph % 1) * 5); bass = beat * .8; high = .4 + .3 * Math.sin(ph * 3.1);
    }
    S.time += dt * (S.run ? 1 : .15);
    const bars = Math.floor(Math.max(0, pos) * S.bpm / 60 / 64);
    gl.uniform1f(S.u.uTime, S.time); gl.uniform1f(S.u.uBeat, beat); gl.uniform1f(S.u.uBass, bass); gl.uniform1f(S.u.uHigh, high);
    gl.uniform1i(S.u.uScene, (S.base + bars) % 4);
    gl.uniform3fv(S.u.uC1, S.pal[0]); gl.uniform3fv(S.u.uC2, S.pal[1]); gl.uniform3fv(S.u.uC3, S.pal[2]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (S.run) S.raf = requestAnimationFrame(frame);
  }

  window.Viz = { mount, track, clock, audio, play, get running(){ return S.run; } };
})();
