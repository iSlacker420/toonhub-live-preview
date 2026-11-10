#!/usr/bin/env node
// Publish only approved LIVE metadata. Preserve the existing isolated QA slots.
// Never infer rights from YouTube embeddability or expose private registry details.
import { readFile, writeFile } from 'node:fs/promises';
const [exportPath, registryPath] = process.argv.slice(2);
if (!exportPath || !registryPath) throw Error('Usage: node scripts/merge-approved-live.mjs <export> <qa-registry>');
const exported=JSON.parse(await readFile(exportPath,'utf8'));
const existing=JSON.parse(await readFile(registryPath,'utf8'));
if(exported.country!=='PL'||exported.ephemeral!==true||exported.mediaStored!==false||!Array.isArray(exported.items))throw Error('Invalid export');
if(existing.testOnly!==true||existing.rightsApproved!==false||!Array.isArray(existing.channels))throw Error('Invalid QA registry');
const approved=new Map();
for(const item of exported.items){
 const id=item.youtubeVideoId;
 if(item.provider!=='youtube'||item.sourceType!=='live'||item.rightsReviewed!==true||
    item.embedAllowed!==true||item.embeddable!==true||item.regionStatus!=='allowed'||
    !item.rightsEvidenceUrl?.startsWith('https://')||!/^[a-zA-Z0-9_-]{11}$/.test(id??'')||
    typeof item.title!=='string'||!item.title.trim())continue;
 approved.set('approved-'+id,{id:'approved-'+id,name:item.title.slice(0,120),youtubeId:id,simulated:false,approval:'reviewed'});
}
const base=existing.channels.filter(x=>x.approval!=='reviewed');
const channels=[...base,...approved.values()].slice(0,100);
if(JSON.stringify(channels)===JSON.stringify(existing.channels)){
 console.log('No eligible LIVE changes; preserve QA registry');
 process.exit(0);
}
const next={...existing,revision:existing.revision+1,updatedAt:new Date().toISOString(),channels};
await writeFile(registryPath,JSON.stringify(next,null,2)+'\n');
console.log('QA metadata updated: reviewed LIVE '+approved.size);
