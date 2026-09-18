export async function GET(request:Request){return Response.redirect(new URL('/work-tracker',request.url),303)}
