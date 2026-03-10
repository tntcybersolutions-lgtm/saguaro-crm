import { whitelabelHandler } from '../../../../sandbox-manager-route';
export { whitelabelHandler as POST };
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }});
}
