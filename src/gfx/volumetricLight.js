// Low-resolution, depth-aware screen-space sun shafts for Eldermere's existing renderer.
export function createVolumetricLight(THREE, renderer, fx) {
  const small = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
  const shaftsRT = new THREE.WebGLRenderTarget(2, 2, small), outRT = new THREE.WebGLRenderTarget(2, 2, small);
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quad.frustumCulled = false; scene.add(quad);
  const shaftMat = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false,
    uniforms: { depthTex: { value: null }, sceneTex: { value: null }, sunUv: { value: new THREE.Vector2(0.5, 0.5) }, density: { value: 0.82 }, weight: { value: 0.035 }, decay: { value: 0.96 }, exposure: { value: 0.8 }, color: { value: new THREE.Color('#fff0d0') } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader: `uniform sampler2D depthTex,sceneTex; uniform vec2 sunUv; uniform float density,weight,decay,exposure; uniform vec3 color; varying vec2 vUv;
      void main(){ vec2 delta=(vUv-sunUv)*(density/24.0); vec2 uv=vUv; float illum=0.0, fade=1.0;
        for(int i=0;i<24;i++){ uv-=delta; float z=texture2D(depthTex,uv).x; vec3 src=texture2D(sceneTex,uv).rgb; float bright=smoothstep(0.75,1.6,dot(src,vec3(0.2126,0.7152,0.0722))); float sky=smoothstep(0.997,1.0,z); illum+=sky*bright*fade*weight; fade*=decay; }
        gl_FragColor=vec4(color*illum*exposure,1.0); }` });
  const compositeMat = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false,
    uniforms: { colorTex: { value: null }, shaftsTex: { value: shaftsRT.texture }, strength: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader: `uniform sampler2D colorTex,shaftsTex; uniform float strength; varying vec2 vUv; void main(){vec4 c=texture2D(colorTex,vUv);c.rgb+=texture2D(shaftsTex,vUv).rgb*strength;gl_FragColor=c;}` });
  let enabled = false, depthRequested = false, amount = 0, sunColor = new THREE.Color('#fff0d0'), sunDirection = new THREE.Vector3(0,1,0);
  function resize(w, h) { const sw=Math.max(2,w>>1),sh=Math.max(2,h>>1); if(shaftsRT.width!==sw||shaftsRT.height!==sh)shaftsRT.setSize(sw,sh); if(outRT.width!==w||outRT.height!==h)outRT.setSize(w,h); }
  const removePass = fx.addAfterScene((source, view) => {
    if (!enabled || amount <= 0 || !source.depthTexture) return null;
    if(sunDirection.y<=0.02)return null;
    const p=view.position.clone().addScaledVector(sunDirection,100).project(view);
    const uv=new THREE.Vector2((p.x+1)*0.5,(p.y+1)*0.5); if(p.z < -1 || p.z > 1 || uv.x<0||uv.x>1||uv.y<0||uv.y>1)return null;
    resize(source.width,source.height); const prev=renderer.getRenderTarget();
    shaftMat.uniforms.depthTex.value=source.depthTexture; shaftMat.uniforms.sceneTex.value=source.texture; shaftMat.uniforms.sunUv.value.copy(uv); shaftMat.uniforms.color.value.copy(sunColor);
    quad.material=shaftMat; renderer.setRenderTarget(shaftsRT); renderer.render(scene,camera);
    compositeMat.uniforms.colorTex.value=source.texture; compositeMat.uniforms.strength.value=amount;
    quad.material=compositeMat; renderer.setRenderTarget(outRT); renderer.render(scene,camera); renderer.setRenderTarget(prev); return outRT;
  });
  return { set({ enabled: on, depthRequired = false, strength = amount, color = sunColor, direction } = {}) { enabled=!!on; amount=Math.max(0,Math.min(2,strength)); sunColor.set(color); if(direction)sunDirection.set(direction.x,direction.y,direction.z).normalize(); if(enabled&&!depthRequested){fx.useDepth(true);depthRequested=true;} else if(!enabled&&depthRequested&&!depthRequired){fx.useDepth(false);depthRequested=false;} }, dispose(){removePass();shaftsRT.dispose();outRT.dispose();shaftMat.dispose();compositeMat.dispose();} };
}
