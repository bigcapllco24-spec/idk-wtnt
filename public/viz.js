/* idk∗wtnt visualizer engine
   A WebGL canvas for the monitor: seventeen scenes (three of them stick-figure dancers, in five sceneries), one per song, in one of eight colour sets, coloured from the cover art,
   pulsing on the beat. For your own uploads the beat comes from the real audio; Spotify doesn't let
   websites hear its audio, so for Spotify a tempo clock follows the song's position instead.

   Viz.mount(el)                    put the canvas in an element
   Viz.track({id, cover})           a new song: picks the palette and the first scene
   Viz.clock(() => seconds)         beat from a playback position (Spotify)
   Viz.audio(audioElement)          beat from real audio (uploads)
   Viz.play(true | false)           run / idle
   Viz.set({scene, speed, punch, bpm, palette})   tuning: scene 'auto' or 0-16, palette [[r,g,b] x3] (0-1)
   Viz.SCENES                       the scene names, in number order
   Viz.SETS                         the colour sets [{name, hex:[3]}]
   Viz.song(info, {first, onDark})  a new song: fade out over 2 beats, pick its scene and colours, fade back in
   Viz.shuffle(onSwap)              mid-song: a different scene (and scenery) now, with a quick dip; colours stay
   Viz.prefs({colours, scene, scenery})  colours: 'auto' or a set index; scene: 'shuffle' or 'lock' (keeps the current one);
                                    scenery (behind the stick figures): 'auto' (new each song) or an index into Viz.SCENERY
   Viz.now()                        {scene, set} names for what's showing
*/
(function(){
  const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FS = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;uniform float uTime,uBeat,uBass,uHigh,uFade,uPhase;uniform int uScene,uBg;uniform vec3 uC1,uC2,uC3;
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
vec3 caustics(vec2 uv){vec2 p=mod(uv*3.6+vec2(0.,uTime*.15),6.2831)-250.;vec2 i=p;float c=1.;
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

/* ---- stick figures: one dancer, its pose worked out from the beat (uPhase counts beats) ---- */
float sgd(vec2 p,vec2 a,vec2 b){vec2 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);return length(pa-ba*h);}
vec2 dir(float a){return vec2(sin(a),cos(a));}
float leg(vec2 p,vec2 h,vec2 f,float s){vec2 v=f-h;float L=min(length(v),.499);vec2 n=normalize(v);
  vec2 k=h+n*L*.5+vec2(-n.y,n.x)*s*sqrt(max(0.,.0625-L*L*.25));return min(sgd(p,h,k),sgd(p,k,h+n*L));}
float fig(vec2 p,float ph,float mv){
  float d=exp(-fract(ph)*4.),s=sin(ph*3.1416),sg=step(.5,fract(ph*.25))*2.-1.;
  vec2 hip=vec2(.03*s,.46-.06*d),fl=vec2(-.11,0.),fr=vec2(.11,0.);float lean=.1*s;
  float ua=1.2,fa=.4,ub=-1.2,fb=-.4;
  if(mv<.5){ua=mix(1.7,.2,d);fa=mix(-.3,.1,d);ub=-2.5;fb=2.4;}                                  // fist pump
  else if(mv<1.5){ua=.5+.4*s;fa=.15+.7*s;ub=-.5+.4*s;fb=-.15+.7*s;hip.x=.05*s;}                    // hands up, sway
  else if(mv<2.5){ua=2.3+.5*s;fa=1.1+.6*s;ub=-2.3+.5*s;fb=-1.1+.6*s;                               // shuffle
    fr.y=.08*max(0.,s);fl.y=.08*max(0.,-s);fr.x+=.05*s;fl.x+=.05*s;}
  else if(mv<3.5){hip.x=.04*sg;lean=.12*sg;fr.x+=.05*max(0.,sg);fl.x-=.05*max(0.,-sg);              // disco point
    if(sg>0.){ua=.5;fa=.45;ub=-2.5;fb=2.4;}else{ub=-.5;fb=-.45;ua=2.5;fa=-2.4;}}
  else{float j=.12*(1.-pow(2.*fract(ph)-1.,2.));ua=.45-.25*d;fa=.3;ub=-.45+.25*d;fb=-.3;           // jump
    hip.y=.44+j;fl.y=fr.y=j*.55;}
  vec2 nk=hip+.3*dir(lean),hc=nk+.1*dir(lean*1.4),sh=hip+.27*dir(lean);
  vec2 er=sh+.16*dir(ua),el=sh+.16*dir(ub);
  float r=min(sgd(p,hip,nk),abs(length(p-hc)-.065));
  r=min(r,min(sgd(p,sh,er),sgd(p,er,er+.15*dir(fa))));
  r=min(r,min(sgd(p,sh,el),sgd(p,el,el+.15*dir(fb))));
  return min(r,min(leg(p,hip,fr,1.),leg(p,hip,fl,-1.)));}
float lw(){return max(.0045,1.6/uRes.y);}

/* ---- scenery behind the stick figures (uBg): 0 club (each scene's own stage), 1 city, 2 beach, 3 forest, 4 space ---- */
vec3 scenery(vec2 uv,float hz){vec3 c=vec3(0.);float up=uv.y-hz;
  if(uBg==1){                                                         // city rooftop at night
    c=mix(pal(.15)*.22,uC1*.03,clamp(up*1.6,0.,1.));
    c+=vec3(1.,.97,.9)*(smoothstep(.062,.058,length(uv-vec2(.62,.3)))+exp(-length(uv-vec2(.62,.3))*9.)*.12);
    for(int L=0;L<2;L++){float fl=float(L),w=mix(.075,.12,fl),x=uv.x/w+fl*3.7+uTime*.01*(fl+1.),id=floor(x);
      float top=hz+.03+hash(vec2(id,fl+2.))*mix(.44,.22,fl);
      if(uv.y<top){c=mix(uC1*.06,vec3(.008),fl);
        vec2 wp=vec2(fract(x)*w/mix(.018,.026,fl),up/mix(.026,.036,fl)),wi=floor(wp),wf=fract(wp);
        float on=step(.58,hash(wi+vec2(id*7.,fl*3.)))*step(.12,fract(x))*step(fract(x),.88)*step(.25,wf.x)*step(wf.x,.75)*step(.3,wf.y)*step(wf.y,.8);
        c+=pal(hash(wi+id)*.5+uTime*.02)*on*mix(.4,.7,fl)*(1.+uBeat*step(.85,hash(wi+id+3.)));}}
    if(up<0.)c=vec3(.012)+uC1*.04*exp(up*8.);}
  else if(uBg==2){                                                    // beach at sunset
    c=mix(pal(.62)*.75,uC1*.12,smoothstep(0.,.75,up));vec2 sp=uv-vec2(0.,hz+.1);
    float sun=smoothstep(.2,.195,length(sp))*(sp.y>0.?1.:step(.45,fract(uv.y*34.-uTime*.4)));c=mix(c,mix(uC3,pal(.5),.3)*1.2,sun*step(0.,up));
    for(int i=0;i<2;i++){float fi=float(i);vec2 pp=uv-vec2(mix(-.72,.78,fi),hz);if(fi>.5)pp.x=-pp.x;             // two palms
      float tr=sgd(pp,vec2(0.),vec2(.05+.02*sin(uTime*.5),.42));float lv=9.;
      for(int k=0;k<5;k++){float a=-1.9+float(k)*.85+.08*sin(uTime*.9+float(k));vec2 t=vec2(.05,.42);lv=min(lv,sgd(pp,t,t+.2*vec2(sin(a),cos(a))-vec2(0.,.05)));}
      c=mix(c,vec3(.01),smoothstep(.014,.008,tr)+smoothstep(.012,.006,lv)-smoothstep(.014,.008,tr)*smoothstep(.012,.006,lv));}
    if(up<0.){float sea=up>-.09?1.:0.;float st=exp(-abs(uv.x)*5.)*step(.55,noise(vec2(uv.x*7.,uv.y*90.+uTime*2.)));
      c=sea>0.?uC1*.12+mix(uC3,pal(.5),.3)*st*.7:mix(pal(.62)*.18,vec3(.02),clamp(-(up+.09)*3.,0.,1.));}}
  else if(uBg==3){                                                    // forest with fireflies
    c=mix(pal(.3)*.16,vec3(.004),clamp(up*1.3,0.,1.));c+=vec3(.9,.95,1.)*exp(-length(uv-vec2(-.55,.3))*7.)*.18;
    for(int L=0;L<3;L++){float fl=float(L),w=mix(.07,.16,fl/2.),x=uv.x/w+fl*1.9,id=floor(x),fx=fract(x)-.5;
      float top=hz+mix(.38,.22,fl/2.)+hash(vec2(id,fl))*.18,y=top-uv.y;
      float pine=y>0.&&uv.y>hz-.05?step(abs(fx)*w*mix(3.2,2.4,fl/2.),y*(.75+.25*step(.5,fract(y/w*2.5)))):0.;
      c=mix(c,pal(.3)*mix(.07,.0,fl/2.)+vec3(.004),pine);}
    vec2 g=uv*7.;vec2 gi=floor(g);vec2 o=.5+.38*vec2(sin(uTime*.7+hash(gi)*6.3),cos(uTime*.5+hash(gi+1.)*6.3));
    float ff=exp(-length(fract(g)-o)*28.)*step(.55,hash(gi+5.))*(.5+.5*sin(uTime*2.+hash(gi)*9.+uBeat*2.));c+=mix(uC3,vec3(.9,1.,.5),.4)*ff*1.2;
    if(up<0.)c=mix(c,vec3(.01)+pal(.3)*.03,step(up,-.04));}
  else{                                                               // space, on a little moon
    vec2 g=floor(uv*uRes.y*.5);float st=step(.994,hash(g))*(.5+.5*sin(uTime*2.+hash(g+1.)*20.));
    c=vec3(st)+pal(fbm(uv*2.+uTime*.02)*1.2)*pow(fbm(uv*2.5+vec2(uTime*.01,0.)),3.)*.9;
    vec2 pp=uv-vec2(.5,.22);float pr=length(pp);float pl=smoothstep(.17,.165,pr);
    c=mix(c,pal(.4+pp.y*2.)*(.25+.75*clamp(dot(normalize(vec3(pp,sqrt(max(0.,.0289-pr*pr)))),normalize(vec3(-.6,.5,.6))),0.,1.)),pl);
    vec2 rp=pp*mat2(.94,.34,-.34,.94);float ring=abs(length(rp*vec2(1.,4.))-.27);c+=uC3*smoothstep(.02,.0,ring)*(rp.y<0.||pr>.17?1.:0.)*.8;
    if(up<0.)c=vec3(.05)+.04*noise(uv*vec2(14.,40.))+pal(.4)*.03-.04*smoothstep(.03,.0,abs(length((uv-vec2(-.3,hz-.1))*vec2(1.,3.))-.12));}
  return c;}
vec3 dancers(vec2 uv){vec3 c=vec3(0.);float fy=-.34,w=lw();
  if(uBg>0)c=scenery(uv,fy+.06);else for(int i=0;i<3;i++){float fi=float(i);vec2 q=uv-vec2((fi-1.)*.62+.15*sin(uTime*.4+fi*2.),.62);
    c+=pal(fi*.33+uTime*.03)*smoothstep(.3,0.,abs(atan(q.x,-q.y)))*.16*(1.+uBeat*.8)*smoothstep(-.6,.5,uv.y);}
  vec2 p=uv;float rf=1.;if(p.y<fy){p.y=2.*fy-p.y;rf=.3*smoothstep(-.62,fy,uv.y);}
  float sc=.5,mb=floor(uPhase/16.);
  for(int i=0;i<5;i++){float fi=float(i),k=abs(fi-2.);vec2 q=(p-vec2((fi-2.)*.35,fy))/sc;if(fi<2.)q.x=-q.x;
    float d=fig(q,uPhase,mod(mb+k,5.))*sc;
    c+=pal(k*.3+uTime*.04)*(smoothstep(w,w*.4,d)*1.3+exp(-d*55.)*.35)*rf*(1.+uBeat*.3);}
  return c+uC2*smoothstep(.004,0.,abs(uv.y-fy))*(uBg>0?.12:.35);}
vec3 solo(vec2 uv){vec3 c=vec3(0.);float r=length(uv-vec2(0.,-.05)),w=lw()*1.4;
  float f=fract(r*3.-uPhase*.5);if(uBg>0)c=scenery(uv,-.36)*.85;else c+=pal(r+uTime*.05)*exp(-f*10.)*.22*smoothstep(1.,.1,r);
  float mv=mod(floor(uPhase/8.),5.),sc=.78;vec2 q=(uv-vec2(0.,-.43))/sc;
  for(int k=3;k>=0;k--){float fk=float(k);float d=fig(q,uPhase-fk*.09,mv)*sc;
    c+=pal(fk*.17+uTime*.05)*(smoothstep(w,w*.4,d)*(fk<.5?1.4:.45/fk)+exp(-d*40.)*(fk<.5?.45:.08))*(1.+uBeat*.4);}
  return c;}
vec3 crowd(vec2 uv){vec2 q0=uv-vec2(0.,.56);vec3 c=uBg>0?scenery(uv,-.2):uC1*.06+pal(uTime*.05)*exp(-length(q0)*2.6)*(.7+.7*uBeat);
  for(int i=0;i<5;i++){float fi=float(i),a=(fi-2.)*.38+.28*sin(uTime*.6+fi*1.7);
    c+=pal(fi*.2+uTime*.03)*exp(-abs(q0.x*cos(a)+q0.y*sin(a))*28.)*(uBg>0?.12:.3)*(.6+uBeat)*step(q0.y,0.);}
  for(int row=0;row<2;row++){float fr=float(row),sc=mix(.3,.5,fr),base=mix(-.3,-.62,fr),sp=mix(.16,.26,fr);
    float x=uv.x/sp+fr*.5,id=floor(x+.5),dm=9.;
    for(int k=-1;k<=1;k++){float j=id+float(k),h=hash(vec2(j,fr*7.+1.));vec2 q=vec2((x-j)*sp,uv.y-base)/sc;
      if(h>.5)q.x=-q.x;float mv=h<.45?4.:(h<.75?1.:0.);
      dm=min(dm,fig(q,uPhase+(h<.45?0.:h*.3),mv)*sc);}
    float w=mix(.011,.019,fr),m=smoothstep(w,w*.6,dm);
    c=mix(c,c*.12*(1.-fr),m);c+=pal(fr*.3+uTime*.04)*smoothstep(w*2.2,w,dm)*(1.-m)*.35;}
  return c;}
void main(){vec2 uv=(gl_FragCoord.xy-.5*uRes)/uRes.y;uv*=1.-uBeat*.04;vec3 c;
  if(uScene==0)c=tunnel(uv);else if(uScene==1)c=grid(uv);else if(uScene==2)c=flow(uv);else if(uScene==3)c=kaleido(uv);
  else if(uScene==4)c=ink(uv);else if(uScene==5)c=caustics(uv);else if(uScene==6)c=lava(uv);else if(uScene==7)c=curtains(uv);
  else if(uScene==8)c=cells(uv);else if(uScene==9)c=topo(uv);else if(uScene==10)c=truchet(uv);else if(uScene==11)c=moire(uv);
  else if(uScene==12)c=hexes(uv);else if(uScene==13)c=opart(uv);
  else if(uScene==14)c=dancers(uv);else if(uScene==15)c=solo(uv);else c=crowd(uv);
  c+=uHigh*.06*hash(gl_FragCoord.xy+uTime);c*=1.-.35*dot(uv*.8,uv*.8);gl_FragColor=vec4(c*uFade,1.);}`;

  const SCENERY = ['Club', 'City', 'Beach', 'Forest', 'Space'];
  const SCENES = ['tunnel','grid','flow','kaleido','ink','caustics','lava','curtains','cells','topo','truchet','moire','hexes','op-art','dancers','solo','crowd'];
  const SETS = [
    ['Aurora', '#296EFF', '#1FDBC7', '#4FFF78'], ['Ocean', '#0A2A6B', '#00B4D8', '#90E0EF'], ['Sunset', '#FF5E3A', '#FF2D95', '#FFC86B'],
    ['Ember', '#7A0C00', '#FF3D00', '#FFB300'], ['Acid', '#00FF85', '#B6FF00', '#F4FF5E'], ['Bloom', '#8A5CFF', '#FF7AD9', '#FFD1F0'],
    ['Ultraviolet', '#6A00FF', '#FF006E', '#00D1FF'], ['Mono', '#1E1E1E', '#8A8A8A', '#FFFFFF'],
  ].map(([name, ...hex]) => ({ name, hex, rgb: hex.map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255)) }));
  const S = { bg:0, bgHist:[], phase:0, held:false, fps:60, gl:null, fade:1, fadeTo:1, fadeRate:2, set:0, coverSet:0, hist:[], songScene:2, prefs:{ colours:'auto', scene:'shuffle', scenery:'auto' }, cv:null, u:{}, run:false, raf:0, t0:performance.now(), time:0, last:0,
    pal:[[.16,.43,1],[.12,.86,.78],[.31,1,.47]], palTo:null, base:0, cfg:{ scene:'auto', speed:1, punch:1, bpm:124 }, getPos:null, an:null, data:null, avg:0, env:0, lastHit:0, bpm:124 };

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
      ['uRes','uTime','uBeat','uBass','uHigh','uFade','uPhase','uScene','uBg','uC1','uC2','uC3'].forEach(n => S.u[n] = gl.getUniformLocation(pr, n));
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
        // match the cover to the closest colour set (a grey cover gets Mono)
        let best = 7, bd = 1e9;
        if (px[0].s > .08) SETS.forEach((st, k) => { if (k === 7) return;
          let d = 0; pick.forEach(c => { d += Math.min(...st.rgb.map(r => (r[0]-c[0])**2 + (r[1]-c[1])**2 + (r[2]-c[2])**2)); });
          if (d < bd){ bd = d; best = k; } });
        S.coverSet = best; if (S.prefs.colours === 'auto') applySet(best); if (S.onCover) S.onCover(best);
      } catch (e) { /* the image server didn't allow reading its pixels: keep the current colours */ }
    };
    img.src = url;
  }
  function applySet(k){ S.set = k; S.palTo = SETS[k].rgb.map(c => c.slice()); if (S.onPalette) S.onPalette(SETS[k].rgb); }

  function pickScene(force){
    if (S.prefs.scene === 'lock' && !force) return S.songScene;
    const n = SCENES.length, avoid = S.hist.slice(-4); let k, tries = 0;
    do { k = Math.floor(Math.random() * n); } while ((avoid.includes(k) || k === S.songScene) && ++tries < 50);
    return k;
  }
  // the scenery behind the stick figures: a new one each song, or the one you picked
  function pickScenery(){
    if (S.prefs.scenery !== 'auto'){ S.bg = +S.prefs.scenery; return; }
    let k, tries = 0; do { k = Math.floor(Math.random() * SCENERY.length); } while ((k === S.bg) && ++tries < 20);
    S.bg = k;
  }
  // mid-song: swap to another scene (and scenery) with a quick dip, same song and colours.
  // With 'keep this one' on, the new scene becomes the one that's kept.
  function shuffle(onSwap){
    const go = () => {
      S.songScene = pickScene(true); S.hist.push(S.songScene); if (S.hist.length > 8) S.hist.shift();
      if (S.prefs.scenery === 'auto') pickScenery();
      S.fadeTo = 1; S.fadeRate = 1 / .6;
      if (onSwap) onSwap(now());
    };
    if (!S.gl){ go(); return; }
    S.fadeTo = 0; S.fadeRate = 1 / .3;                // dip out over 0.3 s
    clearTimeout(S.songT); S.songT = setTimeout(go, 320);
    if (!S.run) loop();
  }
  function song(info, opts){
    opts = opts || {};
    const go = () => {
      S.songScene = pickScene(); S.hist.push(S.songScene); if (S.hist.length > 8) S.hist.shift();
      pickScenery();
      if (S.prefs.colours === 'auto'){ S.coverSet = S.set; if (info && info.cover) palette(info.cover); }
      else applySet(+S.prefs.colours);
      if (opts.onDark) opts.onDark(now());
      S.fadeTo = 1; S.fadeRate = 1 / 1.2;              // fade back in over 1.2 s
    };
    if (opts.first || !S.gl){ S.fade = 0; go(); return; }
    S.fadeTo = 0; S.fadeRate = S.cfg.bpm / 120;          // fade out over 2 beats
    clearTimeout(S.songT); S.songT = setTimeout(go, 120000 / S.cfg.bpm);
    if (S.gl && !S.run) loop();
  }
  function prefs(p){
    Object.assign(S.prefs, p || {});
    if (p && p.scene === 'lock') S.songScene = S.scene != null ? S.scene : S.songScene;
    if (p && 'scenery' in p && p.scenery !== 'auto') S.bg = +p.scenery;
    if (p && 'colours' in p){ applySet(p.colours === 'auto' ? S.coverSet : +p.colours); }
    if (S.gl && !S.run) loop();
  }
  function now(){ return { scene: SCENES[S.songScene], set: SETS[S.set].name, scenery: SCENERY[S.bg], prefs: { ...S.prefs } }; }
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
  function play(on){ S.run = !!on; if (S.run){ S.last = 0; loop(); } }

  function loop(){
    cancelAnimationFrame(S.raf);
    S.raf = requestAnimationFrame(frame);
  }
  function frame(now){
    const gl = S.gl; if (!gl) return;
    if (!S.cv.isConnected || document.hidden) return;
    // held (the camera is moving) or ahead of the frame cap: keep the last picture, check again next frame
    if (S.held || (S.last && now - S.last < 1000 / S.fps - 4)){ S.raf = requestAnimationFrame(frame); return; }
    const dt = Math.min(.1, (now - (S.last || now)) / 1000); S.last = now;
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
    // the dancers' beat count: locked to the song clock, or free-running at the tempo (nudged onto each kick with your own audio)
    if (S.run && !S.an && S.getPos) S.phase = Math.max(0, pos) * S.cfg.bpm / 60;
    else { S.phase += dt * S.cfg.bpm / 60 * (S.run ? 1 : .3); if (S.an && S.lastHit === now) S.phase += (Math.round(S.phase) - S.phase) * .6; }
    const bars = Math.floor(Math.max(0, pos) * S.cfg.bpm / 60 / 64);
    gl.uniform1f(S.u.uTime, S.time); gl.uniform1f(S.u.uBeat, beat); gl.uniform1f(S.u.uBass, bass); gl.uniform1f(S.u.uHigh, high);
    S.scene = S.cfg.scene === 'auto' ? S.songScene : +S.cfg.scene;
    S.fade += Math.sign(S.fadeTo - S.fade) * Math.min(Math.abs(S.fadeTo - S.fade), dt * S.fadeRate);
    if (S.palTo){ let done = true; S.pal = S.pal.map((c, i) => c.map((v, j) => { const t = S.palTo[i][j], nv = v + (t - v) * Math.min(1, dt * 3); if (Math.abs(t - nv) > .002) done = false; return nv; })); if (done) S.palTo = null; }
    gl.uniform1f(S.u.uFade, S.fade); gl.uniform1f(S.u.uPhase, S.phase % 4096);
    gl.uniform1i(S.u.uScene, S.scene); gl.uniform1i(S.u.uBg, S.bg);
    gl.uniform3fv(S.u.uC1, S.pal[0]); gl.uniform3fv(S.u.uC2, S.pal[1]); gl.uniform3fv(S.u.uC3, S.pal[2]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (S.run || S.palTo || Math.abs(S.fade - S.fadeTo) > .001) S.raf = requestAnimationFrame(frame);
  }

  // hold(true) freezes the picture (cheap) until hold(false); quality({fps, w, h}) caps the frame rate and canvas size
  function hold(on){ S.held = !!on; if (!on){ S.last = 0; loop(); } }
  function quality(q){ if (q.fps) S.fps = q.fps; if (q.w && S.cv && (S.cv.width !== q.w || S.cv.height !== q.h)) size(q.w, q.h); }
  function set(c){ Object.assign(S.cfg, c || {}); if (c && c.palette) S.pal = c.palette; if (S.gl && !S.run) loop(); }
  function size(w, h){ if (!S.gl) return; S.cv.width = w; S.cv.height = h; S.gl.viewport(0, 0, w, h); S.gl.uniform2f(S.u.uRes, w, h); if (!S.run) loop(); }
  function state(){ return { ...S.cfg, palette: S.pal, scene_now: S.scene, beat: S.beat || 0, level: S.level || 0 }; }
  window.Viz = { SCENES, SETS, SCENERY, song, shuffle, prefs, now, onCover(fn){ S.onCover = fn; }, mount, track, clock, audio, play, set, state, size, hold, quality, onPalette(fn){ S.onPalette = fn; }, get running(){ return S.run; } };
})();
