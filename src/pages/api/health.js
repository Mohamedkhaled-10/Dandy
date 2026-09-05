export async function GET() {
  return new Response(JSON.stringify({ status: 'ok', app: 'Dandy Cosmetics' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
