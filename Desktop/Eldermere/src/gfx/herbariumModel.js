import { PLANTS } from '../data/materials.js';
export function buildHerbariumSpecimen(THREE, id) {
  const p = PLANTS.find(x => x.id === id); if (!p) return null;
  const root = new THREE.Group();
  const mat = (color, roughness = 0.78) => new THREE.MeshStandardMaterial({ color, roughness, side: THREE.DoubleSide });
  const green = mat(0x548b42), leafMat = mat(0x78a84c), stemMat = mat(0x47783b), brown = mat(0x795335);
  const bloomColor = p.kind === 'food' ? 0xb84c46 : p.kind === 'ink' ? 0x9665b6 : p.id === 'sunCupTulip' ? 0xf1c84c : 0xd9a7d0;
  const bloomMat = mat(bloomColor), gold = mat(0xe7b844), red = mat(0xb84c46);
  const add = (geo, material, x, y, z, sx = 1, sy = 1, sz = 1, rz = 0) => {
    const m = new THREE.Mesh(geo, material); m.position.set(x,y,z); m.scale.set(sx,sy,sz); m.rotation.z=rz; m.castShadow=true; m.receiveShadow=true; root.add(m); return m;
  };
  const stem = (x,z,h,r=0.018) => add(new THREE.CylinderGeometry(r*0.65,r,h,7),stemMat,x,h/2,z);
  const leaf = (x,y,z,sx,sy,rz=0) => add(new THREE.SphereGeometry(1,8,6),leafMat,x,y,z,sx,sy,sx*0.35,rz);
  const flower = (x,y,z,size=0.11,n=5) => {
    for(let i=0;i<n;i++){const a=i*Math.PI*2/n;add(new THREE.SphereGeometry(1,9,7),bloomMat,x+Math.cos(a)*size*0.48,y,z+Math.sin(a)*size*0.48,size*0.46,size*0.72,size*0.32,-a);}
    add(new THREE.SphereGeometry(size*0.24,8,6),gold,x,y+size*0.12,z);
  };
  if(p.kind==='wood'){
    const h=p.id==='elderwood'?1.65:1.25; add(new THREE.CylinderGeometry(0.07,0.11,h,9),brown,0,h/2,0);
    for(let i=0;i<5;i++){const y=h*(0.58+i*0.095);if(p.id==='pine')add(new THREE.ConeGeometry(0.62-i*0.1,0.72,8),green,0,y,0);else add(new THREE.IcosahedronGeometry(0.4,1),green,(i%2?-1:1)*0.22,y,(i%3-1)*0.16,1.1,1,1);}
  } else if(p.kind==='fiber'){
    for(let i=0;i<7;i++){const a=i*Math.PI*2/7,x=Math.cos(a)*0.08,z=Math.sin(a)*0.08;stem(x,z,0.55+(i%3)*0.08,0.012);leaf(x+Math.cos(a)*0.12,0.25,z+Math.sin(a)*0.12,0.045,0.25,-a);}
  } else if(p.kind==='food'){
    for(let i=0;i<5;i++){const a=i*Math.PI*2/5,x=Math.cos(a)*0.12,z=Math.sin(a)*0.12;stem(x,z,0.42+(i%2)*0.1,0.014);leaf(x*1.8,0.24,z*1.8,0.11,0.22,-a);if(p.id==='wildBerry')add(new THREE.SphereGeometry(0.07,8,7),red,x*1.6,0.42,z*1.6);}
    if(p.id==='wheat')for(let i=0;i<5;i++)add(new THREE.ConeGeometry(0.035,0.16,5),gold,(i-2)*0.08,0.58,0);
  } else {
    const n=p.id==='sunCupTulip'?1:5;
    for(let i=0;i<n;i++){const a=i*Math.PI*2/n,x=Math.cos(a)*0.09,z=Math.sin(a)*0.09,h=0.48+(i%3)*0.1;stem(x,z,h);leaf(x-0.1,0.22,z+0.04,0.045,0.22,-0.45);leaf(x+0.1,0.3,z-0.03,0.04,0.2,0.55);flower(x,h+0.035,z,p.id==='sunCupTulip'?0.16:0.105,p.id==='sunCupTulip'?6:5);}
  }
  const box=new THREE.Box3().setFromObject(root), center=box.getCenter(new THREE.Vector3());root.position.sub(center);
  root.userData.specimenSize=Math.max(0.6,box.getSize(new THREE.Vector3()).length());
  return root;
}
