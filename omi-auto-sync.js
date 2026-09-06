(function(){
'use strict';
const STORAGE_KEY='assignLite_v3_ai_semesters';
const SUPABASE_URL='https://oboyynqbwgrplqjkobup.supabase.co';
const SUPABASE_KEY='sb_publishable_dpD9UDTUoRUsip3x64V00A_YOdxizK2';
const FN=SUPABASE_URL+'/functions/v1/omi-classroom';
let running=false,client=null;
function load(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}catch{return {kids:[]}}}
async function sb(){if(client)return client;if(!window.supabase?.createClient)return null;client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});return client;}
async function call(token,kidId,action){const r=await fetch(FN,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token,'apikey':SUPABASE_KEY},body:JSON.stringify({action,kid_id:kidId})});return r.ok?r.json():null;}
async function run(){if(running||document.hidden)return;running=true;try{const c=await sb();if(!c)return;const {data:{session}}=await c.auth.getSession();if(!session)return;const kids=load().kids||[];for(const k of kids){if(!k?.id)continue;const status=await call(session.access_token,k.id,'status').catch(()=>null);if(status?.connection?.connected)await call(session.access_token,k.id,'sync').catch(()=>null);}}finally{running=false;}}
setTimeout(run,30000);
setInterval(run,5*60*1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)run();});
})();