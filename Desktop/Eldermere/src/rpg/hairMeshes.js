// Conventional, low-cost game hair: a close fitted scalp underlayer and broad overlapping locks.
// No strand simulation, follower cards, or per-frame collision. All pieces are ordinary skinned meshes.
export function createHairMeshes(THREE, { headBone, skeleton }) {
  const meshes=[];
  const makeMesh=(material)=>{const g=new THREE.BufferGeometry(),m=new THREE.SkinnedMesh(g,material);m.frustumCulled=false;m.castShadow=true;m.receiveShadow=true;m.bind(skeleton);meshes.push(m);return m;};
  const mat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.72,side:THREE.DoubleSide});
  const capMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.9,side:THREE.DoubleSide});
  const cap=makeMesh(capMat),locks=makeMesh(mat);let info={locks:0,tris:0},lodLevel=0,colors=['#e6e1ea','#e6e1ea'];
  const setSkin=(g,n)=>{const si=new Uint16Array(n*4),sw=new Float32Array(n*4);for(let i=0;i<n;i++){si[i*4]=headBone;sw[i*4]=1;}g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(si,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(sw,4));};
  function build(scalp,headIds,P,N,sel,len,look){
    const cg=new THREE.BufferGeometry();cg.setAttribute('position',new THREE.BufferAttribute(Float32Array.from(scalp.positions),3));cg.setIndex(scalp.tris);setSkin(cg,scalp.verts.length);cg.computeVertexNormals();cap.geometry.dispose();cap.geometry=cg;
    const pos=[],uv=[],idx=[],bounds=[1e9,1e9,1e9,-1e9,-1e9,-1e9];
    for(const i of headIds)for(let a=0;a<3;a++){bounds[a]=Math.min(bounds[a],P[i*3+a]);bounds[a+3]=Math.max(bounds[a+3],P[i*3+a]);}
    const cx=(bounds[0]+bounds[3])*.5,cy=(bounds[1]+bounds[4])*.5,cz=(bounds[2]+bounds[5])*.5,rx=Math.max(.2,(bounds[3]-bounds[0])*.5),rz=Math.max(.2,(bounds[5]-bounds[2])*.5);
    const style=Math.max(0,Number(sel.main)||0),mainScale=Math.exp((len.main||0)*.69),bangScale=Math.exp((len.bangs||0)*.69),anchors=[],stride=Math.max(1,Math.floor(headIds.length/84));
    for(let n=0;n<headIds.length;n+=stride){const i=headIds[n],x=P[i*3],y=P[i*3+1],z=P[i*3+2];if(y<cy-.15)continue;anchors.push({x,y,z,front:z>cz+rz*.25,side:Math.abs(x-cx)>rx*.48});}
    anchors.forEach((a,k)=>{const L=(a.front?(.65+bangScale*.45):(.9+mainScale*(style===0?.35:style===1?.7:1.25)))*(a.side?1.12:1),w=(a.front?.16:.22)*(look.volume||1),seg=8,base=pos.length/3,dx=a.x-cx,dz=a.z-cz,rad=Math.hypot(dx/rx,dz/rz)||1,ox=dx/rx/rad,oz=dz/rz/rad;
      for(let q=0;q<=seg;q++){const t=q/seg,drop=L*t,sweep=(a.side?Math.sign(dx)*.1:0)+Math.sin(t*Math.PI)*((k%2?1:-1)*.035),x=a.x+ox*(.025+drop*.12)+sweep,y=a.y-drop*(a.front?.62:.88)+Math.sin(t*Math.PI)*.12,z=a.z+oz*(.025+drop*.08),width=w*(1-.82*t),sx=Math.abs(oz),sz=Math.abs(ox);pos.push(x-sx*width,y,z+sz*width,x+sx*width,y,z-sz*width);uv.push(0,t,1,t);if(q<seg){const j=base+q*2;idx.push(j,j+1,j+2,j+1,j+3,j+2);}}
    });
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);setSkin(g,pos.length/3);g.computeVertexNormals();locks.geometry.dispose();locks.geometry=g;info={locks:anchors.length,tris:idx.length/3};setColors(colors[0],colors[1],0);
  }
  function setColors(root,tip,blend=0){colors=[root,tip];const c=new THREE.Color(root),t=new THREE.Color(tip);cap.material.color.copy(c).multiplyScalar(.82);mat.color.copy(c).lerp(t,Math.max(0,Math.min(1,(blend+1)*.5)));}
  return {meshes,build,setColors,setLod(v){lodLevel=v??0;},reset(){},get info(){return info;},get lodLevel(){return lodLevel;}};
}
