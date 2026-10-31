// Conventional game hair built from a fitted under-cap and a small number of broad, overlapping locks.
// Geometry is authored only when the hairstyle, head shape, or LOD changes. No strand simulation.
export function createHairMeshes(THREE, { headBone, skeleton }) {
  const capMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, side: THREE.DoubleSide });
  const lockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.68, side: THREE.DoubleSide, vertexColors: true });
  const cap = new THREE.SkinnedMesh(new THREE.BufferGeometry(), capMat);
  const locks = new THREE.SkinnedMesh(new THREE.BufferGeometry(), lockMat);
  for (const m of [cap, locks]) { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; m.renderOrder = 2; m.bind(skeleton); }
  let info = { locks: 0, tris: 0 }, lodLevel = 0, colors = ['#e6e1ea', '#e6e1ea'], blend = 0, last = null;

  function skin(g, count) {
    const ids = new Uint16Array(count * 4), weights = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) { ids[i * 4] = headBone; weights[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(ids, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const vec = (x, y, z) => ({ x, y, z });
  const norm = v => { const l = Math.hypot(v.x, v.y, v.z) || 1; return vec(v.x/l, v.y/l, v.z/l); };
  const add = (a,b,s=1) => vec(a.x+b.x*s,a.y+b.y*s,a.z+b.z*s);
  const mix = (a,b,t) => vec(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,a.z+(b.z-a.z)*t);

  function build(scalp, headIds, P, N, sel, len, look) {
    last = { scalp, headIds, P: Float32Array.from(P), N: Float32Array.from(N), sel: {...sel}, len: {...len}, look: {...look} };
    // The under-cap is exactly the fitted scalp surface. It is not enlarged into a helmet.
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(scalp.positions), 3));
    cg.setIndex(scalp.tris); skin(cg, scalp.verts.length); cg.computeVertexNormals();
    cap.geometry.dispose(); cap.geometry = cg;

    const bounds = [Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
    for (const i of headIds) for (let a=0;a<3;a++) { const v=P[i*3+a]; bounds[a]=Math.min(bounds[a],v); bounds[a+3]=Math.max(bounds[a+3],v); }
    const C=vec((bounds[0]+bounds[3])/2,(bounds[1]+bounds[4])/2,(bounds[2]+bounds[5])/2);
    const R=vec((bounds[3]-bounds[0])/2,(bounds[4]-bounds[1])/2,(bounds[5]-bounds[2])/2);
    const frontZ=C.z+R.z*.12, crownY=C.y+R.y*.2;
    // Select evenly distributed scalp anchors, then assign each a deliberate region and flow.
    const stride=Math.max(1,Math.floor(headIds.length/160)), anchors=[];
    for(let n=0;n<headIds.length;n+=stride){
      const i=headIds[n], p=vec(P[i*3],P[i*3+1],P[i*3+2]);
      if(p.y<C.y-R.y*.55) continue;
      const x=(p.x-C.x)/(R.x||1), z=(p.z-C.z)/(R.z||1), y=(p.y-C.y)/(R.y||1);
      const front=z>.16, side=Math.abs(x)>.48, rear=z<-.28;
      anchors.push({p,x,z,y,front,side,rear});
    }
    const density = lodLevel===1 ? .68 : lodLevel>=2 ? .36 : 1;
    const maxLocks = Math.max(12, Math.round((lodLevel===0?64:lodLevel===1?42:24)*density));
    // Stable spatial sampling: front hairline, both temples, crown, rear and nape all receive coverage.
    const buckets=[[],[],[],[],[],[]];
    for(const a of anchors){
      const region=a.front?(a.side?1:0):a.rear?(a.y<-.15?5:4):(a.side?2:3);
      buckets[region].push(a);
    }
    const selected=[];
    const quotas=[.22,.18,.16,.14,.20,.10].map(v=>Math.max(2,Math.round(maxLocks*v)));
    buckets.forEach((bucket,b)=>{
      const count=Math.min(bucket.length,quotas[b]);
      for(let k=0;k<count;k++) selected.push(bucket[Math.floor((k+.5)*bucket.length/count)]);
    });
    // Fill remaining slots from the complete surface without clustering.
    for(let k=0;selected.length<maxLocks && k<maxLocks*4;k++){
      const a=anchors[Math.floor((k+.5)*anchors.length/(maxLocks*4))];
      if(a && !selected.includes(a)) selected.push(a);
    }

    const positions=[], colorsOut=[], indices=[];
    const rootColor=new THREE.Color(colors[0]), tipColor=new THREE.Color(colors[1]);
    const rootShade=rootColor.clone().multiplyScalar(.82), tipShade=tipColor.clone().multiplyScalar(.96);
    const segs=lodLevel>=2?4:lodLevel===1?6:8, sides=lodLevel>=2?6:8;
    const style=Number(sel.main)||0, mainScale=Math.exp((len.main||0)*.69), bangScale=Math.exp((len.bangs||0)*.69);
    const volume=clamp(Number(look.volume)||1,.35,2);
    selected.forEach((a,index)=>{
      const {p,x,z,y,front,side,rear}=a, sign=Math.sign(x)||1;
      // Large style families share a stable base silhouette; length and shape presets alter the fall.
      let L=style===10?.48:style===8?.94:style===9?1.32:style===5?1.45:style===6?1.65:style===7?2.15:style===0||style===1||style===11||style===12||style===13||style===14||style===15?.82:2.55;
      L*=mainScale*(side?1.04:1);
      if(rear)L*=1.12;
      if(front)L*=.58;
      const isBang=front && y>.05 && sel.bangs!==5;
      if(isBang)L=(.34+bangScale*.30);
      const width=(isBang?.15:side?.235:.27)*volume*(lodLevel>=2?.92:1);
      // Locks hug the skull initially, then fall with gravity. Side locks sweep around the cheeks.
      const normal=norm(vec((p.x-C.x)/(R.x||1),(p.y-C.y)/(R.y||1),(p.z-C.z)/(R.z||1)));
      const tangent=norm(vec(sign*(side?.34:.10),-.72,rear?-.12:front?.24:-.34));
      const start=add(p,normal,.018);
      const control1=add(add(start,normal,.07),tangent,.16);
      let end;
      if(isBang) end=vec(p.x+sign*.025,p.y-L*.85,p.z+.12);
      else if(front||side) end=vec(p.x+sign*(side?.16:.10),p.y-L,p.z-.04);
      else end=vec(p.x+sign*.035,p.y-L,p.z-.10);
      const control2=mix(start,end,.62); control2.x+=sign*(side?.12:.035); control2.z-=.10;
      const base=positions.length/3;
      for(let s=0;s<=segs;s++){
        const t=s/segs,u=1-t;
        const center=vec(
          u*u*u*start.x+3*u*u*t*control1.x+3*u*t*t*control2.x+t*t*t*end.x,
          u*u*u*start.y+3*u*u*t*control1.y+3*u*t*t*control2.y+t*t*t*end.y,
          u*u*u*start.z+3*u*u*t*control1.z+3*u*t*t*control2.z+t*t*t*end.z
        );
        const tangentNow=norm(vec(
          3*u*u*(control1.x-start.x)+6*u*t*(control2.x-control1.x)+3*t*t*(end.x-control2.x),
          3*u*u*(control1.y-start.y)+6*u*t*(control2.y-control1.y)+3*t*t*(end.y-control2.y),
          3*u*u*(control1.z-start.z)+6*u*t*(control2.z-control1.z)+3*t*t*(end.z-control2.z)
        ));
        let sideVec=norm(vec(tangentNow.y*normal.z-tangentNow.z*normal.y,tangentNow.z*normal.x-tangentNow.x*normal.z,tangentNow.x*normal.y-tangentNow.y*normal.x));
        let upVec=norm(vec(tangentNow.y*sideVec.z-tangentNow.z*sideVec.y,tangentNow.z*sideVec.x-tangentNow.x*sideVec.z,tangentNow.x*sideVec.y-tangentNow.y*sideVec.x));
        const taper=Math.pow(1-t,.62), halfW=width*(.30+.70*taper);
        const depth=width*.24*(.35+.65*taper);
        for(let r=0;r<sides;r++){
          const ang=r/sides*Math.PI*2;
          const v=add(add(center,sideVec,Math.cos(ang)*halfW),upVec,Math.sin(ang)*depth);
          positions.push(v.x,v.y,v.z);
          const c=rootShade.clone().lerp(tipShade,clamp(t*.9+blend*.15,0,1));
          const shade=1-.10*Math.abs(Math.sin(ang));
          colorsOut.push(c.r*shade,c.g*shade,c.b*shade);
          if(s<segs){const next=base+s*sides+r, rn=base+s*sides+(r+1)%sides, down=next+sides, downR=base+(s+1)*sides+(r+1)%sides;indices.push(next,rn,down,rn,downR,down);}
        }
      }
    });
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setAttribute('color',new THREE.Float32BufferAttribute(colorsOut,3));
    g.setIndex(indices); skin(g,positions.length/3); g.computeVertexNormals();
    locks.geometry.dispose(); locks.geometry=g;
    info={locks:selected.length,tris:indices.length/3};
    setColors(colors[0],colors[1],blend);
  }
  function setColors(root,tip=root,b=0){
    colors=[root,tip];blend=b;
    const c=new THREE.Color(root);
    // Match the under-cap to the selected root color. Its edge is never intentionally exposed.
    capMat.color.copy(c);
    if(last) {
      const a=new THREE.Color(root), z=new THREE.Color(tip);
      const attr=locks.geometry.getAttribute('color');
      if(attr) for(let i=0;i<attr.count;i++){
        const sides=lodLevel>=2?6:8, segs=lodLevel>=2?4:lodLevel===1?6:8;\n        const t=Math.floor(i/sides)/segs;
        const q=a.clone().lerp(z,clamp(t*.55+b*.15,0,1)); attr.setXYZ(i,q.r,q.g,q.b);
      }
      if(attr) attr.needsUpdate=true;
    }
  }
  function setLod(v){
    const next=v==null?0:clamp(Math.round(v),0,2);
    if(next===lodLevel)return;
    lodLevel=next;
    if(last) build(last.scalp,last.headIds,last.P,last.N,last.sel,last.len,last.look);
  }
  return {meshes:[cap,locks],build,setColors,setLod,reset(){},get info(){return info;},get lodLevel(){return lodLevel;}};
}
