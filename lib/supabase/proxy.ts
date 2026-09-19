import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          for (const [key, value] of headers.entries()) response.headers.set(key, value);
        },
      },
    },
  );

  const { data: claimsData } = await supabase.auth.getClaims();
  const pathname = request.nextUrl.pathname;
  const publicPath = pathname === '/' || pathname.startsWith('/auth') || pathname.startsWith('/api/cron') || pathname.startsWith('/api/route');
  if (!claimsData?.claims && !publicPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (claimsData?.claims) {
    const userId = claimsData.claims.sub;
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
    const role = profile?.role;
    if (pathname.startsWith('/admin') && role !== 'admin') return NextResponse.redirect(new URL('/auth', request.url));
    if (pathname.startsWith('/driver') && role !== 'driver') return NextResponse.redirect(new URL('/auth', request.url));
    if ((pathname.startsWith('/passenger') || pathname.startsWith('/ride')) && role !== 'passenger') return NextResponse.redirect(new URL('/auth', request.url));
  }
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
