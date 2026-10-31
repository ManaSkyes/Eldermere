// Game-style hair: a close scalp underlayer plus a few broad, overlapping hair panels.
// Panels are authored in the character's bind-pose coordinates and skinned to the head.
// No strand bundles, per-strand simulation, or face-crossing tube geometry.
export function createHairMeshes(THREE, { headBone, skeleton }) {
  const capMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, side: THREE.DoubleSide });
  const panelMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, side: THREE.DoubleSide, vertexColors: true });
  const cap = new THREE.SkinnedMesh(new THREE.BufferGeometry(), capMat);
  const panels = new THREE.SkinnedMesh(new THREE.BufferGeometry(), panelMat);
  for (const m of [cap, panels]) { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; m.renderOrder = 2; }
  let lodLevel=0, last=null, colors=['#e6e1ea','#e6e1ea'], blend=0;
  let info={locks:0,tris:0};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const V=(x,y,z)=>({x,y,z});
  const add=(a,b,s=1)=>V(a.x+b.x*s,a.y+b.y*s,a.z+b.z*s);
  const mix=(a,b,t)=>V(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,a.z+(b.z-a.z)*t);
  const norm=a=>{const l=Math.hypot(a.x,a.y,a.z)||1;return V(a.x/l,a.y/l,a.z/l);};
  const skin=g=>{
    const n=g.getAttribute('position').count, si=new Uint16Array(n*4), sw=new Float32Array(n*4);
    for(let i=0;i<n;i++){si[i*4]=headBone;sw[i*4]=1;}
    g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(si,4));
    g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(sw,4));
  };
  function headBounds(headIds,P){
    const mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];
    for(const i of headIds)for(let k=0;k<3;k++){const q=P[i*3+k];mn[k]=Math.min(mn[k],q);mx[k]=Math.max(mx[k],q);}
    return {c:V((mn[0]+mx[0])/2,(mn[1]+mx[1])/2,(mn[2]+mx[2])/2),r:V((mx[0]-mn[0])/2,(mx[1]-mn[1])/2,(mx[2]-mn[2])/2)};
  }
  function scalpPoint(v,P,N){
    const a=v.a*3,b=v.b*3,t=v.t||0;
    const p=V(P[a]+(P[b]-P[a])*t,P[a+1]+(P[b+1]-P[a+1])*t,P[a+2]+(P[b+2]-P[a+2])*t);
    const n=norm(V(N[a]+(N[b]-N[a])*t,N[a+1]+(N[b+1]-N[a+1])*t,N[a+2]+(N[b+2]-N[a+2])*t));
    return {p,n};
  }
  function build(scalp,headIds,P,N,sel,len,look){
    last={scalp,headIds,P:Float32Array.from(P),N:Float32Array.from(N),sel:{...sel},len:{...len},look:{...look}};
    const capGeo=new THREE.BufferGeometry();
    capGeo.setAttribute('position',new THREE.BufferAttribute(Float32Array.from(scalp.positions),3));
    capGeo.setIndex(scalp.tris);skin(capGeo);capGeo.computeVertexNormals();
    cap.geometry.dispose();cap.geometry=capGeo;

    const {c,r}=headBounds(headIds,P);
    // Sample the scalp map by its source-head interpolation. This avoids stale local
    // scalp coordinates and guarantees panel roots share the exact head bind space.
    const roots=[];
    for(const v of scalp.verts){
      if(!v||v.inner)continue;
      const {p,n}=scalpPoint(v,P,N);
      const x=(p.x-c.x)/(r.x||1),y=(p.y-c.y)/(r.y||1),z=(p.z-c.z)/(r.z||1);
      roots.push({p,n,x,y,z});
    }
    const choose=(fn,target)=>roots.filter(fn).sort((a,b)=>Math.abs(a.x-target)-Math.abs(b.x-target));
    const front=choose(a=>a.z>.20&&a.y>.05,0);
    const crown=choose(a=>a.y>.30&&a.z<.25,0);
    const rear=choose(a=>a.z<-.30&&a.y>-.35,0);
    const sideL=choose(a=>a.x<-.48&&a.y>-.48,-.72);
    const sideR=choose(a=>a.x>.48&&a.y>-.48,.72);
    const pick=(arr,i,count=1)=>arr.length?arr[Math.min(arr.length-1,Math.floor((i+.5)*arr.length/Math.max(1,count)))]:roots[Math.floor(roots.length*.5)];
    const style=Number(sel.main)||0, mainScale=Math.exp((len.main||0)*.69);
    const volume=clamp(Number(look.volume)||1,.8,1.35);
    const paths=[];
    // Two crown-to-back panels overlap over the skull and continue behind the shoulders.
    for(let i=0;i<2;i++){const a=pick(crown,i,2);if(a)paths.push({a,kind:'back',side:i?1:-1,length:(style===8?.95:style===9?1.4:style===10?.55:2.35)*mainScale,width:.48*volume});}
    // Rear panels form one continuous back silhouette rather than a hanging tube column.
    for(let i=0;i<3;i++){const a=pick(rear,i,3);if(a)paths.push({a,kind:'back',side:(i-1)*.55,length:(style===8?.92:style===10?.55:2.5)*mainScale,width:.52*volume});}
    // Side panels follow the temples outward and then fall beside the face/neck.
    for(const [arr,s] of [[sideL,-1],[sideR,1]]){const a=pick(arr,0);if(a)paths.push({a,kind:'side',side:s,length:(style===8?.92:style===10?.55:2.05)*mainScale,width:.34*volume});}
    // Front hairline is swept backward over the crown; it never hangs over the face.
    const f=pick(front,0);if(f&&sel.bangs!==5)paths.push({a:f,kind:'front',side:0,length:.55,width:.34*volume});

    const pos=[],col=[],idx=[];
    const rootC=new THREE.Color(colors[0]),tipC=new THREE.Color(colors[1]);
    const longitudinal=lodLevel===0?12:lodLevel===1?8:5, across=lodLevel===0?8:lodLevel===1?6:4;
    const panelList=lodLevel===0?paths:paths.filter((p,i)=>i% (lodLevel===1?1:2)===0);
    for(const path of panelList){
      const {a,kind,side,length,width}=path, start=add(a.p,a.n,.028);
      let p1,p2,end;
      if(kind==='front'){
        p1=add(start,V(0,.12,-.25),1);
        p2=add(start,V(side*.02,.08,-.55),1);
        end=V(start.x,start.y-.18,start.z-.82);
      }else if(kind==='side'){
        p1=add(start,V(side*.10,.04,-.08));
        p2=add(start,V(side*.28,-length*.38,-.12));
        end=V(start.x+side*.34,start.y-length,start.z-.10);
      }else{
        p1=add(start,V(side*.08,.08,-.30));
        p2=add(start,V(side*.10,-length*.38,-.48));
        end=V(start.x+side*.10,start.y-length,start.z-.62);
      }
      const base=pos.length/3;
      for(let s=0;s<=longitudinal;s++){
        const t=s/longitudinal,u=1-t;
        const center=V(
          u*u*u*start.x+3*u*u*t*p1.x+3*u*t*t*p2.x+t*t*t*end.x,
          u*u*u*start.y+3*u*u*t*p1.y+3*u*t*t*p2.y+t*t*t*end.y,
          u*u*u*start.z+3*u*u*t*p1.z+3*u*t*t*p2.z+t*t*t*end.z
        );
        // Broad panel width is oriented across the head, not around a tube axis.
        let axis=kind==='side'?V(0,0,1):V(1,0,0);
        if(kind==='front')axis=V(1,0,0);
        const taper=.78+.22*Math.sin(Math.PI*t*.82);
        const w=width*taper*(.55+.45*(1-t));
        for(let j=0;j<=across;j++){
          const v=j/across-.5;
          const p=add(center,axis,v*w);
          // A small crown lift only; panels stay close to skull at their roots.
          p.y+=kind==='front'?0.012*Math.sin(Math.PI*t):0.018*Math.sin(Math.PI*t);
          pos.push(p.x,p.y,p.z);
          const cc=rootC.clone().lerp(tipC,clamp(t*.62+blend*.12,0,1));
          const shade=.94+.06*Math.cos(v*Math.PI);
          col.push(cc.r*shade,cc.g*shade,cc.b*shade);
          if(s<longitudinal&&j<across){
            const q=base+s*(across+1)+j, q1=q+1, q2=q+across+1, q3=q2+1;
            idx.push(q,q1,q2,q1,q3,q2);
          }
        }
      }
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
    g.setIndex(idx);skin(g);g.computeVertexNormals();
    panels.geometry.dispose();panels.geometry=g;
    info={locks:panelList.length,tris:idx.length/3};
    capMat.color.set(colors[0]);
  }
  function setColors(root,tip=root,b=0){
    colors=[root,tip];blend=b;capMat.color.set(root);
    const attr=panels.geometry.getAttribute('color');
    if(attr){const a=new THREE.Color(root),z=new THREE.Color(tip);const across=lodLevel===0?8:lodLevel===1?6:4,longitudinal=lodLevel===0?12:lodLevel===1?8:5;const row=across+1,span=(longitudinal+1)*row;
      for(let i=0;i<attr.count;i++){const local=i%span,t=Math.floor(local/row)/longitudinal,v=(local%row)/across-.5;const q=a.clone().lerp(z,clamp(t*.62+b*.12,0,1));const shade=.94+.06*Math.cos(v*Math.PI);attr.setXYZ(i,q.r*shade,q.g*shade,q.b*shade);}attr.needsUpdate=true;}
  }
  function setLod(v){const n=v==null?0:clamp(Math.round(v),0,2);if(n===lodLevel)return;lodLevel=n;if(last)build(last.scalp,last.headIds,last.P,last.N,last.sel,last.len,last.look);}
  return {meshes:[cap,panels],build,setColors,setLod,reset(){},get info(){return info;},get lodLevel(){return lodLevel;}};
}
