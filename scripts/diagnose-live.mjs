#!/usr/bin/env node
// Diagnostic only: no approval changes, no video IDs/titles/private URLs in logs.
import {readFile} from 'node:fs/promises';
const [snapshotPath,sourcesPath,country='PL']=process.argv.slice(2);
if(!snapshotPath||!sourcesPath)throw Error('Usage: diagnose-live.mjs <snapshot> <trusted-sources> [country]');
const library=JSON.parse(await readFile(snapshotPath,'utf8'));
const sources=JSON.parse(await readFile(sourcesPath,'utf8'));
const sourceMap=new Map(sources.map(s=>[s.id,s]));
const codes=['SOURCE_NOT_TRUSTED','METADATA_INVALID','AGE_RESTRICTED','RIGHTS_NOT_APPROVED','REGION_NOT_CONFIRMED'];
const counts=Object.fromEntries(codes.map(c=>[c,0]));
let total=0,eligible=0;
const metadataReasons={STATUS_UNAVAILABLE:0,NOT_EMBEDDABLE:0,SOURCE_EMBED_DISABLED:0,CHECKED_AT_MISSING:0,CHECKED_AT_STALE:0,CHECKED_AT_FUTURE:0};
const now=Date.now();
for(const v of library.videos??[]){
 if(v.sourceType!=='live')continue;
 total++;
 const s=sourceMap.get(v.sourceId);
 let reason=null;
 if(!s)reason='SOURCE_NOT_TRUSTED';
 else if(v.status!=='available'||v.embeddable!==true||s.embedAllowed!==true||
   !Number.isFinite(Date.parse(v.lastCheckedAt??v.checkedAt??''))||
   now-Date.parse(v.lastCheckedAt??v.checkedAt)>15*60_000||
   Date.parse(v.lastCheckedAt??v.checkedAt)>now+5*60_000)reason='METADATA_INVALID';
 else if(v.ageRating==='18+'||v.ageRating==='unknown'||s.ageRating==='18+')reason='AGE_RESTRICTED';
 else if(s.rightsReviewed!==true||!s.rightsEvidenceUrl?.startsWith('https://')||
   !['EMBED_ALLOWED','LICENSE_APPROVED'].includes(s.rightsMode??'REVIEW_REQUIRED'))reason='RIGHTS_NOT_APPROVED';
 else {
  const allowed=s.allowedCountries&&v.allowedCountries?s.allowedCountries.filter(x=>v.allowedCountries.includes(x)):(v.allowedCountries??s.allowedCountries);
  const blocked=[...(s.blockedCountries??[]),...(v.blockedCountries??[])];
  if((v.regionStatus??s.regionStatus)!=='allowed'||blocked.includes(country)||
    (allowed!==undefined&&!allowed.includes(country))||
    (allowed===undefined&&blocked.length===0))reason='REGION_NOT_CONFIRMED';
 }
 if(reason==='METADATA_INVALID'){
  const t=Date.parse(v.lastCheckedAt??v.checkedAt??'');
  if(v.status!=='available')metadataReasons.STATUS_UNAVAILABLE++;
  if(v.embeddable!==true)metadataReasons.NOT_EMBEDDABLE++;
  if(s.embedAllowed!==true)metadataReasons.SOURCE_EMBED_DISABLED++;
  if(!Number.isFinite(t))metadataReasons.CHECKED_AT_MISSING++;
  else if(now-t>15*60_000)metadataReasons.CHECKED_AT_STALE++;
  else if(t>now+5*60_000)metadataReasons.CHECKED_AT_FUTURE++;
 }
 if(reason)counts[reason]++;else eligible++;
}
console.log('LIVE diagnostic (first blocking reason per candidate; no identifiers):');
console.log('LIVE candidates:',total,'eligible:',eligible);
for(const code of codes)console.log(code+':',counts[code]);
for(const [code,count] of Object.entries(metadataReasons))console.log('  '+code+':',count);
