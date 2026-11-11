#!/usr/bin/env node
// Discovery only. Search results never become approved playback sources.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
const [leadsPath,outputPath]=process.argv.slice(2);
if(!leadsPath||!outputPath)throw Error('Usage: node discover-cartoonstv.mjs <leads.json> <output.json>');
const leads=JSON.parse(await readFile(leadsPath,'utf8'));
const key=process.env.YOUTUBE_DATA_API_KEY;
const results=[];
const normalize=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
for(const lead of leads.candidates){
  const record={id:lead.id,name:lead.name,query:lead.name+' official animation live',status:'PENDING',rightsReviewed:false,embedAllowed:false,regionStatus:'unknown',autoPublish:false,results:[],searchedAt:null,error:null};
  if(!key){record.error='API_KEY_NOT_CONFIGURED';results.push(record);continue;}
  try{
    const u=new URL('https://www.googleapis.com/youtube/v3/search');
    u.search=new URLSearchParams({part:'snippet',type:'video',eventType:'live',videoEmbeddable:'true',maxResults:'3',q:record.query,key}).toString();
    const response=await fetch(u,{signal:AbortSignal.timeout(12000)});
    if(!response.ok){record.error='YOUTUBE_API_HTTP_'+response.status;results.push(record);continue;}
    const data=await response.json();record.searchedAt=new Date().toISOString();
    record.results=(data.items||[]).filter(v=>v.id?.videoId&&v.snippet?.channelId).map(v=>({videoId:v.id.videoId,channelId:v.snippet.channelId,title:v.snippet.title,channelTitle:v.snippet.channelTitle,channelMatch:normalize(v.snippet.channelTitle).includes(normalize(lead.name))?'possible':'unverified',status:'PENDING',rightsReviewed:false,autoPublish:false}));
  }catch{record.error='YOUTUBE_API_UNAVAILABLE'}
  results.push(record);
}
await mkdir(dirname(outputPath),{recursive:true});
await writeFile(outputPath,JSON.stringify({version:1,source:leads.source,mode:'discovery-only',mediaStored:false,generatedAt:new Date().toISOString(),searched:results.filter(x=>x.searchedAt).length,candidates:results},null,2)+'\n');
console.log('Searches completed:',results.filter(x=>x.searchedAt).length,'pending:',results.length);
