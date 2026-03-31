#!/bin/sh
# Get K8s DNS resolver from /etc/resolv.conf
NAMESERVER=$(grep nameserver /etc/resolv.conf | head -1 | awk '{print $2}')
echo "Using DNS resolver: $NAMESERVER"

# Substitute into nginx config
sed -i "s|__RESOLVER__|$NAMESERVER|g" /etc/nginx/conf.d/default.conf

# Show final config for debugging
cat /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
