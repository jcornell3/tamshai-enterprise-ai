#!/bin/bash
# Add tamshai-website client to Keycloak

# Configure credentials
/opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user admin \
  --password admin

# Check if client already exists
EXISTING=$(/opt/keycloak/bin/kcadm.sh get clients -r tamshai-corp -q clientId=tamshai-website --fields clientId 2>/dev/null | grep -c tamshai-website)

if [ "$EXISTING" -gt 0 ]; then
  echo "Client tamshai-website already exists"
  exit 0
fi

# Create the client
/opt/keycloak/bin/kcadm.sh create clients -r tamshai-corp \
  -s clientId=tamshai-website \
  -s 'name=Tamshai Corporate Website' \
  -s enabled=true \
  -s publicClient=true \
  -s standardFlowEnabled=true \
  -s directAccessGrantsEnabled=false \
  -s 'redirectUris=["http://localhost:8080/employee-services.html","http://localhost:8080/*","https://tamshai.local/employee-services.html","https://tamshai.local/*","https://www.tamshai.local/employee-services.html","https://www.tamshai.local/*","https://5.78.159.29/employee-services.html","https://5.78.159.29/*","https://tamshai.com/employee-services.html","https://tamshai.com/*","https://www.tamshai.com/employee-services.html","https://www.tamshai.com/*"]' \
  -s 'webOrigins=["http://localhost:8080","https://tamshai.local","https://www.tamshai.local","https://5.78.159.29","https://tamshai.com","https://www.tamshai.com"]' \
  -s 'defaultClientScopes=["openid","profile","email","roles"]' \
  -s 'attributes={"pkce.code.challenge.method":"S256"}'

echo "Client tamshai-website created successfully"
