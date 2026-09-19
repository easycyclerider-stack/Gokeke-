import { NextResponse } from "next/server";
export async function POST(req: Request) {
 const secret=process.env.GOKEKE_CRON_SECRET;
 const auth=req.headers.get("authorization");
 if(!secret||auth!==`Bearer ${secret}`) return new NextResponse("Unauthorized",{status:401});
 const base=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!base||!key)return NextResponse.json({error:"Supabase server configuration missing"},{status:503});
 const r=await fetch(`${base}/functions/v1/reconcile-flutterwave-refunds`,{method:"POST",headers:{Authorization:`Bearer ${secret}`,Content-Type:"application/json",apikey:key},cache:"no-store"});
 const text=await r.text();return new NextResponse(text,{status:r.status,headers:{"Content-Type":"application/json"}});
}