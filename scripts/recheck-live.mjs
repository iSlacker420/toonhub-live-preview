#!/usr/bin/env node
// QA-only metadata revalidation using YouTube videos.list (1 quota unit/batch).
// Does not discover owners, grant rights, store media, or publish unreviewed streams.
import {readFile,writeFile} from 'node:fs/promises';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('Usage: recheck-live.mjs <snapshot> <output>');
const key=process.env.YOUTUBE_DATA_API_KEY;
if(!key)throw Error('YOUTUBE_DATA_API_KEY secret missing');
const snapshot=JSON.parse(await readFile(input,'utf8'));
const ids=[...new Set((snapshot.videos??[]).filter(v=>v.provider==='youtube'&&v.sourceType==='live'&&/^[a-zA-Z0-9_-]{11}$/.test(v.youtubeVideoId??'')).map(v=>v.youtubeVideoId))];
const checkedAt=new Date().toISOString();
let active=0;
for(let i=0;i<ids.length;i+=50){
 const batch=ids.slice(i,i+50);
 const url=new URL('https://www.googleapis.com/youtube/v3/videos');
 url.searchParams.set('part','snippet,status,contentDetails,liveStreamingDetails');
 url.searchParams.set('id',batch.join(','));
 url.searchParams.set('key',key);
 const response=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{accept:'application/json'}});
 if(!response.ok)throw Error('YouTube videos.list HTTP '+response.status+'; refusing to export stale metadata');
 const data=await response.json();
 const byId=new Map((data.items??[]).map(v=>[v.id,v]));
 for(const item of snapshot.videos){
  if(item.provider!=='youtube'||item.sourceType!=='live'||!batch.includes(item.youtubeVideoId))continue;
  const v=byId.get(item.youtubeVideoId);
  const live=v?.snippet?.liveBroadcastContent==='live'&&Boolean(v?.liveStreamingDetails?.actualStartTime)&&!v?.liveStreamingDetails?.actualEndTime;
  const region=v?.contentDetails?.regionRestriction;
  const eligible=live&&
   v.status?.privacyStatus==='public'&&v.status?.embeddable===true&&
   ['uploaded','processed'].includes(v.status?.uploadStatus)&&
   v.contentDetails?.contentRating?.ytRating!=='ytAgeRestricted'&&!region;
  // Owner identity is validated by the original scanner; reject changes in it.
  const sameOwner= !item.channelId || v?.snippet?.channelId===item.channelId;
  item.status=eligible&&sameOwner?'available':'unavailable';
  item.embeddable=Boolean(eligible&&sameOwner);
  item.checkedAt=checkedAt;
  if(item.status==='available')active++;
 }
}
snapshot.checkedAt=checkedAt;
await writeFile(output,JSON.stringify(snapshot,null,2)+'\n');
console.log('YouTube LIVE metadata checked:',ids.length,'active:',active,'(rights reviewed separately)');
