import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => request.cookies.getAll(), setAll(cookiesToSet) { cookiesToSet.forEach(({name,value}) => request.cookies.set(name,value)); response=NextResponse.next({request}); cookiesToSet.forEach(({name,value,options}) => response.cookies.set(name,value,options)); } } });
  const { data } = await supabase.auth.getClaims();
  const pathname=request.nextUrl.pathname;
  const publicPath=pathname==='/'||pathname==='/admin/login'||pathname.startsWith('/auth')||pathname.startsWith('/api/cron')||pathname.startsWith('/api/route');
  if(!data?.claims&&!publicPath){const u=request.nextUrl.clone();u.pathname='/auth';u.searchParams.set('next',pathname);return NextResponse.redirect(u);}
  if(data?.claims){const {data:p}=await supabase.from('profiles').select('role').eq('id',data.claims.sub).maybeSingle();const role=p?.role;if(pathname.startsWith('/admin')&&pathname!=='/admin/login'&&role!=='admin')return NextResponse.redirect(new URL('/admin/login',request.url));if(pathname.startsWith('/driver')&&role!=='driver')return NextResponse.redirect(new URL('/auth',request.url));if((pathname.startsWith('/passenger')||pathname.startsWith('/ride'))&&role!=='passenger')return NextResponse.redirect(new URL('/auth',request.url));}
  response.headers.set('Cache-Control','private, no-store');return response;
}
