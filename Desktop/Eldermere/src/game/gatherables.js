import { OBJECTS } from '../data/objects.js';
import { buildHerbariumSpecimen } from '../gfx/herbariumModel.js';
import { topAt } from './physics.js';
export function createGatherables(THREE,scene,dungeon,origin,shapes){
  const entries=[],solid=shapes.filter(s=>s.type==='box'&&!s.trim&&!s.prop);
  for(const o of dungeon.objects||[]){
    if(OBJECTS[o.type]?.cat!=='gatherable')continue;
    const root=buildHerbariumSpecimen(THREE,o.type);if(!root)continue;
    const x=origin.x+o.x,z=origin.z+o.z,floor=origin.y+o.layer*10;let y=-Infinity;
    for(const s of solid){const top=topAt(s,x,z);if(top>=floor-0.6&&top<=floor+9.9&&top>y)y=top;}
    if(y===-Infinity)for(const s of solid){const top=topAt(s,x,z);if(top>=floor-10.6&&top<floor-0.6&&top>y)y=top;}
    if(y===-Infinity)y=floor;
    root.position.set(x,y,z);root.rotation.y=-(o.rot||0)*Math.PI/180;root.userData.gatherableId=o.id;
    scene.add(root);entries.push({object:o,root});
  }
  function update(now=Date.now()){
    for(const e of entries){const until=e.object.harvestedUntil||0;if(until&&until<=now)delete e.object.harvestedUntil;e.root.visible=!e.object.harvestedUntil||e.object.harvestedUntil<=now;}
  }
  function dispose(){for(const e of entries){scene.remove(e.root);e.root.traverse(o=>{if(!o.isMesh)return;o.geometry?.dispose?.();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose?.());else o.material?.dispose?.();});}entries.length=0;}
  update();return {update,dispose,entries};
}
