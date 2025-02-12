from http.server import HTTPServer, SimpleHTTPRequestHandler
import ssl

def run_server():
    server_address = ('localhost', 8000)
    httpd = HTTPServer(server_address, SimpleHTTPRequestHandler)
    
    # Create SSL context
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain('localhost.crt', 'localhost.key')
    
    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
    print('Server running on https://localhost:8000')
    httpd.serve_forever()

if __name__ == '__main__':
    run_server() 