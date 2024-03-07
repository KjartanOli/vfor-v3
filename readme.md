URL: https://vfor-v3.onrender.com

username: admin
password: 1234

Authentication is required to perform any non-read operation, i.e. any
non-GET HTTP verb.  Authentication is performed by sending a HTTP POST
to /login containing 'username' and 'password'.  Assuming the user
exists and the password is correct the server will respond with:
```json
{ "token": <token> }
```

This token is then used as the credentials in the Basic HTTP
Authorization scheme.  As such any request requiring authentication
should contain:
```
Authorization: Basic <token>
```
amongst its headers.
