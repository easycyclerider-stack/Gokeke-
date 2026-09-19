import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  const secret = process.env.GOKEKE_CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({error:'Unauthorized'},{status:401});

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({error:'Server configuration incomplete'},{status:500});

  const supabase = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:expired,error:expireError}=await supabase.rpc('expire_ride_offers');
  if(expireError)return NextResponse.json({error:expireError.message},{status:500});

  const {data:rides,error}=await supabase.from('rides').select('id').eq('status','requested').limit(100);
  if(error)return NextResponse.json({error:error.message},{status:500});

  let recovered=0;
  for(const ride of rides??[]){
    const {data:n,error:e}=await supabase.rpc('recover_stale_ride_dispatch',{p_ride_id:ride.id});
    if(!e) recovered+=Number(n||0);
  }
  let push_delivery:any={status:'skipped'};
  const pushUrl=url + '/functions/v1/send-push-notifications';
  try{
    const pr=await fetch(pushUrl,{method:'POST',headers:{Authorization:'Bearer '+key}});
    const body=await pr.json().catch(()=>({}));
    push_delivery={status:pr.ok?'ok':'error',...body};
  }catch(e:any){push_delivery={status:'error',error:e?.message||'Push delivery request failed'};}
  return NextResponse.json({ok:true,expired_offers:expired??0,rides_checked:rides?.length??0,offers_created:recovered,push_delivery});
}
