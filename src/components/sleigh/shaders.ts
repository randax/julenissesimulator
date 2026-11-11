import { TERRAIN_CHANNELS_GLSL } from "./terrain.ts";
const INSTANCE = `
 attribute vec4 aInstance;
 attribute float aAngle;
 uniform bool uInstanced;
 vec3 rotateTree(vec3 p){float c=cos(aAngle),s=sin(aAngle);return vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);}
 vec3 instancePosition(vec3 p){return rotateTree(p*aInstance.w)+aInstance.xyz;}
`;
const NOISE = `
 float hash(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
 float fbm(vec2 p){return noise(p)*.57+noise(p*2.03+13.7)*.28+noise(p*4.11-8.4)*.15;}
`;
export const VERTEX = `
 attribute vec3 aPosition;attribute vec3 aNormal;attribute vec3 aColour;attribute float aEmission;
 uniform mat4 uModel;uniform mat4 uViewProjection;uniform mat4 uView;uniform mat4 uLight;uniform bool uLocalMaterial;
 varying vec4 vShadow;varying vec3 vColour;varying vec3 vNormal;varying vec3 vWorld;varying vec3 vSurface;varying float vDepth;varying float vEmission;
 ${INSTANCE}
 void main(){
  vec3 p=uInstanced?instancePosition(aPosition):aPosition;
  vec4 world=uModel*vec4(p,1.0);gl_Position=uViewProjection*world;
  vNormal=mat3(uModel)*(uInstanced?rotateTree(aNormal):aNormal);
  vWorld=world.xyz;vSurface=uLocalMaterial?aPosition:world.xyz;vShadow=uLight*world;vColour=aColour;
  if(uInstanced)vColour*=.93+fract(aAngle*3.71)*.12;
  vDepth=length((uView*world).xyz);vEmission=aEmission;
 }
`;
export const FRAGMENT = `
 precision highp float;
 varying vec3 vColour;varying vec3 vNormal;varying vec3 vWorld;varying vec3 vSurface;varying float vDepth;varying float vEmission;varying vec4 vShadow;
 uniform vec3 uLantern;uniform vec3 uCamera;uniform sampler2D uShadowMap;uniform vec4 uWarmLights[6];uniform vec4 uEnvironment;uniform vec4 uWeather;uniform vec3 uLightDirection;uniform float uRenderOrigin;
 ${NOISE}
 ${TERRAIN_CHANNELS_GLSL}
 float unpackDepth(vec4 value){return dot(value,vec4(1.0/16777216.0,1.0/65536.0,1.0/256.0,1.0))*(255.0/256.0);}
 float visibility(vec3 normal){
  vec3 p=vShadow.xyz/vShadow.w*.5+.5;
  if(p.x<0.0||p.x>1.0||p.y<0.0||p.y>1.0||p.z>1.0)return 1.0;
  float result=0.0;float bias=.0011+(.0008*(1.0-abs(normal.y)));
  for(int x=0;x<2;x++)for(int y=0;y<2;y++){
   vec2 uv=p.xy+(vec2(float(x),float(y))-.5)*1.3/1024.0;
   result+=step(p.z-bias,unpackDepth(texture2D(uShadowMap,uv)));
  }return result*.25;
 }
 void main(){
  vec3 normal=normalize(vNormal);if(!gl_FrontFacing)normal=-normal;
  float snow=smoothstep(.64,.83,min(vColour.r,vColour.g))*smoothstep(.62,.82,vColour.b);
  float close=1.0-smoothstep(90.0,350.0,vDepth);
  float grain=noise(vSurface.xz*8.0+vSurface.y*.53);
  vec3 detail=vec3(noise(vSurface.xy*4.7)-.5,0.0,noise(vSurface.zy*4.7)-.5);
  normal=normalize(normal+detail*snow*.065*close);
  vec3 lightDirection=normalize(uLightDirection);
  float sunlight=max(dot(normal,lightDirection),0.0)*visibility(normal);
  float skylight=max(normal.y,0.0);
  vec3 ambient=mix(vec3(.045,.067,.12),vec3(.34,.42,.55),uEnvironment.x);
  vec3 direct=mix(vec3(.13,.19,.32),vec3(.55,.48,.40),uEnvironment.x)*(1.0-uEnvironment.w*.48);
  vec3 skyLight=mix(vec3(.025,.045,.085),vec3(.14,.18,.24),uEnvironment.x);
  vec3 lighting=ambient+sunlight*direct+skylight*skyLight;
  lighting+=vec3(.018,.047,.038)*uEnvironment.z*skylight;
  vec3 lamp=uLantern-vWorld;
  float warmth=max(dot(normal,normalize(lamp)),0.0)*min(.7,16.0/max(dot(lamp,lamp),1.0));
  lighting+=vec3(1.0,.62,.26)*warmth;
  float localWarmth=0.0;
  for(int i=0;i<6;i++){
    vec3 delta=uWarmLights[i].xyz-vWorld;
    float distanceSquared=dot(delta,delta);
    localWarmth+=max(dot(normal,normalize(delta)),0.0)*uWarmLights[i].w*8.0/(distanceSquared+12.0)*exp(-sqrt(distanceSquared)*.028);
  }
  lighting+=vec3(1.0,.46,.10)*min(localWarmth,.68);
  vec3 albedo=vColour;
  // These coordinates share the terrain's winding stream and village path.
  float globalZ=vWorld.z-uRenderOrigin;
  float riverCenter=streamCenterAt(globalZ);
  float roadCenter=pathCenterAt(globalZ);
  float ground=snow*(1.0-smoothstep(4.5,7.0,vWorld.y-valleyFloorAt(globalZ)))*smoothstep(.65,.9,normal.y);
  float river=(1.0-smoothstep(1.9,2.4,abs(vWorld.x-riverCenter)))*ground;
  float road=(1.0-smoothstep(5.5,7.0,abs(vWorld.x-roadCenter)))*ground;
  albedo=mix(albedo,vec3(.78,.83,.92),road*.50);
  float track=1.0-smoothstep(.045,.14,abs(abs(vWorld.x-roadCenter)-2.0));
  albedo*=1.0-track*road*.11;
  albedo=mix(albedo,vec3(.47,.60,.74),river*.82);
  float rock=step(.28,vColour.b)*(1.0-smoothstep(.60,.79,vColour.r))*(1.0-snow);
  albedo*=1.0+rock*(fbm(vSurface.xz*.18+vSurface.y*.35)-.5)*.22;
  albedo*=1.0+snow*(grain-.5)*.065*close;
  float wood=step(.04,vColour.r-vColour.b)*(1.0-snow)*(1.0-smoothstep(.65,.79,vColour.r));
  float along=abs(normal.z)>abs(normal.x)?vSurface.x:vSurface.z;
  float fibres=sin(along*7.0+noise(vec2(along*.23,vSurface.y*4.0))*9.0);
  albedo*=1.0+wood*fibres*.065;
  vec3 lit=albedo*mix(lighting,vec3(1.1),min(vEmission,1.0));
  lit+=albedo*max(vEmission-1.0,0.0)*.25;
  if(vEmission>.5){lit.r*=1.02;lit.g*=.88;lit.b*=.82;}
  vec3 viewDirection=normalize(uCamera-vWorld);
  float sparkle=pow(max(dot(normal,normalize(lightDirection+viewDirection)),0.0),72.0);
  lit+=vec3(.12,.14,.18)*sparkle*snow*close;
  float metal=step(.66,vColour.r)*(1.0-smoothstep(.50,.60,vColour.b))*step(.40,vColour.g)*(1.0-step(.5,vEmission));
  lit+=vec3(.32,.24,.14)*pow(max(dot(normal,normalize(lightDirection+viewDirection)),0.0),44.0)*metal;
  float distanceFog=1.0-exp(-vDepth*uWeather.w*.001);
  float valleyMist=exp(-max(vWorld.y,0.0)*.022)*(1.0-exp(-vDepth*.003))* (.09+fbm(vWorld.xz*.003)*.17);
  float hangingMist=exp(-pow((vWorld.y-55.0)/55.0,2.0))*(1.0-exp(-vDepth*.002))*.16;
  float fog=clamp(distanceFog+valleyMist+hangingMist,0.0,.96);
  vec3 fogColour=mix(vec3(.59,.68,.81),vec3(.65,.71,.82),smoothstep(60.0,300.0,vWorld.y));
  fogColour=mix(vec3(.035,.055,.11),fogColour,uEnvironment.x);
  vec3 result=mix(lit,fogColour,fog);
  gl_FragColor=vec4(pow(max(result,vec3(0.0)),vec3(.94)),1.0);
 }
`;
export const DEPTH_VERTEX = `attribute vec3 aPosition;uniform mat4 uModel;uniform mat4 uLight;${INSTANCE}void main(){vec3 p=uInstanced?instancePosition(aPosition):aPosition;gl_Position=uLight*uModel*vec4(p,1.0);}`;
export const DEPTH_FRAGMENT = `precision highp float;void main(){vec4 encoded=fract(gl_FragCoord.z*vec4(16777216.0,65536.0,256.0,1.0));encoded-=encoded.xxyz*vec4(0.0,1.0/256.0,1.0/256.0,1.0/256.0);gl_FragColor=encoded*(256.0/255.0);}`;
export const SKY_VERTEX = `attribute vec2 aPosition;varying vec2 vUv;void main(){vUv=aPosition*.5+.5;gl_Position=vec4(aPosition,1.0,1.0);}`;
export const SKY_FRAGMENT = `
 precision highp float;varying vec2 vUv;uniform float uHorizon;uniform float uAspect;uniform float uTime;uniform vec2 uSolar;uniform vec4 uEnvironment;uniform vec4 uWeather;
 ${NOISE}
 void main(){
  float height=clamp((vUv.y-uHorizon)/max(1.0-uHorizon,.1),0.0,1.0);
  float day=uEnvironment.x,night=uEnvironment.y,cloudCover=uEnvironment.w;
  vec3 daySky=mix(vec3(.70,.81,.94),vec3(.27,.49,.79),smoothstep(0.0,1.0,height));
  vec3 nightSky=mix(vec3(.035,.065,.14),vec3(.006,.014,.045),height);
  vec3 sky=mix(nightSky,daySky,day);
  float twilight=exp(-abs(uSolar.x)*6.0);
  float sunset=exp(-pow((vUv.y-uHorizon-.025)*9.5,2.0))*exp(-pow((vUv.x-.35)*1.35,2.0))*twilight;
  sky+=vec3(.34,.10,.025)*sunset;
  vec2 celestial=vec2(.73,uHorizon+.10+max(-uSolar.x,0.0)*.17);
  vec2 moonDelta=(vUv-celestial)*vec2(uAspect,1.0);
  float moonDistance=length(moonDelta);
  float moon=(1.0-smoothstep(.013,.017,moonDistance))*night;
  sky+=vec3(.62,.72,.92)*moon;
  sky+=vec3(.08,.12,.22)*exp(-moonDistance*18.0)*night;
  if(vUv.y>uHorizon-.08){
    vec2 p=vec2(vUv.x*7.0+uTime*.003,vUv.y*21.0+uTime*.0006);
    float cloud=fbm(p+vec2(fbm(p*.35)*2.0,0.0));
    float opacity=smoothstep(.25,.72,cloud)*smoothstep(uHorizon-.08,uHorizon+.15,vUv.y)*cloudCover*.95;
    vec3 cloudColour=mix(vec3(.05,.08,.14),mix(vec3(.50,.59,.71),vec3(.89,.85,.84),smoothstep(.35,.75,cloud)),day);
    sky=mix(sky,cloudColour,opacity);
    vec2 starGrid=vUv*vec2(430.0*uAspect,430.0),cell=floor(starGrid),local=fract(starGrid)-.5;
    float starSeed=hash(cell);
    float stars=step(.9974,starSeed)*exp(-length(local)*18.0)*(.8+.2*sin(uTime*.5+starSeed*110.0));
    sky+=vec3(.68,.80,1.0)*stars*night*(1.0-opacity)*smoothstep(uHorizon+.02,uHorizon+.20,vUv.y);
    if(uEnvironment.z>.01){
      vec3 aurora=vec3(0.0);
      for(int layer=0;layer<3;layer++){
        float l=float(layer),x=vUv.x;
        float base=uHorizon+.075+l*.045+sin(x*5.8+uTime*.075+l*1.7)*.046+sin(x*13.0-uTime*.045+l)*.016;
        float rise=vUv.y-base;
        float folds=.28+.72*pow(noise(vec2(x*86.0+sin(x*13.0+uTime*.08)*2.0,uTime*.035+l*9.0)),2.0);
        float curtain=smoothstep(-.006,.018,rise)*(1.0-smoothstep(.065,.24,rise))*exp(-max(rise,0.0)*5.0)*folds*.47;
        float edge=exp(-abs(rise)*155.0)*.19;
        vec3 lower=mix(vec3(.09,.91,.40),vec3(.03,.64,.88),l*.30);
        vec3 colour=mix(lower,vec3(.43,.16,.78),smoothstep(.08,.22,rise));
        float span=smoothstep(.0,.12,x)*(1.0-smoothstep(.91,1.0,x));
        aurora+=colour*(curtain+edge)*span;
      }
      sky+=aurora*uEnvironment.z*(1.0-opacity*.75);
    }
  }
  sky=mix(sky,sky*.74+vec3(.045,.055,.07),cloudCover*.24);
  gl_FragColor=vec4(sky,1.0);
 }
`;
export const SNOW_VERTEX = `
 attribute vec3 aSeed;uniform mat4 uViewProjection;uniform vec3 uOrigin;uniform float uTravel;uniform float uTime;uniform float uPixelRatio;uniform vec4 uWeather;varying float vAlpha;
 void main(){
  vec3 p=vec3(mod(aSeed.x*100.0+uTime*uWeather.y*.8,100.0)-50.0,mod(aSeed.y*65.0-uTime*(3.0+uWeather.x*4.0),65.0)-22.0,mod(aSeed.z*130.0+uTravel+uTime*uWeather.z,130.0)-95.0);
  p.x+=sin(uTime*.4+aSeed.z*20.0)*2.0;
  vec4 clip=uViewProjection*vec4(p+uOrigin,1.0);gl_Position=clip;
  gl_PointSize=clamp((130.0+uWeather.x*65.0)/max(clip.w,1.0),1.6,4.0+uWeather.x*2.0)*uPixelRatio;
  vAlpha=(.28+aSeed.y*.58)*(.45+uWeather.x*.55);
 }
`;
export const SNOW_FRAGMENT = `precision highp float;varying float vAlpha;uniform float uNight;uniform vec4 uWeather;void main(){vec2 p=gl_PointCoord-.5;p.x+=p.y*uWeather.y*.035;float a=1.0-smoothstep(.12,.5,length(p*vec2(1.25,.78)));gl_FragColor=vec4(mix(vec3(.94,.96,1.0),vec3(.72,.81,.96),uNight),a*vAlpha);}`;
export const GLOW_VERTEX = `attribute vec4 aGlow;uniform mat4 uViewProjection;uniform float uPixelRatio;uniform float uOffsetZ;uniform float uNight;varying float vAlpha;void main(){vec4 clip=uViewProjection*vec4(aGlow.xyz+vec3(0.0,0.0,uOffsetZ),1.0);gl_Position=clip;gl_PointSize=clamp(1100.0*aGlow.w/max(clip.w,1.0),2.0,95.0)*uPixelRatio;vAlpha=.15+uNight*.16;}`;
export const GLOW_FRAGMENT = `precision mediump float;varying float vAlpha;void main(){float radius=length(gl_PointCoord-.5)*2.0;float glow=exp(-radius*radius*5.0)*(1.0-smoothstep(.2,1.0,radius));gl_FragColor=vec4(1.0,.46,.09,glow*vAlpha);}`;
