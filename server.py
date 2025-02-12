from aiohttp import web
import ssl

async def handle(request):
    name = request.match_info.get('name', 'index.html')
    try:
        with open(name, 'rb') as f:
            content = f.read()
        if name.endswith('.html'):
            content_type = 'text/html'
        elif name.endswith('.js'):
            content_type = 'application/javascript'
        elif name.endswith('.css'):
            content_type = 'text/css'
        else:
            content_type = 'application/octet-stream'
        return web.Response(body=content, content_type=content_type)
    except FileNotFoundError:
        return web.Response(status=404, text='404: Not Found')

app = web.Application()
app.router.add_get('/', handle)
app.router.add_get('/{name}', handle)

ssl_context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
ssl_context.load_cert_chain('localhost.crt', 'localhost.key')

if __name__ == '__main__':
    web.run_app(app, ssl_context=ssl_context, port=8443) 