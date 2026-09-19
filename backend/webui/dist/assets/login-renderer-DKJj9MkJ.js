import{s as S}from"./login-Ce5x6pRF.js";import"./index-B7k5yxGG.js";import"./vendor-CXBObVrp.js";import"./charts-l-V2NCIn.js";import"./eye-IZW7ePMs.js";import"./loader-circle-BSg81TO3.js";function ve(r,e,t,o,a,i){const n=Math.max(t/r,o/e);return{fitWidth:r*n,fitHeight:e*n,offsetHorizontal:(t-r*n)*a,offsetVertical:(o-e*n)*i}}function K(r){return r.split(" ").map(e=>Number.parseFloat(e)||0)}function me(r,e=0){if(e>4||!r.includes("var("))return r;const t=r.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g,(o,a,i)=>getComputedStyle(document.documentElement).getPropertyValue(a).trim()||i.trim());return t===r?t:me(t,e+1)}function we(r,e,t){const o=e/100,a=t/100,i=(1-Math.abs(2*a-1))*o,n=(r%360+360)%360/60,m=i*(1-Math.abs(n%2-1)),[h,l,f]=n<1?[i,m,0]:n<2?[m,i,0]:n<3?[0,i,m]:n<4?[0,m,i]:n<5?[m,0,i]:[i,0,m],c=a-i/2;return[Math.round((h+c)*255),Math.round((l+c)*255),Math.round((f+c)*255)]}function be(r){const e=r.trim(),t=/^#([0-9a-f]{6})$/i.exec(e);if(t){const i=Number.parseInt(t[1],16);return[i>>16&255,i>>8&255,i&255]}const o=/^hsl\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*\)$/i.exec(e);if(o)return we(Number(o[1]),Number(o[2]),Number(o[3]));const a=/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(e);return a?[Number(a[1]),Number(a[2]),Number(a[3])]:null}function Ee(r){const e=getComputedStyle(document.documentElement),t=[];for(const o of["--grad-a","--grad-b"]){const a=be(me(e.getPropertyValue(o)));a&&t.push(a.map(i=>i/255))}return t.length===2?t:Array.from(getComputedStyle(r).backgroundImage.matchAll(/rgba?\(([^)]+)\)/g),o=>o[1].split(/[,\s]+/).filter(Boolean).slice(0,3).map(a=>Number(a)/255))}function ye(r,e,t,o){const a=getComputedStyle(t),i=getComputedStyle(e),n=K(a.transformOrigin),m=K(i.transformOrigin),h=K(i.translate),l=Number.parseFloat(a.scale)||1,f=r.getBoundingClientRect(),c=new DOMMatrix().translate(f.left+e.offsetLeft+(h[0]||0),f.top+e.offsetTop+(h[1]||0)).translate(m[0],m[1]).multiply(new DOMMatrix(i.transform==="none"?void 0:i.transform)).translate(-m[0],-m[1]).translate(n[0],n[1]).scale(l).multiply(new DOMMatrix(a.transform==="none"?void 0:a.transform)).translate(-n[0],-n[1]),v=K(getComputedStyle(o).objectPosition);return{matrix:c,width:t.offsetWidth,height:t.offsetHeight,...ve(o.videoWidth,o.videoHeight,t.offsetWidth,t.offsetHeight,v[0]/100,v[1]/100),bounds:e.getBoundingClientRect(),rootBounds:f,mobile:window.innerWidth<=700}}function fe(r,e,t){const o=r*t.fitWidth+t.offsetHorizontal,a=e*t.fitHeight+t.offsetVertical,i=t.matrix,n=i.m14*o+i.m24*a+i.m44;return{horizontal:(i.m11*o+i.m21*a+i.m41)/n,vertical:(i.m12*o+i.m22*a+i.m42)/n}}function Te(r,e,t,o){const a=1-t,i=e.horizontal-r.horizontal,n={horizontal:r.horizontal+i*.28+o,vertical:r.vertical-.12},m={horizontal:e.horizontal-i*.2-o,vertical:e.vertical-.1};return{horizontal:a**3*r.horizontal+3*a**2*t*n.horizontal+3*a*t**2*m.horizontal+t**3*e.horizontal,vertical:a**3*r.vertical+3*a**2*t*n.vertical+3*a*t**2*m.vertical+t**3*e.vertical}}function Ae(r,e,t,o,a,i){const n=e.horizontal-r.horizontal,m=e.vertical-r.vertical;let h=0,l=1;for(const[f,c]of[[-n,r.horizontal-t],[n,a-r.horizontal],[-m,r.vertical-o],[m,i-r.vertical]]){if(f===0){if(c<0)return null;continue}const v=c/f;if(f<0?h=Math.max(h,v):l=Math.min(l,v),h>l)return null}return{from:{horizontal:r.horizontal+h*n,vertical:r.vertical+h*m},to:{horizontal:r.horizontal+l*n,vertical:r.vertical+l*m}}}const Re=`#version 300 es
in vec4 position;
in vec2 texturePoint;
out vec2 textureUV;
void main() { gl_Position = position; textureUV = texturePoint; }
`,ze=`#version 300 es
precision highp float;
uniform sampler2D image;
uniform vec2 viewport;
uniform vec2 resolution;
uniform vec4 sceneBounds;
uniform vec4 rootBounds;
uniform float dark;
uniform float mobile;
uniform float compact;
uniform float opacity;
uniform float targetMode;
uniform float desaturate;
uniform vec3 gradientStart;
uniform vec3 gradientEnd;
uniform vec2 targetSize;
in vec2 textureUV;
out vec4 outputColor;
float ramp(float start, float end, float value) { return clamp((value-start)/(end-start),0.0,1.0); }
void main() {
  vec4 sampleColor = texture(image, textureUV);
  vec2 screen = vec2(gl_FragCoord.x/resolution.x, 1.0-gl_FragCoord.y/resolution.y)*viewport;
  if (targetMode > 0.5) {
    float gradientPosition = dot((textureUV-0.5)*targetSize,vec2(0.1391731,0.9902681))/dot(targetSize,vec2(0.1391731,0.9902681))+0.5;
    float alpha = sampleColor.a*opacity;
    outputColor = vec4(mix(gradientStart,gradientEnd,ramp(0.08,0.92,gradientPosition))*alpha,alpha);
    return;
  }
  if (screen.x < sceneBounds.x || screen.x > sceneBounds.z || screen.y < sceneBounds.y || screen.y > sceneBounds.w) discard;
  float horizontal = (screen.x-rootBounds.x)/rootBounds.z;
  float vertical = (screen.y-rootBounds.y)/rootBounds.w;
  float wash;
  float veil;
  float edge = 1.0;
  if (mobile > 0.5) {
    wash = mix(0.03,0.04,ramp(0.15,0.28,vertical));
    wash = mix(wash,0.8,ramp(0.28,0.43,vertical));
    wash = mix(wash,1.0,ramp(0.43,0.57,vertical));
    veil = mix(0.7,0.6,dark)*(1.0-ramp(0.0,0.15,vertical));
  } else {
    wash = mix(mix(0.03,0.04,dark),mix(0.14,0.16,dark),ramp(0.20,0.43,horizontal));
    wash = mix(wash,mix(0.91,0.94,dark),ramp(0.43,0.66,horizontal));
    wash = mix(wash,1.0,ramp(0.66,1.0,horizontal));
    if (compact > 0.5 && dark < 0.5) {
      wash = mix(0.0,0.3,ramp(0.10,0.40,horizontal));
      wash = mix(wash,0.94,ramp(0.40,0.66,horizontal));
      wash = mix(wash,1.0,ramp(0.66,1.0,horizontal));
    }
    veil = mix(0.7,0.55,dark)*(1.0-ramp(0.0,0.18,vertical))+mix(0.9,0.8,dark)*ramp(0.8,1.0,vertical);
    edge = 1.0-ramp(0.65,1.0,(screen.x-sceneBounds.x)/(sceneBounds.z-sceneBounds.x));
  }
  float alpha = opacity*edge*(1.0-wash)*(1.0-veil);
  float gray = dot(sampleColor.rgb,vec3(0.2126,0.7152,0.0722));
  outputColor = vec4(mix(sampleColor.rgb,vec3(gray),desaturate)*alpha,alpha);
}
`,Me=`#version 300 es
in vec4 segment;
in vec4 style;
in vec3 color;
uniform vec2 viewport;
out vec2 localUV;
out vec4 strokeColor;
out float particle;
out float clipped;
const vec2 corners[6] = vec2[6](vec2(0.,-1.),vec2(1.,-1.),vec2(0.,1.),vec2(0.,1.),vec2(1.,-1.),vec2(1.,1.));
void main() {
  vec2 corner = corners[gl_VertexID];
  vec2 direction = segment.zw-segment.xy;
  vec2 normal = length(direction)>0.01 ? normalize(vec2(-direction.y,direction.x)) : vec2(0.,1.);
  vec2 point = mix(segment.xy,segment.zw,corner.x)+normal*corner.y*style.x;
  if (style.z>0.5) point = segment.xy+vec2(corner.x*2.0-1.0,corner.y)*style.x;
  gl_Position = vec4(point.x/viewport.x*2.0-1.0,1.0-point.y/viewport.y*2.0,0.,1.);
  localUV = vec2(corner.x*2.0-1.0,corner.y);
  strokeColor = vec4(color,style.y);
  particle = style.z;
  clipped = style.w;
}
`,Be=`#version 300 es
precision highp float;
uniform vec2 viewport;
uniform vec2 resolution;
uniform vec4 sceneBounds;
in vec2 localUV;
in vec4 strokeColor;
in float particle;
in float clipped;
out vec4 outputColor;
void main() {
  vec2 screen = vec2(gl_FragCoord.x/resolution.x,1.0-gl_FragCoord.y/resolution.y)*viewport;
  if (clipped>0.5 && (screen.x<sceneBounds.x || screen.x>sceneBounds.z || screen.y<sceneBounds.y || screen.y>sceneBounds.w)) discard;
  float softness = particle>0.5 ? exp(-dot(localUV,localUV)*3.0) : 1.0-smoothstep(0.25,1.0,abs(localUV.y));
  float alpha = strokeColor.a*softness;
  outputColor = vec4(strokeColor.rgb*alpha,alpha);
}
`;function ue(r){let e=Math.imul(r^2654435769,2246822507);return e=Math.imul(e^e>>>13,3266489909),((e^e>>>16)>>>0)/4294967296}function ce(r,e,t){const o=r.createProgram();if(!o)throw new Error("WebGL program unavailable");let a=!1;try{for(const[n,m]of[[r.VERTEX_SHADER,e],[r.FRAGMENT_SHADER,t]]){const h=r.createShader(n);if(!h)throw new Error("WebGL shader unavailable");if(r.shaderSource(h,m),r.compileShader(h),!r.getShaderParameter(h,r.COMPILE_STATUS)){const l=r.getShaderInfoLog(h)||"Shader compilation failed";throw r.deleteShader(h),new Error(l)}r.attachShader(o,h),r.deleteShader(h)}if(r.linkProgram(o),!r.getProgramParameter(o,r.LINK_STATUS))throw new Error("WebGL linking failed");a=!0}finally{a||r.deleteProgram(o)}const i=new Map;return{program:o,uniform:n=>(i.has(n)||i.set(n,r.getUniformLocation(o,n)),i.get(n)??null)}}function _e(){const r=[];return{own(e,t){if(!e)throw new Error("WebGL resource unavailable");return r.push(()=>t(e)),e},defer(e){r.push(e)},dispose(){r.splice(0).reverse().forEach(e=>e())}}}function Fe(r,e,t,o){const a=[];let i=0;for(const l of r){const f=l.points.length/2;for(let c=0;c<f-(l.closed?0:1);c++){const v=(c+1)%f,_={horizontal:l.points[c*2],vertical:l.points[c*2+1]},F={horizontal:l.points[v*2],vertical:l.points[v*2+1]},k=Math.hypot((F.horizontal-_.horizontal)*t,(F.vertical-_.vertical)*o);a.push({from:_,to:F,group:l.group,length:k}),i+=k}}const n=[];let m=0,h=0;for(let l=0;l<e;l++){const f=i*(l+.5)/e;for(;m<a.length-1&&h+a[m].length<f;)h+=a[m++].length;const c=a[m];if(!c)continue;const v=(f-h)/Math.max(c.length,1e-4),_=l/Math.max(1,e-1),F=.875+_*2.25;n.push({group:c.group,target:{horizontal:c.from.horizontal+(c.to.horizontal-c.from.horizontal)*v,vertical:c.from.vertical+(c.to.vertical-c.from.vertical)*v},sourceFraction:0,birth:F,arrival:3.19+_*1.81,seed:l+1})}for(let l=0;l<4;l++){const f=n.filter(c=>c.group===l);f.forEach((c,v)=>{c.sourceFraction=(v+.5)/f.length})}return n.length&&(n[n.length-1].arrival=5),n}function Ne(r){const{canvas:e,video:t,trace:o}=r,a=e.getContext("webgl2",{alpha:!0,premultipliedAlpha:!0,antialias:!1,powerPreference:"low-power"});if(!a||typeof t.requestVideoFrameCallback!="function")throw new Error("Synchronized renderer unavailable");if(t.videoWidth!==o.manifest.source.width||t.videoHeight!==o.manifest.source.height||Math.abs(t.duration-o.manifest.source.duration)>.04)throw new Error("Video and trace do not match");const i=_e();try{return Ce(r,a,i),()=>i.dispose()}catch(n){throw i.dispose(),n}}function Ce(r,e,t){const{canvas:o,root:a,scene:i,camera:n,video:m,target:h,trace:l}=r,f=ce(e,Re,ze);t.own(f.program,u=>e.deleteProgram(u));const c=ce(e,Me,Be);t.own(c.program,u=>e.deleteProgram(u));const v=t.own(e.createBuffer(),u=>e.deleteBuffer(u)),_=t.own(e.createBuffer(),u=>e.deleteBuffer(u)),F=t.own(e.createVertexArray(),u=>e.deleteVertexArray(u)),k=t.own(e.createVertexArray(),u=>e.deleteVertexArray(u)),$=t.own(e.createTexture(),u=>e.deleteTexture(u)),j=t.own(e.createTexture(),u=>e.deleteTexture(u));for(const u of[$,j])e.bindTexture(e.TEXTURE_2D,u),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE);e.bindTexture(e.TEXTURE_2D,j),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,l.targetImage),e.bindVertexArray(F),e.bindBuffer(e.ARRAY_BUFFER,v);for(const[u,T,w]of[["position",4,0],["texturePoint",2,16]]){const g=e.getAttribLocation(f.program,u);e.enableVertexAttribArray(g),e.vertexAttribPointer(g,T,e.FLOAT,!1,24,w)}e.bindVertexArray(k),e.bindBuffer(e.ARRAY_BUFFER,_);for(const[u,T,w]of[["segment",4,0],["style",4,16],["color",3,32]]){const g=e.getAttribLocation(c.program,u);e.enableVertexAttribArray(g),e.vertexAttribPointer(g,T,e.FLOAT,!1,44,w),e.vertexAttribDivisor(g,1)}if(e.enable(e.BLEND),e.blendFunc(e.ONE,e.ONE_MINUS_SRC_ALPHA),e.getError()!==e.NO_ERROR)throw new Error("WebGL initialization failed");const te=Fe(l.targetPaths,window.innerWidth<=700?650:1600,l.manifest.target.width,l.manifest.target.height),de=[0,1,2,3].map(u=>te.filter(T=>T.group===u));let U=0,G=0,N,J=performance.now(),oe=[],O=!1,X=!1,ie=!1,Q=0,ae=0,L;const he=window.setTimeout(()=>V(!1),6500),V=u=>{X||O||(X=!0,r.onFinish(u))},ne=u=>{u.preventDefault(),V(!1)};t.defer(()=>{O=!0,clearTimeout(he),cancelAnimationFrame(U),m.cancelVideoFrameCallback(G),o.removeEventListener("webglcontextlost",ne)}),o.addEventListener("webglcontextlost",ne);const Z=(u,T)=>{if(O||X)return;let w;try{if(typeof VideoFrame=="function")w=new VideoFrame(m);else if(performance.now()-T.expectedDisplayTime>500/l.manifest.source.frameRate){G=m.requestVideoFrameCallback(Z);return}Q=w?w.timestamp/1e6:T.mediaTime;const g=Math.abs(Q-T.mediaTime);ae=Math.max(ae,Math.min(g,Math.abs(l.manifest.source.duration-g))*1e3),e.bindTexture(e.TEXTURE_2D,$),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,w??m),oe=l.sampleCharacterPaths(Q),J=performance.now(),N===void 0&&(N=J),G=m.requestVideoFrameCallback(Z)}catch{V(!1)}finally{w==null||w.close()}};G=m.requestVideoFrameCallback(Z);const W=u=>{var w;if(O||X)return;if(document.hidden||u-J>900){V(!1);return}if(N===void 0){U=requestAnimationFrame(W);return}const T=1e3/(window.innerWidth<=700?30:60);if(L!==void 0&&u-L<T&&u-N<5e3){U=requestAnimationFrame(W);return}L=L===void 0?u:u-(u-L)%T;try{const g=Math.max(0,Math.min(5,(u-N)/1e3)),E=window.innerWidth,A=window.innerHeight,H=Math.min(devicePixelRatio||1,E<=700?1.5:2);(o.width!==Math.round(E*H)||o.height!==Math.round(A*H))&&(o.width=Math.round(E*H),o.height=Math.round(A*H),e.viewport(0,0,o.width,o.height));const d=ye(a,i,n,m),R=h.getBoundingClientRect(),se=Ee(h),D=document.documentElement.classList.contains("dark"),ge=S(3.125,5,g);e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT),e.useProgram(f.program),e.bindVertexArray(F),e.uniform2f(f.uniform("viewport"),E,A),e.uniform2f(f.uniform("resolution"),o.width,o.height),e.uniform4f(f.uniform("sceneBounds"),d.bounds.left,d.bounds.top,d.bounds.right,d.bounds.bottom),e.uniform4f(f.uniform("rootBounds"),d.rootBounds.left,d.rootBounds.top,d.rootBounds.width,d.rootBounds.height),e.uniform1f(f.uniform("dark"),D?1:0),e.uniform1f(f.uniform("mobile"),d.mobile?1:0),e.uniform1f(f.uniform("compact"),E<=1100?1:0),e.uniform2f(f.uniform("targetSize"),R.width,R.height),e.uniform3fv(f.uniform("gradientStart"),se[0]??[.76,.4,.59]),e.uniform3fv(f.uniform("gradientEnd"),se[1]??[.96,.25,.52]);const I=[];for(const[s,b]of[[0,0],[1,0],[0,1],[0,1],[1,0],[1,1]]){const p=d.matrix.transformPoint(new DOMPoint(s*d.width,b*d.height));I.push(p.x*2/E-p.w,p.w-p.y*2/A,0,p.w,(s*d.width-d.offsetHorizontal)/d.fitWidth,(b*d.height-d.offsetVertical)/d.fitHeight)}e.bindBuffer(e.ARRAY_BUFFER,v),e.bufferData(e.ARRAY_BUFFER,new Float32Array(I),e.DYNAMIC_DRAW),e.bindTexture(e.TEXTURE_2D,$),e.uniform1f(f.uniform("targetMode"),0),e.uniform1f(f.uniform("opacity"),(1-S(.875,5,g))*Number(getComputedStyle(i).opacity)),e.uniform1f(f.uniform("desaturate"),S(.875,3.75,g)*.75),e.drawArrays(e.TRIANGLES,0,6),I.length=0;for(const[s,b]of[[0,0],[1,0],[0,1],[0,1],[1,0],[1,1]])I.push((R.left+s*R.width)*2/E-1,1-(R.top+b*R.height)*2/A,0,1,s,b);e.bufferData(e.ARRAY_BUFFER,new Float32Array(I),e.DYNAMIC_DRAW),e.bindTexture(e.TEXTURE_2D,j),e.uniform1f(f.uniform("targetMode"),1),e.uniform1f(f.uniform("opacity"),ge*(D?.4:.45)),e.drawArrays(e.TRIANGLES,0,6);const q=[],x=[[],[],[],[]],Y=[0,0,0,0];for(const s of oe){const b=s.points.length/2;let p=fe(s.points[0],s.points[1],d);for(let z=1;z<b+(s.closed?1:0);z++){const C=z%b,M=fe(s.points[C*2],s.points[C*2+1],d),y=Ae(p,M,Math.max(0,d.bounds.left),Math.max(0,d.bounds.top),Math.min(E,d.bounds.right),Math.min(A,d.bounds.bottom));if(y){const P=Math.hypot(y.to.horizontal-y.from.horizontal,y.to.vertical-y.from.vertical);Y[s.group]+=P,x[s.group].push({...y,length:P,end:Y[s.group]})}p=M}}for(let s=0;s<4;s++){const b=de[s];for(const p of x[s]){const z=(p.end-p.length/2)/Math.max(.001,Y[s]),C=((w=b[Math.min(b.length-1,Math.floor(z*b.length))])==null?void 0:w.birth)??2.5,M=S(0,.7,g)*(1-S(C-.04,C+.08,g));if(M>.001){const y=D?.65:1;q.push(p.from.horizontal,p.from.vertical,p.to.horizontal,p.to.vertical,1.35,M*(D?.7:.9),0,1,y,.72*y,.89*y)}}}let pe=0;for(const s of te){if(g<s.birth)continue;if(!s.source){const M=x[s.group];if(!M.length)continue;const y=Y[s.group]*s.sourceFraction;let P=0,ee=M.length-1;for(;P<ee;){const re=Math.floor((P+ee)/2);M[re].end<y?P=re+1:ee=re}const B=M[P],le=B.length?(y-B.end+B.length)/B.length:0;s.source={horizontal:(B.from.horizontal+(B.to.horizontal-B.from.horizontal)*le)/E,vertical:(B.from.vertical+(B.to.vertical-B.from.vertical)*le)/A},s.started=g}const b={horizontal:(R.left+s.target.horizontal*R.width)/E,vertical:(R.top+s.target.vertical*R.height)/A},p=S(s.started??s.birth,s.arrival,g),z=Te(s.source,b,p,(ue(s.seed+91)-.5)*.075),C=(1-S(s.arrival-.08,s.arrival,g))*Math.min(1,(g-(s.started??0))*8);C<=.001||(pe++,q.push(z.horizontal*E,z.vertical*A,z.horizontal*E,z.vertical*A,2+ue(s.seed)*2.8,C*(D?.75:1),1,0,1,D?.55:.67,.89))}e.useProgram(c.program),e.bindVertexArray(k),e.bindBuffer(e.ARRAY_BUFFER,_),e.bufferData(e.ARRAY_BUFFER,new Float32Array(q),e.DYNAMIC_DRAW),e.uniform2f(c.uniform("viewport"),E,A),e.uniform2f(c.uniform("resolution"),o.width,o.height),e.uniform4f(c.uniform("sceneBounds"),d.bounds.left,d.bounds.top,d.bounds.right,d.bounds.bottom),e.drawArraysInstanced(e.TRIANGLES,0,6,q.length/11),ie||(ie=!0,r.onReady()),r.onFrame(g),g>=5?U=requestAnimationFrame(()=>V(!0)):U=requestAnimationFrame(W)}catch{V(!1)}};U=requestAnimationFrame(W)}export{Ae as clipTraceSegment,ve as coverPlacement,Te as particlePoint,fe as projectVideoPoint,ye as readSceneProjection,Ne as runLoginTransition};
